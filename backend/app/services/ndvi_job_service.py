"""
Background NDVI/NDMI analysis job orchestration.

POST /fields creates the Field row and a `pending` NdviJob row in the same
request/transaction, then hands off to `run_ndvi_job` via FastAPI's
BackgroundTasks. `run_ndvi_job` runs *after* the HTTP response has already
been sent, so it cannot reuse the request-scoped `Depends(get_db)` session
(that generator would already be closed) — it opens and closes its own
SessionLocal() instead, mirroring the same lifecycle by hand.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Tuple

from geoalchemy2.shape import from_shape, to_shape
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.exceptions.custom_exceptions import FieldNotFoundError, JobNotFoundError
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.models.ndvi_job import NdviJob, NdviJobStatus
from app.schemas.field import FieldCreateRequest, FieldNdviLatestResponse, NdviHistoryItem
from app.services.geometry_validator import calculate_area_hectares, validate_polygon
from app.services.satellite.ndvi_processor import compute_ndvi

logger = logging.getLogger("app")


def create_field_with_job(
    db: Session, user_id: uuid.UUID, field_in: FieldCreateRequest
) -> Tuple[Field, NdviJob]:
    # Area is computed server-side, not trusted from the client (per the
    # README spec) — validate_polygon also enforces the min/max area bounds
    # the public /ndvi/analyze endpoint already applies.
    shapely_polygon = validate_polygon(field_in.geometry)
    area_hectares = calculate_area_hectares(shapely_polygon)
    postgis_geometry = from_shape(shapely_polygon, srid=4326)

    field = Field(
        user_id=user_id,
        name=field_in.name,
        geometry=postgis_geometry,
        area_hectares=area_hectares,
        district=field_in.district,
        crop=field_in.crop,
    )
    db.add(field)
    db.flush()  # get field.id before creating the related NdviJob row

    job = NdviJob(field_id=field.id, status=NdviJobStatus.pending)
    db.add(job)

    db.commit()
    db.refresh(field)
    db.refresh(job)
    return field, job


# compute_ndvi can block indefinitely on a hung CDSE call (BackgroundTasks
# has no kill switch), and a --reload restart orphans in-flight jobs as
# "running" forever. Normal jobs finish in well under a minute.
JOB_STALE_AFTER = timedelta(minutes=10)


def get_job_or_404(db: Session, job_id: uuid.UUID) -> NdviJob:
    job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
    if job is None:
        raise JobNotFoundError()
    # Watchdog on the polling read path: expire jobs stuck in "running" so
    # clients see a terminal status instead of spinning forever.
    if (
        job.status == NdviJobStatus.running
        and job.started_at is not None
        and datetime.now(timezone.utc) - job.started_at > JOB_STALE_AFTER
    ):
        logger.error(f"NDVI job {job_id} stuck in running past {JOB_STALE_AFTER}; marking failed")
        _fail_job(db, job, "Analysis timed out")
    return job


def _fail_job(db: Session, job: NdviJob, message: str) -> None:
    job.status = NdviJobStatus.failed
    job.error_message = message
    job.finished_at = datetime.now(timezone.utc)
    db.commit()


def run_ndvi_job(job_id: uuid.UUID) -> None:
    """
    BackgroundTasks target. Owns its own DB session end-to-end (see module
    docstring) — never reuses a request-scoped session.
    """
    db = SessionLocal()
    try:
        job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
        if job is None:
            logger.error(f"NDVI job {job_id} not found when background task ran")
            return

        job.status = NdviJobStatus.running
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        field = db.query(Field).filter(Field.id == job.field_id).first()
        if field is None:
            _fail_job(db, job, "Field no longer exists")
            return

        polygon = to_shape(field.geometry)

        try:
            result = compute_ndvi(polygon, area_hectares=field.area_hectares)
        except Exception as e:
            logger.error(f"NDVI job {job_id} analysis failed: {e}", exc_info=True)
            _fail_job(db, job, str(e))
            return

        # The field (and this job's own row, via cascade) may have been
        # deleted while compute_ndvi was running the multi-minute CDSE
        # fetch — e.g. a user clicking "try again" after the client-side
        # timeout, before this job actually finished. That's an expected
        # outcome of deletion and analysis being unsynchronized, not a bug:
        # re-check existence right before writing results instead of
        # letting the insert below crash on a foreign-key violation.
        if db.query(Field).filter(Field.id == field.id).first() is None:
            logger.info(f"NDVI job {job_id}: field {field.id} was deleted mid-analysis; discarding result")
            return

        history = NdviHistory(
            field_id=field.id,
            ndvi_mean=result.stats.mean,
            ndvi_min=result.stats.min,
            ndvi_max=result.stats.max,
            ndmi_mean=result.ndmi_stats.mean if result.ndmi_stats else None,
            ndmi_min=result.ndmi_stats.min if result.ndmi_stats else None,
            ndmi_max=result.ndmi_stats.max if result.ndmi_stats else None,
            # There's no single "scene date" concept here — compute_ndvi
            # temporal-means every cloud-free scene in the search window, so
            # the window's end date is used as the recorded image date (see
            # ndvi_processor.py's module docstring for why).
            satellite_image_date=result.source.date_range_end,
            cloud_cover_percent=result.source.max_cloud_cover_filter_percent,
            source_collection=result.source.collection,
            ndvi_png_url=result.visualization.image_url,
            ndmi_png_url=result.ndmi_visualization.image_url if result.ndmi_visualization else None,
        )
        db.add(history)
        db.flush()

        job.ndvi_history_id = history.id
        job.status = NdviJobStatus.done
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logger.error(f"NDVI job {job_id} failed unexpectedly", exc_info=True)
        db.rollback()
        try:
            job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
            if job is not None:
                _fail_job(db, job, "Unexpected internal error")
        except Exception:
            db.rollback()
    finally:
        db.close()


def get_field_ndvi(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> FieldNdviLatestResponse:
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    history_rows = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.desc())
        .all()
    )
    history_items = [NdviHistoryItem.model_validate(row) for row in history_rows]
    latest = history_items[0] if history_items else None
    return FieldNdviLatestResponse(latest=latest, history=history_items)
