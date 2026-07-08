"""
NDVI computation pipeline.

Flow:
1. Convert the validated Shapely polygon into an Earth Engine geometry.
2. Query the Sentinel-2 collection, filtered by the polygon, a recent date
   window, and a max cloud-cover threshold.
3. Pick the most recent (least cloudy) image in that window.
4. Compute NDVI = (NIR - RED) / (NIR + RED) using Sentinel-2 bands B8 (NIR)
   and B4 (Red).
5. Clip to the polygon and compute mean/min/max NDVI stats.
6. Generate a map tile URL with a brown-to-green visualization palette, so
   the frontend can overlay it directly on the ESRI map.

This runs synchronously for Module 1 — the route calls `compute_ndvi()`
directly and waits for the result. If this becomes a bottleneck later
(e.g. for large areas or additional modules), this is the function boundary
where a background job / task queue would be introduced without touching
the API route.
"""

import logging
from datetime import datetime, timedelta, timezone

import ee
from shapely.geometry import Polygon

from app.core.config import settings
from app.exceptions.custom_exceptions import EarthEngineError, NoSatelliteImageFoundError
from app.schemas.ndvi import NdviAnalyzeResponse, NdviSourceInfo, NdviStats, NdviVisualization
from app.services.earth_engine.ee_client import ensure_initialized

logger = logging.getLogger("app")

# Brown -> yellow -> green palette for NDVI visualization.
# Low NDVI (bare soil / no vegetation) = brown.
# Mid NDVI (moderate vegetation) = yellow.
# High NDVI (healthy vegetation) = green.
NDVI_PALETTE = [
    "8B4513",  # brown - little/no vegetation
    "D2B48C",  # tan
    "F0E68C",  # khaki/yellow - moderate vegetation
    "9ACD32",  # yellow-green
    "228B22",  # forest green - healthy vegetation
    "006400",  # dark green - very healthy vegetation
]
NDVI_MIN_DISPLAY = -0.2
NDVI_MAX_DISPLAY = 0.9


def _shapely_polygon_to_ee_geometry(polygon: Polygon) -> "ee.Geometry":
    coords = [list(polygon.exterior.coords)]
    return ee.Geometry.Polygon(coords)


def _get_latest_clear_image(ee_geometry: "ee.Geometry"):
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=settings.NDVI_SEARCH_WINDOW_DAYS)

    collection = (
        ee.ImageCollection(settings.SENTINEL2_COLLECTION)
        .filterBounds(ee_geometry)
        .filterDate(start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"))
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", settings.MAX_CLOUD_COVER_PERCENT))
        .sort("CLOUDY_PIXEL_PERCENTAGE")
    )

    image_count = collection.size().getInfo()
    if image_count == 0:
        raise NoSatelliteImageFoundError(
            f"No Sentinel-2 image found within the last "
            f"{settings.NDVI_SEARCH_WINDOW_DAYS} days with cloud cover below "
            f"{settings.MAX_CLOUD_COVER_PERCENT}%. Try a different area."
        )

    return collection.first()


def compute_ndvi(polygon: Polygon, area_hectares: float | None = None) -> NdviAnalyzeResponse:
    """
    Main synchronous NDVI pipeline entry point.

    Raises EarthEngineError or NoSatelliteImageFoundError on failure —
    both are AppException subclasses, so the global exception handler
    turns them into clean JSON error responses.
    """
    ensure_initialized()

    try:
        ee_geometry = _shapely_polygon_to_ee_geometry(polygon)
        image = _get_latest_clear_image(ee_geometry)

        image_info = image.getInfo()
        image_date_ms = image_info["properties"]["system:time_start"]
        image_date = datetime.fromtimestamp(image_date_ms / 1000, tz=timezone.utc).date()
        cloud_cover = image_info["properties"].get("CLOUDY_PIXEL_PERCENTAGE")

        nir = image.select("B8")
        red = image.select("B4")
        ndvi_image = nir.subtract(red).divide(nir.add(red)).rename("NDVI").clip(ee_geometry)

        stats = ndvi_image.reduceRegion(
            reducer=ee.Reducer.mean()
            .combine(ee.Reducer.min(), sharedInputs=True)
            .combine(ee.Reducer.max(), sharedInputs=True),
            geometry=ee_geometry,
            scale=10,
            maxPixels=1e9,
        ).getInfo()

        ndvi_mean = stats.get("NDVI_mean")
        ndvi_min = stats.get("NDVI_min")
        ndvi_max = stats.get("NDVI_max")

        if ndvi_mean is None:
            raise NoSatelliteImageFoundError(
                "NDVI could not be computed for this area — the polygon may "
                "fall outside available Sentinel-2 coverage."
            )

        vis_params = {
            "min": NDVI_MIN_DISPLAY,
            "max": NDVI_MAX_DISPLAY,
            "palette": NDVI_PALETTE,
        }
        map_id_dict = ndvi_image.getMapId(vis_params)
        tile_url = map_id_dict["tile_fetcher"].url_format

        return NdviAnalyzeResponse(
            geometry=_polygon_to_geojson_geometry(polygon),
            stats=NdviStats(mean=round(ndvi_mean, 4), min=round(ndvi_min, 4), max=round(ndvi_max, 4)),
            visualization=NdviVisualization(
                tile_url=tile_url,
                palette=[f"#{c}" for c in NDVI_PALETTE],
                min_value=NDVI_MIN_DISPLAY,
                max_value=NDVI_MAX_DISPLAY,
            ),
            source=NdviSourceInfo(
                collection=settings.SENTINEL2_COLLECTION,
                image_date=image_date,
                cloud_cover_percent=cloud_cover,
            ),
            area_hectares=area_hectares,
        )

    except (NoSatelliteImageFoundError, EarthEngineError):
        raise
    except Exception as e:
        logger.error(f"NDVI computation failed: {e}", exc_info=True)
        raise EarthEngineError(f"NDVI computation failed: {e}")


def _polygon_to_geojson_geometry(polygon: Polygon):
    from app.schemas.geometry import PolygonGeometry

    coords = [[list(coord) for coord in polygon.exterior.coords]]
    return PolygonGeometry(type="Polygon", coordinates=coords)