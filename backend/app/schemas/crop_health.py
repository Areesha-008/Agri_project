from datetime import date
from typing import List

from pydantic import BaseModel


class NdviTrendPoint(BaseModel):
    date: date
    ndvi_mean: float


class CropHealthResponse(BaseModel):
    field_id: str
    health_score: int
    status_label: str
    baseline_district: str
    baseline_crop: str
    ndvi_trend: List[NdviTrendPoint]
