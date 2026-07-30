"""
Runnable proof that the "stuck job" watchdog scales its timeout with the
requested window's tile count instead of a flat 20 minutes — a 365-day
reanalysis request was live-observed to still be genuinely progressing past
20 minutes with zero tiles actually stuck, and the flat threshold marked it
"failed" mid-flight. See _job_stale_after in ndvi_job_service.py.
"""

from datetime import date, timedelta

from app.models.ndvi_job import NdviJob
from app.services.ndvi_job_service import (
    JOB_STALE_AFTER_FLOOR,
    JOB_STALE_AFTER_PER_TILE,
    _job_stale_after,
)


def test_stale_after_uses_flat_floor_for_default_window():
    job = NdviJob(requested_start_date=None, requested_end_date=None)
    assert _job_stale_after(job) == JOB_STALE_AFTER_FLOOR


def test_stale_after_uses_flat_floor_for_narrow_window():
    # ~4 tiles for a 30-day window — per-tile budget is well under the floor.
    job = NdviJob(requested_start_date=date(2026, 1, 1), requested_end_date=date(2026, 1, 31))
    assert _job_stale_after(job) == JOB_STALE_AFTER_FLOOR


def test_stale_after_scales_up_for_wide_window():
    # ~26 tiles for a 6-month window — exceeds the flat floor.
    job = NdviJob(requested_start_date=date(2025, 10, 1), requested_end_date=date(2026, 3, 31))
    stale_after = _job_stale_after(job)
    assert stale_after > JOB_STALE_AFTER_FLOOR
    assert stale_after >= JOB_STALE_AFTER_PER_TILE * 20
