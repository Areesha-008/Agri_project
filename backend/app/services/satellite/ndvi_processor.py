"""
NDVI computation pipeline (CDSE / openEO).

Flow:
1. Convert the validated Shapely polygon into a GeoJSON geometry.
2. Query the Sentinel-2 L2A collection via openEO, filtered by the polygon,
   a rolling date window, and a max cloud-cover threshold.
3. Mask cloudy pixels using the Scene Classification Layer (SCL) band.
4. Compute NDVI = (NIR - RED) / (NIR + RED) using Sentinel-2 bands B08 (NIR)
   and B04 (Red), server-side, via openEO band math.
5. Average NDVI across all cloud-free scenes found in the date window
   (there's no single "best image" concept here like GEE's sort-by-cloud —
   openEO's synchronous processing model makes a temporal mean the
   practical choice for Module 1).
6. Download the resulting NDVI raster (GeoTIFF), compute mean/min/max
   stats locally with numpy, and render a brown-to-green PNG for the
   frontend to overlay on the ESRI map using a bounding box (since openEO
   doesn't give us a ready-made tile URL like GEE's getMapId() did).

This runs synchronously for Module 1 — the route calls `compute_ndvi()`
directly and waits for the result. If this becomes a bottleneck later,
this is the function boundary where a background job / task queue would
be introduced without touching the API route.
"""

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import tifffile
from shapely.geometry import Polygon, mapping

from app.core.config import settings
from app.exceptions.custom_exceptions import NoSatelliteImageFoundError, SatelliteDataError
from app.schemas.ndvi import NdviAnalyzeResponse, NdviSourceInfo, NdviStats, NdviVisualization
from app.services.satellite.cdse_client import ensure_connection
from app.services.satellite.visualization import render_ndvi_png

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

# SCL (Scene Classification Layer) values to mask out as "cloudy" —
# 3 = cloud shadow, 8 = cloud medium probability, 9 = cloud high probability,
# 10 = thin cirrus.
CLOUD_SCL_CLASSES = [3, 8, 9, 10]

NDVI_IMAGES_DIR = os.path.join("static", "ndvi_images")


def _polygon_to_geojson_geometry(polygon: Polygon):
    from app.schemas.geometry import PolygonGeometry

    coords = [[list(coord) for coord in polygon.exterior.coords]]
    return PolygonGeometry(type="Polygon", coordinates=coords)


def _download_ndvi_array(polygon: Polygon, start_date: datetime, end_date: datetime) -> np.ndarray:
    """
    Runs the openEO process graph and downloads the resulting NDVI raster
    as a numpy array. Raises NoSatelliteImageFoundError if nothing usable
    comes back for this polygon/date window.
    """
    connection = ensure_connection()
    geojson_geometry = mapping(polygon)

    datacube = connection.load_collection(
        settings.SENTINEL2_COLLECTION,
        spatial_extent=geojson_geometry,
        temporal_extent=[start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")],
        bands=["B04", "B08", "SCL"],
        max_cloud_cover=settings.MAX_CLOUD_COVER_PERCENT,
    )

    red = datacube.band("B04")
    nir = datacube.band("B08")
    scl = datacube.band("SCL")

    cloud_mask = (scl == CLOUD_SCL_CLASSES[0])
    for cls in CLOUD_SCL_CLASSES[1:]:
        cloud_mask = cloud_mask | (scl == cls)

    red_masked = red.mask(cloud_mask)
    nir_masked = nir.mask(cloud_mask)

    ndvi = (nir_masked - red_masked) / (nir_masked + red_masked)
    ndvi_composite = ndvi.reduce_dimension(dimension="t", reducer="mean")

    # Clip precisely to the drawn polygon (equivalent to the old
    # ee_image.clip(ee_geometry) call).
    ndvi_composite = ndvi_composite.filter_spatial([geojson_geometry])

    tmp_path = f"/tmp/ndvi_{uuid.uuid4().hex}.tiff"
    try:
        ndvi_composite.download(tmp_path)
    except Exception as e:
        raise NoSatelliteImageFoundError(
            f"No Sentinel-2 imagery could be processed for this area within "
            f"the last {settings.NDVI_SEARCH_WINDOW_DAYS} days with cloud "
            f"cover below {settings.MAX_CLOUD_COVER_PERCENT}%. Try a "
            f"different area or a wider date range. ({e})"
        )

    try:
        array = tifffile.imread(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    # openEO/GDAL sometimes returns a (1, H, W) band-dim array instead of (H, W).
    if array.ndim == 3:
        array = array[0]

    return array.astype("float32")


def compute_ndvi(polygon: Polygon, area_hectares: float | None = None) -> NdviAnalyzeResponse:
    """
    Main synchronous NDVI pipeline entry point.

    Raises SatelliteDataError or NoSatelliteImageFoundError on failure —
    both are AppException subclasses, so the global exception handler
    turns them into clean JSON error responses.
    """
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=settings.NDVI_SEARCH_WINDOW_DAYS)

    try:
        ndvi_array = _download_ndvi_array(polygon, start_date, end_date)

        valid_pixels = ndvi_array[~np.isnan(ndvi_array)]
        if valid_pixels.size == 0:
            raise NoSatelliteImageFoundError(
                "NDVI could not be computed for this area — the polygon may "
                "fall outside available Sentinel-2 coverage, or every scene "
                "in the date window was fully cloud-masked."
            )

        ndvi_mean = float(np.mean(valid_pixels))
        ndvi_min = float(np.min(valid_pixels))
        ndvi_max = float(np.max(valid_pixels))

        image_filename = f"ndvi_{uuid.uuid4().hex}.png"
        os.makedirs(NDVI_IMAGES_DIR, exist_ok=True)
        image_path = os.path.join(NDVI_IMAGES_DIR, image_filename)

        render_ndvi_png(
            ndvi_array,
            output_path=image_path,
            vmin=NDVI_MIN_DISPLAY,
            vmax=NDVI_MAX_DISPLAY,
            palette=NDVI_PALETTE,
        )

        image_url = f"{settings.APP_BASE_URL}/static/ndvi_images/{image_filename}"
        west, south, east, north = polygon.bounds

        return NdviAnalyzeResponse(
            geometry=_polygon_to_geojson_geometry(polygon),
            stats=NdviStats(mean=round(ndvi_mean, 4), min=round(ndvi_min, 4), max=round(ndvi_max, 4)),
            visualization=NdviVisualization(
                image_url=image_url,
                bounding_box=[west, south, east, north],
                palette=[f"#{c}" for c in NDVI_PALETTE],
                min_value=NDVI_MIN_DISPLAY,
                max_value=NDVI_MAX_DISPLAY,
            ),
            source=NdviSourceInfo(
                collection=settings.SENTINEL2_COLLECTION,
                date_range_start=start_date.date(),
                date_range_end=end_date.date(),
                max_cloud_cover_filter_percent=settings.MAX_CLOUD_COVER_PERCENT,
            ),
            area_hectares=area_hectares,
        )

    except (NoSatelliteImageFoundError, SatelliteDataError):
        raise
    except Exception as e:
        logger.error(f"NDVI computation failed: {e}", exc_info=True)
        raise SatelliteDataError(f"NDVI computation failed: {e}")