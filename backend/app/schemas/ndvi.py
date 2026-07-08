from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.geometry import PolygonGeometry


class NdviAnalyzeRequest(BaseModel):
    geometry: PolygonGeometry
    field_name: Optional[str] = Field(default=None, max_length=255)


class NdviColorStop(BaseModel):
    value: float
    color: str


class NdviStats(BaseModel):
    mean: float
    min: float
    max: float


class NdviVisualization(BaseModel):
    tile_url: str
    palette: List[str]
    min_value: float
    max_value: float


class NdviSourceInfo(BaseModel):
    collection: str
    image_date: date
    cloud_cover_percent: Optional[float] = None


class NdviAnalyzeResponse(BaseModel):
    geometry: PolygonGeometry
    stats: NdviStats
    visualization: NdviVisualization
    source: NdviSourceInfo
    area_hectares: Optional[float] = None