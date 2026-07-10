"""
NDVI computation pipeline (CDSE / openEO).

Flow:
1. Convert the validated Shapely polygon into a GeoJSON geometry.
2. Query the Sentinel-2 L2A collection via openEO, filtered by the polygon,
   a rolling date window, and a max cloud-cover threshold.
3. Mask cloudy pixels using the Scene Classification Layer (SCL) band.
4. Average each band (B08, B04) across all cloud-free scenes in the date
   window first (there's no single "best image" concept here like GEE's
   sort-by-cloud — openEO's synchronous processing model makes a temporal
   mean the practical choice for Module 1), *then* compute
   NDVI = (NIR - RED) / (NIR + RED) from the two composites. This ordering
   is required, not stylistic — computing the ratio per-scene and reducing
   the ratio afterward returns an all-zero raster on CDSE's backend
   (verified empirically; not documented as a limitation anywhere we could
   find). Same story for NDMI (B08/B11).
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

# Dark blue -> light blue -> yellow palette for NDMI (moisture) visualization,
# per the design tokens (design_handoff/README.md NDMI ramp): wet -> dry.
NDMI_PALETTE = [
    "08519C",  # dark blue - very moist
    "4292C6",
    "9ECAE1",
    "FEE391",
    "FEC44F",  # yellow/tan - dry
]
NDMI_MIN_DISPLAY = -0.5
NDMI_MAX_DISPLAY = 0.5

# SCL (Scene Classification Layer) values to mask out as "cloudy" —
# 3 = cloud shadow, 8 = cloud medium probability, 9 = cloud high probability,
# 10 = thin cirrus.
CLOUD_SCL_CLASSES = [3, 8, 9, 10]

NDVI_IMAGES_DIR = os.path.join("static", "ndvi_images")


def _polygon_to_geojson_geometry(polygon: Polygon):
    from app.schemas.geometry import PolygonGeometry

    coords = [[list(coord) for coord in polygon.exterior.coords]]
    return PolygonGeometry(type="Polygon", coordinates=coords)


def _download_index_array(
    polygon: Polygon,
    start_date: datetime,
    end_date: datetime,
    band_a: str,
    band_b: str,
) -> np.ndarray:
    """
    Runs an openEO process graph computing a normalized difference index
    `(band_a - band_b) / (band_a + band_b)` and downloads the result as a
    numpy array. Used for both NDVI (B08, B04) and NDMI (B08, B11) — same
    cloud-masking/temporal-mean/clip pipeline, different bands.

    Raises NoSatelliteImageFoundError if nothing usable comes back for this
    polygon/date window.
    """
    connection = ensure_connection()
    geojson_geometry = mapping(polygon)

    datacube = connection.load_collection(
        settings.SENTINEL2_COLLECTION,
        spatial_extent=geojson_geometry,
        temporal_extent=[start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")],
        bands=[band_a, band_b, "SCL"],
        max_cloud_cover=settings.MAX_CLOUD_COVER_PERCENT,
    )

    a = datacube.band(band_a)
    b = datacube.band(band_b)
    scl = datacube.band("SCL")

    cloud_mask = (scl == CLOUD_SCL_CLASSES[0])
    for cls in CLOUD_SCL_CLASSES[1:]:
        cloud_mask = cloud_mask | (scl == cls)

    a_masked = a.mask(cloud_mask)
    b_masked = b.mask(cloud_mask)

    # Reduce each band over time *before* combining them via subtraction/
    # division — doing the band math first and reducing afterward (the more
    # obvious ordering, and what this used to do) silently produced an
    # all-zero index on CDSE's backend for every valid pixel, verified by
    # comparing both orderings against the same real polygon/date window.
    # This changes the semantics slightly (index of the temporal-mean
    # reflectance, rather than temporal-mean of the per-scene index) but
    # it's the only ordering that returns real values instead of zeros.
    a_composite = a_masked.reduce_dimension(dimension="t", reducer="mean")
    b_composite = b_masked.reduce_dimension(dimension="t", reducer="mean")
    index_composite = (a_composite - b_composite) / (a_composite + b_composite)

    # Clip precisely to the drawn polygon (equivalent to the old
    # ee_image.clip(ee_geometry) call).
    index_composite = index_composite.filter_spatial(geojson_geometry)

    tmp_path = f"/tmp/index_{uuid.uuid4().hex}.tiff"
    try:
        index_composite.download(tmp_path)
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


def _stats_and_png(
    array: np.ndarray, vmin: float, vmax: float, palette: list[str], filename_prefix: str
) -> tuple[NdviStats, str]:
    """Computes mean/min/max and renders the PNG overlay for one index array."""
    valid_pixels = array[~np.isnan(array)]
    if valid_pixels.size == 0:
        raise NoSatelliteImageFoundError(
            "Index could not be computed for this area — the polygon may "
            "fall outside available Sentinel-2 coverage, or every scene "
            "in the date window was fully cloud-masked."
        )

    stats = NdviStats(
        mean=round(float(np.mean(valid_pixels)), 4),
        min=round(float(np.min(valid_pixels)), 4),
        max=round(float(np.max(valid_pixels)), 4),
    )

    image_filename = f"{filename_prefix}_{uuid.uuid4().hex}.png"
    os.makedirs(NDVI_IMAGES_DIR, exist_ok=True)
    image_path = os.path.join(NDVI_IMAGES_DIR, image_filename)
    render_ndvi_png(array, output_path=image_path, vmin=vmin, vmax=vmax, palette=palette)
    image_url = f"{settings.APP_BASE_URL}/static/ndvi_images/{image_filename}"

    return stats, image_url


def compute_ndvi(polygon: Polygon, area_hectares: float | None = None) -> NdviAnalyzeResponse:
    """
    Main pipeline entry point — computes both NDVI (B08/B04) and NDMI
    (B08/B11) over the same date window/cloud filter, from the same
    Sentinel-2 pass, and returns both. Called synchronously from
    POST /ndvi/analyze (public preview) and from the background
    `run_ndvi_job` (see ndvi_job_service.py) after POST /fields.

    Raises SatelliteDataError or NoSatelliteImageFoundError on failure —
    both are AppException subclasses, so the global exception handler
    turns them into clean JSON error responses.
    """
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=settings.NDVI_SEARCH_WINDOW_DAYS)

    try:
        ndvi_array = _download_index_array(polygon, start_date, end_date, "B08", "B04")
        ndvi_stats, ndvi_image_url = _stats_and_png(
            ndvi_array, NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY, NDVI_PALETTE, "ndvi"
        )

        ndmi_array = _download_index_array(polygon, start_date, end_date, "B08", "B11")
        ndmi_stats, ndmi_image_url = _stats_and_png(
            ndmi_array, NDMI_MIN_DISPLAY, NDMI_MAX_DISPLAY, NDMI_PALETTE, "ndmi"
        )

        west, south, east, north = polygon.bounds
        bounding_box = [west, south, east, north]

        return NdviAnalyzeResponse(
            geometry=_polygon_to_geojson_geometry(polygon),
            stats=ndvi_stats,
            visualization=NdviVisualization(
                image_url=ndvi_image_url,
                bounding_box=bounding_box,
                palette=[f"#{c}" for c in NDVI_PALETTE],
                min_value=NDVI_MIN_DISPLAY,
                max_value=NDVI_MAX_DISPLAY,
            ),
            ndmi_stats=ndmi_stats,
            ndmi_visualization=NdviVisualization(
                image_url=ndmi_image_url,
                bounding_box=bounding_box,
                palette=[f"#{c}" for c in NDMI_PALETTE],
                min_value=NDMI_MIN_DISPLAY,
                max_value=NDMI_MAX_DISPLAY,
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
        logger.error(f"NDVI/NDMI computation failed: {e}", exc_info=True)
        raise SatelliteDataError(f"NDVI/NDMI computation failed: {e}")