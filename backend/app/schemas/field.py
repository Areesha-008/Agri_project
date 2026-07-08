import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.geometry import PolygonGeometry


class FieldSaveRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    geometry: PolygonGeometry
    area_hectares: Optional[float] = None

    # NDVI info captured at the moment the user viewed the analysis,
    # so /fields/save can persist an NdviHistory row without recomputing.
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    satellite_image_date: date
    cloud_cover_percent: Optional[float] = None
    source_collection: str


class FieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    geometry: PolygonGeometry
    area_hectares: Optional[float] = None
    created_at: datetime
    updated_at: datetime


class FieldListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    area_hectares: Optional[float] = None
    created_at: datetime