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
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.exceptions.custom_exceptions import FieldNotFoundError, JobNotFoundError
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.models.ndvi_job import NdviJob, NdviJobStatus
from app.schemas.field import FieldCreateRequest, FieldNdviLatestResponse, NdviHistoryItem
from app.schemas.ndvi_job import FieldReanalyzeRequest
from app.schemas.ndvi import NdviAnalyzeResponse
from app.services.geometry_validator import calculate_area_hectares, validate_polygon
from app.services.satellite.ndvi_processor import compute_ndvi_periods

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
        irrigation_type=field_in.irrigation_type,
        sowing_date=field_in.sowing_date,
    )
    db.add(field)
    db.flush()  # get field.id before creating the related NdviJob row

    job = NdviJob(
        field_id=field.id,
        status=NdviJobStatus.pending,
        requested_start_date=field_in.start_date,
        requested_end_date=field_in.end_date,
    )
    db.add(job)

    db.commit()
    db.refresh(field)
    db.refresh(job)
    return field, job


def create_reanalysis_job(db: Session, field: Field, body: FieldReanalyzeRequest) -> NdviJob:
    """Re-runs analysis for an already-saved field over a new date window —
    no new Field row, just a fresh NdviJob appending to its history."""
    job = NdviJob(
        field_id=field.id,
        status=NdviJobStatus.pending,
        requested_start_date=body.start_date,
        requested_end_date=body.end_date,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


# A single tile's CDSE call can block indefinitely (BackgroundTasks has no
# kill switch), and a --reload restart orphans in-flight jobs as "running"
# forever. Each tile in compute_ndvi_periods' loop is well under a minute
# on its own, but a wide window means more tiles in sequence within one
# job (30 days -> ~4, 90 days -> ~13) — generous on purpose so a
# legitimately-progressing wide-window job isn't killed mid-flight, while
# still catching a genuinely stuck one well before a user gives up waiting.
JOB_STALE_AFTER = timedelta(minutes=20)


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


def _history_fields(result: NdviAnalyzeResponse) -> dict:
    """
    One compute_ndvi_periods() bucket -> one NdviHistory row's column
    values. There's no single "scene date" concept here — each bucket is a
    temporal mean of every cloud-free scene in its ~week, so the bucket's
    end date is used as the recorded image date (see ndvi_processor.py's
    module docstring). Returns a plain dict (rather than building the
    NdviHistory directly) so run_ndvi_job can use the same field values for
    either an insert or an update — see its upsert-by-date there.
    """
    fields: dict = {
        "ndvi_mean": result.stats.mean,
        "ndvi_min": result.stats.min,
        "ndvi_max": result.stats.max,
        "ndvi_png_url": result.visualization.image_url,
        "date_range_start": result.source.date_range_start,
        "satellite_image_date": result.source.date_range_end,
        "cloud_cover_percent": result.source.max_cloud_cover_filter_percent,
        "source_collection": result.source.collection,
    }
    # Every secondary index shares the response's <key>_stats /
    # <key>_visualization shape and the row's <key>_mean/min/max/png_url
    # columns — map them in one loop instead of ~28 hand-written, easily
    # transposed assignments.
    for key in ("ndmi", "ndre", "nbr2", "ndwi", "cci", "evi", "savi"):
        stats = getattr(result, f"{key}_stats", None)
        vis = getattr(result, f"{key}_visualization", None)
        if stats is not None:
            fields[f"{key}_mean"] = stats.mean
            fields[f"{key}_min"] = stats.min
            fields[f"{key}_max"] = stats.max
        if vis is not None:
            fields[f"{key}_png_url"] = vis.image_url
    return fields


def upsert_history_row(db: Session, field_id: uuid.UUID, fields: dict) -> uuid.UUID:
    """
    Writes one NdviHistory row for (field_id, fields["satellite_image_date"]),
    updating it in place if a row for that field+date already exists instead
    of inserting a duplicate. A real INSERT ... ON CONFLICT upsert (not a
    select-then-branch) against uq_ndvi_history_field_id_satellite_image_date
    (migration 8a5201e2041d), so two callers committing for the same week at
    the same instant can't both see "no existing row" and both insert.
    Extracted from run_ndvi_job so this — the actual duplicate-prevention
    guarantee — is exercised directly by test_ndvi_history_upsert.py without
    needing a real satellite call.
    """
    stmt = (
        pg_insert(NdviHistory)
        .values(field_id=field_id, **fields)
        .on_conflict_do_update(
            index_elements=[NdviHistory.field_id, NdviHistory.satellite_image_date],
            set_={**fields, "computed_at": datetime.now(timezone.utc)},
        )
        .returning(NdviHistory.id)
    )
    history_id = db.execute(stmt).scalar_one()
    db.commit()
    return history_id


def run_ndvi_job(job_id: uuid.UUID) -> None:
    """
    BackgroundTasks target. Owns its own DB session end-to-end (see module
    docstring) — never reuses a request-scoped session.

    Uses compute_ndvi_periods, not compute_ndvi directly: it splits the
    requested window into ~weekly tiles and yields one result per tile
    (newest first), so ONE job can produce several weekly NdviHistory rows
    (a 30-day window -> up to ~4) instead of needing one job per week. Each
    yielded tile is written and committed here IMMEDIATELY, not batched —
    every tile is its own proven-fast (well under a minute) satellite call,
    but there are several of them per job, and a later tile being slow or
    failing must not lose the ones that already succeeded. A tile with no
    cloud-free scene is skipped by compute_ndvi_periods, not an error; the
    job only fails outright if EVERY tile came back empty.
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

        first_history_id = None
        try:
            for result in compute_ndvi_periods(
                polygon,
                area_hectares=field.area_hectares,
                start_date=job.requested_start_date,
                end_date=job.requested_end_date,
            ):
                # The field (and this job's own row, via cascade) may have
                # been deleted while a tile's CDSE fetch was running — e.g.
                # a user clicking "try again" after the client-side timeout,
                # before this job actually finished. That's an expected
                # outcome of deletion and analysis being unsynchronized, not
                # a bug: re-check existence before each write instead of
                # letting the insert crash on a foreign-key violation.
                if db.query(Field).filter(Field.id == field.id).first() is None:
                    logger.info(f"NDVI job {job_id}: field {field.id} deleted mid-analysis; stopping")
                    return
                history_id = upsert_history_row(db, field.id, _history_fields(result))
                if first_history_id is None:
                    first_history_id = history_id
        except Exception as e:
            # A mid-loop failure (rather than a per-tile skip, which
            # compute_ndvi_periods already swallows) still leaves any
            # already-committed tiles in place — only fail the job outright
            # if NOTHING was written at all.
            logger.error(f"NDVI job {job_id} analysis failed: {e}", exc_info=True)
            if first_history_id is None:
                _fail_job(db, job, str(e))
                return

        if first_history_id is None:
            _fail_job(db, job, "No cloud-free Sentinel-2 imagery found for this area/window")
            return

        job.ndvi_history_id = first_history_id
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


def get_job_history_items(db: Session, job: NdviJob) -> list[NdviHistory]:
    """
    The NdviHistory rows a completed job produced. Derived from
    field_id + computed_at >= job.started_at rather than a dedicated join
    table — one job can now write several weekly rows (see run_ndvi_job)
    and NdviJob.ndvi_history_id is a single FK kept only for back-compat/
    informational use. Every caller of reanalyze/create already guards
    against firing a second job for the same field while one is pending, so
    jobs for one field run sequentially in practice and this time-based
    scoping is safe. Returned oldest first (explicit ORDER BY) regardless of
    the write order (compute_ndvi_periods yields newest first).
    """
    if job.status != NdviJobStatus.done or job.started_at is None:
        return []
    return (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == job.field_id, NdviHistory.computed_at >= job.started_at)
        .order_by(NdviHistory.satellite_image_date.asc())
        .all()
    )


def get_field_ndvi(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> FieldNdviLatestResponse:
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    # satellite_image_date alone is day-granularity and, since re-analysis
    # can run more than once per day, no longer unique — computed_at breaks
    # ties by actual recency instead of leaving same-day order undefined.
    history_rows = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.desc(), NdviHistory.computed_at.desc())
        .all()
    )
    history_items = [NdviHistoryItem.model_validate(row) for row in history_rows]
    latest = history_items[0] if history_items else None
    return FieldNdviLatestResponse(latest=latest, history=history_items)
