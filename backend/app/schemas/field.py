import uuid
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.geometry import PolygonGeometry

IrrigationType = Literal["irrigated", "rainfed"]


class FieldCreateRequest(BaseModel):
    """POST /fields — saves just the boundary; NDVI/NDMI are computed
    server-side by a background job (see ndvi_job_service.py)."""

    name: str = Field(..., min_length=1, max_length=255)
    geometry: PolygonGeometry
    district: Optional[str] = Field(default=None, max_length=100)
    crop: Optional[str] = Field(default=None, max_length=50)
    irrigation_type: Optional[IrrigationType] = None
    sowing_date: Optional[date] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class FieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    geometry: PolygonGeometry
    area_hectares: Optional[float] = None
    district: Optional[str] = None
    crop: Optional[str] = None
    irrigation_type: Optional[IrrigationType] = None
    sowing_date: Optional[date] = None
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
    ndre_mean: Optional[float] = None
    ndre_min: Optional[float] = None
    ndre_max: Optional[float] = None
    nbr2_mean: Optional[float] = None
    nbr2_min: Optional[float] = None
    nbr2_max: Optional[float] = None
    ndwi_mean: Optional[float] = None
    ndwi_min: Optional[float] = None
    ndwi_max: Optional[float] = None
    cci_mean: Optional[float] = None
    cci_min: Optional[float] = None
    cci_max: Optional[float] = None
    evi_mean: Optional[float] = None
    evi_min: Optional[float] = None
    evi_max: Optional[float] = None
    savi_mean: Optional[float] = None
    savi_min: Optional[float] = None
    savi_max: Optional[float] = None
    date_range_start: Optional[date] = None
    satellite_image_date: date
    cloud_cover_percent: Optional[float] = None
    source_collection: str
    ndvi_png_url: Optional[str] = None
    ndmi_png_url: Optional[str] = None
    ndre_png_url: Optional[str] = None
    nbr2_png_url: Optional[str] = None
    ndwi_png_url: Optional[str] = None
    cci_png_url: Optional[str] = None
    evi_png_url: Optional[str] = None
    savi_png_url: Optional[str] = None
    computed_at: datetime


class FieldNdviLatestResponse(BaseModel):
    latest: Optional[NdviHistoryItem] = None
    history: List[NdviHistoryItem] = Field(default_factory=list)