"""
Mandi rate lookup — applies the per-city price multiplier at read time.

Multipliers come from the design (Faisalabad ×1, Lahore ×1.02, Multan
×0.975) and are intentionally not stored per-row: they're a presentation
detail of "how much pricier is this city than the Faisalabad reference",
not commodity data, so keeping them here means adding a fourth city later
is a one-line change instead of a data migration.
"""

from sqlalchemy.orm import Session

from app.models.mandi_rate import MandiRate
from app.schemas.mandi_rate import Mandi, MandiRateResponse

MANDI_MULTIPLIERS: dict[Mandi, float] = {
    "faisalabad": 1.0,
    "lahore": 1.02,
    "multan": 0.975,
}


def list_mandi_rates(db: Session, mandi: Mandi) -> list[MandiRateResponse]:
    multiplier = MANDI_MULTIPLIERS[mandi]
    rows = db.query(MandiRate).order_by(MandiRate.commodity).all()
    return [
        MandiRateResponse(
            commodity=row.commodity,
            urdu_name=row.urdu_name,
            price_pkr_per_40kg=round(row.base_price_pkr_per_40kg * multiplier),
            change_pct=row.change_pct,
            history_7d=row.history_7d,
        )
        for row in rows
    ]
