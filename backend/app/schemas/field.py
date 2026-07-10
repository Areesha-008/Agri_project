import uuid
from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.geometry import PolygonGeometry


class FieldCreateRequest(BaseModel):
    """POST /fields — saves just the boundary; NDVI/NDMI are computed
    server-side by a background job (see ndvi_job_service.py)."""

    name: str = Field(..., min_length=1, max_length=255)
    geometry: PolygonGeometry
    district: Optional[str] = Field(default=None, max_length=100)
    crop: Optional[str] = Field(default=None, max_length=50)


class FieldSaveRequest(BaseModel):
    """
    Deprecated — superseded by POST /fields, which triggers a real
    server-side NDVI/NDMI analysis job instead of trusting stats the
    frontend computed itself. Kept mounted at POST /fields/save for one
    release so any in-flight callers don't break; do not build new
    features against this.
    """

    name: str = Field(..., min_length=1, max_length=255)
    geometry: PolygonGeometry
    area_hectares: Optional[float] = None

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
    district: Optional[str] = None
    crop: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class FieldCreateResponse(BaseModel):
    field: FieldResponse
    job_id: uuid.UUID = Field(
        ..., description="Poll GET /fields/{field_id}/jobs/{job_id} for analysis status"
    )


class FieldListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    area_hectares: Optional[float] = None
    created_at: datetime


class NdviHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ndvi_mean: float
    ndvi_min: float
    ndvi_max: float
    ndmi_mean: Optional[float] = None
    ndmi_min: Optional[float] = None
    ndmi_max: Optional[float] = None
    satellite_image_date: date
    cloud_cover_percent: Optional[float] = None
    source_collection: str
    ndvi_png_url: Optional[str] = None
    ndmi_png_url: Optional[str] = None
    computed_at: datetime


class FieldNdviLatestResponse(BaseModel):
    latest: Optional[NdviHistoryItem] = None
    history: List[NdviHistoryItem] = Field(default_factory=list)