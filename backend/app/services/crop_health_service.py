"""
Crop health score + yield projection.

Transparent baseline formula (flagged in GAPS.md for the agronomy team to
refine once real models exist):

    health_score = clamp(round(latest_ndvi_mean / baseline_ndvi * 100), 0, 100)
    yield        = baseline_yield * (health_score / 100)

i.e. a field performing exactly at its district+crop's historical baseline
NDVI scores 100 and projects the full baseline yield; below/above that
scales proportionally, clamped to [0, 100] for the score (yield itself is
not clamped — a field can out-yield its baseline).
"""

import uuid
from typing import List, Optional

from sqlalchemy.orm import Session

from app.exceptions.custom_exceptions import FieldNotFoundError
from app.models.district_yield_baseline import DistrictYieldBaseline
from app.models.field import Field
from app.models.ndvi_history import NdviHistory
from app.schemas.crop_health import CropHealthResponse, NdviTrendPoint

DEFAULT_DISTRICT = "DEFAULT"
DEFAULT_CROP = "DEFAULT"


def _healthy_status_label(health_score: int) -> str:
    if health_score >= 75:
        return "Healthy"
    if health_score >= 40:
        return "Stressed"
    return "Critical"


def _get_baseline(db: Session, district: Optional[str], crop: Optional[str]) -> DistrictYieldBaseline:
    baseline = None
    if district and crop:
        baseline = (
            db.query(DistrictYieldBaseline)
            .filter(DistrictYieldBaseline.district == district, DistrictYieldBaseline.crop == crop)
            .first()
        )
    if baseline is None:
        baseline = (
            db.query(DistrictYieldBaseline)
            .filter(
                DistrictYieldBaseline.district == DEFAULT_DISTRICT,
                DistrictYieldBaseline.crop == DEFAULT_CROP,
            )
            .first()
        )
    return baseline


def compute_health_score(latest_ndvi_mean: float, baseline_ndvi: float) -> int:
    raw = round((latest_ndvi_mean / baseline_ndvi) * 100)
    return max(0, min(100, raw))


def project_yield(baseline: DistrictYieldBaseline, health_score: int) -> tuple[float, float]:
    factor = health_score / 100
    return (
        round(baseline.baseline_yield_maund_per_acre * factor, 2),
        round(baseline.baseline_yield_t_per_ha * factor, 2),
    )


def get_crop_health(db: Session, user_id: uuid.UUID, field_id: uuid.UUID) -> CropHealthResponse:
    field = db.query(Field).filter(Field.id == field_id, Field.user_id == user_id).first()
    if field is None:
        raise FieldNotFoundError()

    history_rows: List[NdviHistory] = (
        db.query(NdviHistory)
        .filter(NdviHistory.field_id == field_id)
        .order_by(NdviHistory.satellite_image_date.asc())
        .all()
    )

    baseline = _get_baseline(db, field.district, field.crop)

    if history_rows:
        latest_ndvi_mean = history_rows[-1].ndvi_mean
    else:
        # No analysis has completed yet — score against zero vegetation
        # signal rather than fabricating a number.
        latest_ndvi_mean = 0.0

    health_score = compute_health_score(latest_ndvi_mean, baseline.baseline_ndvi)
    yield_maund, yield_t_ha = project_yield(baseline, health_score)

    return CropHealthResponse(
        field_id=str(field.id),
        health_score=health_score,
        status_label=_healthy_status_label(health_score),
        yield_maund_per_acre=yield_maund,
        yield_t_per_ha=yield_t_ha,
        baseline_district=baseline.district,
        baseline_crop=baseline.crop,
        ndvi_trend=[
            NdviTrendPoint(date=row.satellite_image_date, ndvi_mean=row.ndvi_mean)
            for row in history_rows
        ],
    )
