from fastapi import APIRouter

from app.schemas.ndvi import NdviAnalyzeRequest, NdviAnalyzeResponse
from app.services.satellite.ndvi_processor import compute_ndvi
from app.services.geometry_validator import calculate_area_hectares, validate_polygon

router = APIRouter(prefix="/ndvi", tags=["NDVI"])


@router.post("/analyze", response_model=NdviAnalyzeResponse)
def analyze_ndvi(request: NdviAnalyzeRequest):
    """
    Public endpoint — no authentication required.

    Accepts a GeoJSON polygon, validates it, queries Sentinel-2 via CDSE
    (openEO), computes NDVI, and returns stats plus an image URL + bounding
    box the frontend can overlay directly on the ESRI map. Nothing is
    persisted here; saving happens separately via POST /fields/save after
    the user logs in.
    """
    polygon = validate_polygon(request.geometry)
    area_hectares = calculate_area_hectares(polygon)

    result = compute_ndvi(polygon, area_hectares=area_hectares)
    return result