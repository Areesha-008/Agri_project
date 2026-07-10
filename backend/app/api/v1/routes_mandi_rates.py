from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.mandi_rate import Mandi, MandiRateResponse
from app.services.mandi_rate_service import list_mandi_rates

router = APIRouter(prefix="/mandi-rates", tags=["Mandi Rates"])


@router.get("", response_model=list[MandiRateResponse])
def get_mandi_rates(
    mandi: Mandi = Query(default="faisalabad"),
    db: Session = Depends(get_db),
):
    """
    Public endpoint — prices aren't user-specific. Frontend passes the
    user's default_mandi setting (see /settings) as the `mandi` param.

    # TODO: real data source pending (see GAPS.md Gap 7) — backed by a
    # seeded reference table, not a live market feed.
    """
    return list_mandi_rates(db, mandi)
