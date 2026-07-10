from typing import Literal

from pydantic import BaseModel

Mandi = Literal["faisalabad", "lahore", "multan"]


class MandiRateResponse(BaseModel):
    commodity: str
    urdu_name: str
    price_pkr_per_40kg: int
    change_pct: float
    history_7d: list[int]
