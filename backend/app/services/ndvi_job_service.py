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
from sqlalchemy import func
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
from app.services.satellite.ndvi_processor import compute_ndvi_periods, compute_weekly_tiles

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
# on its own — but that's the fast path (a skipped/no-data tile); a tile
# that actually finds cloud-free scenes can take close to a minute for the
# 8-band fetch + composite, and a wide window means many tiles in sequence
# within one job. A flat threshold sized for a narrow window (e.g. 20
# minutes for ~4 tiles in a 30-day request) false-fires on a wide window
# that's still genuinely progressing (a 365-day/~52-tile request measured
# taking over 20 minutes with zero tiles actually stuck) — and a false
# "failed" status is worse than a slow spinner: it un-disables the
# frontend's "Analyse this period" button (FieldReanalyzePanel's
# `isAnalyzing` goes false on any terminal status), so the user retries
# and now has two jobs racing the same field.
JOB_STALE_AFTER_FLOOR = timedelta(minutes=20)
JOB_STALE_AFTER_PER_TILE = timedelta(seconds=90)


def _job_stale_after(job: NdviJob) -> timedelta:
    """How long job can sit in "running" before the watchdog calls it stuck.
    Scales with the requested window's tile count (see compute_weekly_tiles)
    so a wide-window job legitimately still working isn't marked failed
    mid-flight; floored at the original flat 20 minutes for narrow/default
    windows where tile count alone would under-budget it."""
    if job.requested_start_date is None or job.requested_end_date is None:
        return JOB_STALE_AFTER_FLOOR
    tile_count = len(compute_weekly_tiles(job.requested_start_date, job.requested_end_date))
    return max(JOB_STALE_AFTER_FLOOR, JOB_STALE_AFTER_PER_TILE * tile_count)


def get_job_or_404(db: Session, job_id: uuid.UUID) -> NdviJob:
    job = db.query(NdviJob).filter(NdviJob.id == job_id).first()
    if job is None:
        raise JobNotFoundError()
    # Watchdog on the polling read path: expire jobs stuck in "running" so
    # clients see a terminal status instead of spinning forever.
    stale_after = _job_stale_after(job)
    if (
        job.status == NdviJobStatus.running
        and job.started_at is not None
        and datetime.now(timezone.utc) - job.started_at > stale_after
    ):
        logger.error(f"NDVI job {job_id} stuck in running past {stale_after}; marking failed")
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
    Writes one NdviHistory row for the tile [date_range_start,
    satellite_image_date] covers, updating an existing row in place if one
    already falls in that window instead of inserting a near-duplicate.

    This is a RANGE match, not just an exact-date one: compute_weekly_tiles
    anchors its 7-day grid to whatever end_date a given run happens to
    request, so re-running analysis on a different day shifts every tile's
    end date by however much time passed. Two runs of "the same real week"
    then produce different exact satellite_image_date values a few days
    apart, which an exact-date-only upsert can't tell apart from a genuinely
    new week — that's what let one field accumulate pairs of near-duplicate
    points a day or two apart instead of one point every 7 days. The
    exact-date ON CONFLICT below still runs as a fallback (real simultaneous
    same-date writes, e.g. two overlapping tiles), backed by
    uq_ndvi_history_field_id_satellite_image_date (migration 8a5201e2041d).

    The matched row's own satellite_image_date is left untouched — only its
    computed data is refreshed — so a point already on the chart doesn't
    jump position just because a later run's grid landed a few days off.

    The match is a symmetric interval-overlap test (new.start <=
    existing.end AND existing.start <= new.end), not just "does the
    existing row's date fall inside the new tile's window" — an
    existing-row-only check misses the reverse case (new tile's window
    starts before an existing row it still overlaps), which is exactly what
    let two runs anchored a few days apart each fail to see the other's
    row and both insert a "new" one for the same real week.

    # ponytail: select-then-branch (not atomic) for the range-match path —
    # a genuinely simultaneous pair of writes for the same field (two
    # concurrent jobs, confirmed to happen in practice: a stale "failed"
    # job status doesn't stop the underlying BackgroundTasks run, so a user
    # retrying can race the still-running original) could still both SELECT
    # before either INSERTs. Add row locking (`.with_for_update()`) if that
    # narrow race is ever observed to actually produce a duplicate; the
    # overlap-matching fix above already closes the far more common case
    # (sequential runs with differently-anchored grids).

    Extracted from run_ndvi_job so this — the actual duplicate-prevention
    guarantee — is exercised directly by test_ndvi_history_upsert.py without
    needing a real satellite call.
    """
    window_start = fields.get("date_range_start", fields["satellite_image_date"])
    window_end = fields["satellite_image_date"]
    existing_start = func.coalesce(NdviHistory.date_range_start, NdviHistory.satellite_image_date)
    existing = (
        db.query(NdviHistory)
        .filter(
            NdviHistory.field_id == field_id,
            NdviHistory.satellite_image_date >= window_start,
            existing_start <= window_end,
        )
        .order_by(NdviHistory.satellite_image_date.asc())
        .first()
    )
    if existing is not None:
        for key, value in fields.items():
            if key != "satellite_image_date":
                setattr(existing, key, value)
        existing.computed_at = datetime.now(timezone.utc)
        db.commit()
        return existing.id

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
