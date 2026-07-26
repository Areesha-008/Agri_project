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
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Iterator

import numpy as np
import tifffile
from shapely.geometry import Polygon, mapping

from app.core.config import settings
from app.exceptions.custom_exceptions import (
    InvalidDateRangeError,
    NoSatelliteImageFoundError,
    SatelliteDataError,
)
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

# NDRE (Normalized Difference Red Edge) = (NIR_narrow - RedEdge1) / (...),
# bands B8A/B05. Red-edge proxy for canopy chlorophyll / nitrogen status;
# unlike NDVI it keeps discriminating on dense canopy where NDVI saturates.
# Palette is a deficient->sufficient nitrogen ramp (red -> yellow -> green),
# deliberately distinct from NDVI's brown->green so the two layers don't
# read as the same map. Crop NDRE typically sits ~0.2-0.5.
NDRE_PALETTE = [
    "D73027",  # red - nitrogen-deficient / bare
    "FC8D59",
    "FEE08B",  # yellow - moderate
    "91CF60",
    "1A9850",  # green - nitrogen-sufficient / vigorous
]
NDRE_MIN_DISPLAY = -0.1
NDRE_MAX_DISPLAY = 0.6

# NBR2 / NDTI (Normalized Difference Tillage Index) = (SWIR1 - SWIR2) /
# (SWIR1 + SWIR2), bands B11/B12. Doubles as a crop-residue-cover and a
# burn-scar signal: standing residue/dry matter reads high (light straw),
# freshly tilled bare soil and char from stubble burning read low/negative
# (dark). Same formula and band pair whether you call it NBR2 or NDTI.
NBR2_PALETTE = [
    "5C4033",  # dark brown - bare soil / burn scar (low residue)
    "A97C50",
    "D2B48C",
    "E8DAB2",
    "F2EAD3",  # straw - high residue cover
]
NBR2_MIN_DISPLAY = -0.1
NBR2_MAX_DISPLAY = 0.6

# NDWI (McFeeters) = (Green - NIR) / (Green + NIR), bands B03/B08. Open-water
# index — NOT the moisture NDMI above (that's Gao's NIR/SWIR variant). Flags
# standing water: paddy flood stage, waterlogging, ponding. Dry -> wet-blue.
NDWI_PALETTE = ["B8860B", "D2B48C", "C7EAE5", "67A9CF", "2166AC"]
NDWI_MIN_DISPLAY = -0.3
NDWI_MAX_DISPLAY = 0.6

# CIre (Red-Edge Chlorophyll Index) = NIR / RedEdge - 1 = B08 / B05 - 1.
# A ratio-form red-edge chlorophyll index — "stronger" than NDRE because the
# ratio stays roughly linear with canopy chlorophyll at high biomass, where
# the normalized-difference NDRE saturates. Different band math from NDRE
# (B8A/B05 normalized difference), so the two aren't redundant. Low (bare /
# chlorotic) -> high (dense, chlorophyll-rich). The stored key stays "cci"
# for column/schema/URL stability; only the formula and range changed.
CCI_PALETTE = ["A6611A", "DFC27D", "F5F5C8", "9DBF3F", "1A7A1A"]
CCI_MIN_DISPLAY = 0.0
CCI_MAX_DISPLAY = 3.0

# EVI (Enhanced Vegetation Index) = 2.5*(NIR-Red)/(NIR + 6*Red - 7.5*Blue + 1),
# bands B08/B04/B02. Atmosphere/soil-corrected NDVI that keeps discriminating
# on dense canopy where NDVI saturates. Its constants assume reflectance in
# physical 0-1 units (unlike scale-invariant normalized differences), so the
# bands are divided by REFLECTANCE_SCALE first.
EVI_PALETTE = ["FFFFCC", "C2E699", "78C679", "31A354", "006837"]
EVI_MIN_DISPLAY = 0.0
EVI_MAX_DISPLAY = 0.8

# SAVI (Soil-Adjusted Vegetation Index) = 1.5*(NIR-Red)/(NIR+Red+0.5), bands
# B08/B04. Suppresses soil-brightness noise in sparse canopy (early wheat).
# The +0.5 soil constant is likewise in 0-1 reflectance units -> scaled.
SAVI_PALETTE = ["8C510A", "D8B365", "F6E8C3", "5AB4AC", "01665E"]
SAVI_MIN_DISPLAY = -0.2
SAVI_MAX_DISPLAY = 0.8

# Sentinel-2 L2A reflectance is stored as DN = 10000 * reflectance. openEO may
# or may not pre-scale, so this is VERIFIED empirically against CDSE (see the
# ndre/nbr2 + evi/savi live check) rather than assumed. Only the additive-
# constant indices (EVI, SAVI) depend on it; normalized differences are
# scale-invariant. Set to the observed factor that puts NIR into ~[0,1].
REFLECTANCE_SCALE = 10000.0

# Union of spectral bands needed across every index, fetched in ONE datacube.
COMPOSITE_BANDS = ["B02", "B03", "B04", "B05", "B08", "B8A", "B11", "B12"]

# SCL (Scene Classification Layer) values to mask out as "cloudy" —
# 3 = cloud shadow, 8 = cloud medium probability, 9 = cloud high probability,
# 10 = thin cirrus.
CLOUD_SCL_CLASSES = [3, 8, 9, 10]

NDVI_IMAGES_DIR = os.path.join("static", "ndvi_images")

# Bounds for a user-requested search window (see validate_search_window).
# MIN sits below the smallest UI preset (7d) so all presets always pass;
# MAX gives headroom over the largest preset (90d) for a deliberate
# "last year" custom pull while bounding worst-case CDSE compute cost.
MIN_SEARCH_WINDOW_DAYS = 3
MAX_SEARCH_WINDOW_DAYS = 365


def validate_search_window(start_date: date | None, end_date: date | None) -> None:
    """
    Validates a user-requested date window. Both None is valid (caller
    falls back to the global NDVI_SEARCH_WINDOW_DAYS default) — this is the
    only validation entry point compute_ndvi() has, so it covers every
    caller (POST /ndvi/analyze and the background NDVI job) in one place.
    """
    if start_date is None and end_date is None:
        return
    if start_date is None or end_date is None:
        raise InvalidDateRangeError("Both start_date and end_date must be provided together")
    if end_date <= start_date:
        raise InvalidDateRangeError("end_date must be after start_date")
    # A plain `date` has no timezone, so "today" is ambiguous by up to a day
    # depending on the client's UTC offset (as far as UTC+14) — tolerate a
    # 1-day skew rather than rejecting a client-local "today" as "future".
    if end_date > datetime.now(timezone.utc).date() + timedelta(days=1):
        raise InvalidDateRangeError("end_date cannot be in the future")

    window_days = (end_date - start_date).days
    if window_days < MIN_SEARCH_WINDOW_DAYS:
        raise InvalidDateRangeError(
            f"Date range ({window_days} days) is shorter than the minimum "
            f"of {MIN_SEARCH_WINDOW_DAYS} days"
        )
    if window_days > MAX_SEARCH_WINDOW_DAYS:
        raise InvalidDateRangeError(
            f"Date range ({window_days} days) exceeds the maximum of "
            f"{MAX_SEARCH_WINDOW_DAYS} days"
        )


def _polygon_to_geojson_geometry(polygon: Polygon):
    from app.schemas.geometry import PolygonGeometry

    coords = [[list(coord) for coord in polygon.exterior.coords]]
    return PolygonGeometry(type="Polygon", coordinates=coords)


def _download_composite_bands(
    polygon: Polygon,
    start_date: datetime,
    end_date: datetime,
    bands: list[str],
) -> dict[str, np.ndarray]:
    """
    ONE openEO fetch for every band any index needs. Masks cloudy pixels via
    the SCL band, temporal-means each band across the window (reduce-then-
    combine — the ordering that dodges CDSE's all-zeros gotcha, see module
    docstring), and downloads the whole stack as a single multiband GeoTIFF.
    Returns {band_name: 2-D float32 array}; the index math is then done
    locally in numpy.

    This is the "upgrade path": all 8 indices now cost one fetch, not one
    fetch each. It also makes the non-ratio indices (EVI, SAVI) possible at
    all, since those can't be expressed as a single server-side band ratio.

    Raises NoSatelliteImageFoundError if nothing usable comes back.
    """
    connection = ensure_connection()
    geojson_geometry = mapping(polygon)

    datacube = connection.load_collection(
        settings.SENTINEL2_COLLECTION,
        spatial_extent=geojson_geometry,
        temporal_extent=[start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")],
        bands=bands + ["SCL"],
        max_cloud_cover=settings.MAX_CLOUD_COVER_PERCENT,
    )

    scl = datacube.band("SCL")
    cloud_mask = (scl == CLOUD_SCL_CLASSES[0])
    for cls in CLOUD_SCL_CLASSES[1:]:
        cloud_mask = cloud_mask | (scl == cls)

    # Drop SCL, cloud-mask every spectral band at once (a single-band mask
    # broadcasts across the bands dimension), then temporal-mean each band.
    spectral = datacube.filter_bands(bands)
    masked = spectral.mask(cloud_mask)
    composite = masked.reduce_dimension(dimension="t", reducer="mean")
    composite = composite.filter_spatial(geojson_geometry)

    tmp_path = f"/tmp/composite_{uuid.uuid4().hex}.tiff"
    try:
        composite.download(tmp_path)
    except Exception as e:
        raise NoSatelliteImageFoundError(
            f"No Sentinel-2 imagery could be processed for this area between "
            f"{start_date.date()} and {end_date.date()} with cloud "
            f"cover below {settings.MAX_CLOUD_COVER_PERCENT}%. Try a "
            f"different area or a wider date range. ({e})"
        )

    try:
        array = tifffile.imread(tmp_path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return _split_bands(array, bands)


def _split_bands(array: np.ndarray, bands: list[str]) -> dict[str, np.ndarray]:
    """
    Maps a multiband raster to {band: 2-D array}, tolerating either
    (band, H, W) or (H, W, band) axis order (GDAL/openEO output varies).
    Non-positive pixels are treated as nodata (outside-polygon or fully
    cloud-masked) and set to NaN — valid Sentinel-2 reflectance is strictly
    positive, so this is safe and keeps the downstream NaN-aware stats/PNG
    path (which never sees the sentinel 0s) correct.
    """
    array = array.astype("float32")
    n = len(bands)
    if array.ndim == 2:
        if n != 1:
            raise SatelliteDataError(f"expected {n} bands, got a 2-D raster")
        planes = [array]
    elif array.shape[0] == n:
        planes = [array[i] for i in range(n)]
    elif array.shape[-1] == n:
        planes = [array[..., i] for i in range(n)]
    else:
        raise SatelliteDataError(f"multiband raster shape {array.shape} doesn't match {n} bands")

    return {band: np.where(plane > 0, plane, np.nan) for band, plane in zip(bands, planes)}


# Mirrors frontend/src/lib/weekTiles.ts computeWeeklyTiles() exactly — same
# rolling-tile algorithm, so a job's resulting history rows land in exactly
# the tiles the frontend's own WeekScrubber computes for the same period.
_TILE_WINDOW_DAYS = 6  # 7-calendar-day tile; (end-start).days is 6, exclusive delta


def compute_weekly_tiles(start_date: date, end_date: date) -> list[tuple[date, date]]:
    """Non-overlapping ~7-day (start, end) tiles stepping backward from
    end_date to start_date — tiles[0] is the most recent week. See
    weekTiles.ts's computeWeeklyTiles for the full rationale (this is a
    line-for-line port); keep the two in sync if either changes."""
    if (end_date - start_date).days <= 0:
        return []

    tiles: list[tuple[date, date]] = []
    cursor_end = end_date

    while True:
        candidate_start = cursor_end - timedelta(days=_TILE_WINDOW_DAYS)
        tile_start = start_date if candidate_start < start_date else candidate_start
        window_days = (cursor_end - tile_start).days

        if window_days < MIN_SEARCH_WINDOW_DAYS and tiles:
            tiles[-1] = (tile_start, tiles[-1][1])
            break

        tiles.append((tile_start, cursor_end))
        if tile_start == start_date:
            break
        cursor_end = tile_start - timedelta(days=1)

    return tiles


def _nd(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Normalized difference (a - b) / (a + b); scale-invariant."""
    with np.errstate(divide="ignore", invalid="ignore"):
        return (a - b) / (a + b)


def _evi(b: dict[str, np.ndarray]) -> np.ndarray:
    nir = b["B08"] / REFLECTANCE_SCALE
    red = b["B04"] / REFLECTANCE_SCALE
    blue = b["B02"] / REFLECTANCE_SCALE
    with np.errstate(divide="ignore", invalid="ignore"):
        return 2.5 * (nir - red) / (nir + 6.0 * red - 7.5 * blue + 1.0)


def _savi(b: dict[str, np.ndarray]) -> np.ndarray:
    nir = b["B08"] / REFLECTANCE_SCALE
    red = b["B04"] / REFLECTANCE_SCALE
    with np.errstate(divide="ignore", invalid="ignore"):
        return 1.5 * (nir - red) / (nir + red + 0.5)


def _cire(b: dict[str, np.ndarray]) -> np.ndarray:
    """Red-edge chlorophyll index (CIre) = B08/B05 - 1. Scale-invariant
    (a ratio), so no reflectance scaling needed. B05 is red-edge reflectance,
    always positive after the nodata sanitize, so the divide is safe."""
    with np.errstate(divide="ignore", invalid="ignore"):
        return (b["B08"] / b["B05"]) - 1.0


@dataclass(frozen=True)
class IndexSpec:
    """One computed index: its key, display palette/range, and the pure
    numpy function turning the band dict into its raster."""

    key: str
    palette: list[str]
    vmin: float
    vmax: float
    compute: Callable[[dict[str, np.ndarray]], np.ndarray]


# Order here is display order in the UI dropdown. NDVI stays first (it's the
# response's "primary" stats/visualization fields for back-compat).
INDEX_SPECS: list[IndexSpec] = [
    IndexSpec("ndvi", NDVI_PALETTE, NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY, lambda b: _nd(b["B08"], b["B04"])),
    IndexSpec("ndmi", NDMI_PALETTE, NDMI_MIN_DISPLAY, NDMI_MAX_DISPLAY, lambda b: _nd(b["B08"], b["B11"])),
    IndexSpec("ndre", NDRE_PALETTE, NDRE_MIN_DISPLAY, NDRE_MAX_DISPLAY, lambda b: _nd(b["B8A"], b["B05"])),
    IndexSpec("nbr2", NBR2_PALETTE, NBR2_MIN_DISPLAY, NBR2_MAX_DISPLAY, lambda b: _nd(b["B11"], b["B12"])),
    IndexSpec("ndwi", NDWI_PALETTE, NDWI_MIN_DISPLAY, NDWI_MAX_DISPLAY, lambda b: _nd(b["B03"], b["B08"])),
    IndexSpec("cci", CCI_PALETTE, CCI_MIN_DISPLAY, CCI_MAX_DISPLAY, _cire),
    IndexSpec("evi", EVI_PALETTE, EVI_MIN_DISPLAY, EVI_MAX_DISPLAY, _evi),
    IndexSpec("savi", SAVI_PALETTE, SAVI_MIN_DISPLAY, SAVI_MAX_DISPLAY, _savi),
]
SPEC_BY_KEY = {spec.key: spec for spec in INDEX_SPECS}


def _stats_and_png(
    array: np.ndarray, vmin: float, vmax: float, palette: list[str], filename_prefix: str
) -> tuple[NdviStats, str]:
    """Computes mean/min/max and renders the PNG overlay for one index array."""
    # isfinite (not ~isnan) so a stray inf from a local 0/0 division can't
    # skew the stats or the PNG scaling.
    valid_pixels = array[np.isfinite(array)]
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


def _build_index_response(
    bands: dict[str, np.ndarray],
    polygon: Polygon,
    area_hectares: float | None,
    date_range_start: date,
    date_range_end: date,
) -> NdviAnalyzeResponse:
    """
    Computes all eight indices in INDEX_SPECS from an already-downloaded
    band dict and assembles the response — shared by the single-composite
    path (compute_ndvi) and the period-bucketed path (compute_ndvi_periods);
    everything downstream of the satellite fetch is identical either way.
    NDVI stays the response's "primary" (top-level stats/visualization) for
    back-compat; the rest ride the `<key>_stats` / `<key>_visualization`
    fields.
    """
    west, south, east, north = polygon.bounds
    bounding_box = [west, south, east, north]

    results: dict[str, tuple[NdviStats, str]] = {}
    for spec in INDEX_SPECS:
        arr = spec.compute(bands)
        arr = np.where(np.isfinite(arr), arr, np.nan).astype("float32")
        results[spec.key] = _stats_and_png(arr, spec.vmin, spec.vmax, spec.palette, spec.key)

    def viz(key: str) -> NdviVisualization:
        spec = SPEC_BY_KEY[key]
        _, url = results[key]
        return NdviVisualization(
            image_url=url,
            bounding_box=bounding_box,
            palette=[f"#{c}" for c in spec.palette],
            min_value=spec.vmin,
            max_value=spec.vmax,
        )

    return NdviAnalyzeResponse(
        geometry=_polygon_to_geojson_geometry(polygon),
        stats=results["ndvi"][0],
        visualization=viz("ndvi"),
        ndmi_stats=results["ndmi"][0],
        ndmi_visualization=viz("ndmi"),
        ndre_stats=results["ndre"][0],
        ndre_visualization=viz("ndre"),
        nbr2_stats=results["nbr2"][0],
        nbr2_visualization=viz("nbr2"),
        ndwi_stats=results["ndwi"][0],
        ndwi_visualization=viz("ndwi"),
        cci_stats=results["cci"][0],
        cci_visualization=viz("cci"),
        evi_stats=results["evi"][0],
        evi_visualization=viz("evi"),
        savi_stats=results["savi"][0],
        savi_visualization=viz("savi"),
        source=NdviSourceInfo(
            collection=settings.SENTINEL2_COLLECTION,
            date_range_start=date_range_start,
            date_range_end=date_range_end,
            max_cloud_cover_filter_percent=settings.MAX_CLOUD_COVER_PERCENT,
        ),
        area_hectares=area_hectares,
    )


def compute_ndvi(
    polygon: Polygon,
    area_hectares: float | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> NdviAnalyzeResponse:
    """
    Main pipeline entry point — computes all eight indices over one date
    window / cloud filter, from ONE multiband Sentinel-2 fetch temporal-
    averaged across the whole window, and returns them all. Called
    synchronously from POST /ndvi/analyze (public preview). The job
    pipeline (run_ndvi_job) uses compute_ndvi_periods instead, which gets
    per-week detail from the same kind of single fetch rather than one
    averaged reading over the whole window.

    start_date/end_date let a caller request a specific window instead of
    the global NDVI_SEARCH_WINDOW_DAYS default — both or neither, not one.
    This is the sole call site of the CDSE single-composite pipeline, so
    validating here covers every caller in one place.

    Raises InvalidDateRangeError, SatelliteDataError, or
    NoSatelliteImageFoundError on failure — all are AppException
    subclasses, so the global exception handler turns them into clean
    JSON error responses.
    """
    validate_search_window(start_date, end_date)

    resolved_end = end_date or datetime.now(timezone.utc).date()
    resolved_start = start_date or (resolved_end - timedelta(days=settings.NDVI_SEARCH_WINDOW_DAYS))

    query_start = datetime.combine(resolved_start, datetime.min.time(), tzinfo=timezone.utc)
    query_end = datetime.combine(resolved_end, datetime.min.time(), tzinfo=timezone.utc)

    try:
        bands = _download_composite_bands(polygon, query_start, query_end, COMPOSITE_BANDS)
        return _build_index_response(bands, polygon, area_hectares, resolved_start, resolved_end)
    except (NoSatelliteImageFoundError, SatelliteDataError):
        raise
    except Exception as e:
        logger.error(f"Index computation failed: {e}", exc_info=True)
        raise SatelliteDataError(f"Index computation failed: {e}")


def compute_ndvi_periods(
    polygon: Polygon,
    area_hectares: float | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Iterator[NdviAnalyzeResponse]:
    """
    Splits [start_date, end_date] into ~weekly tiles (compute_weekly_tiles —
    the exact rolling algorithm the frontend's WeekScrubber uses) and calls
    compute_ndvi() once per tile, newest first, YIELDING each result as soon
    as it's ready rather than returning a batch list. Used by the job
    pipeline (run_ndvi_job) for every window-driven analysis — field
    creation, reanalyze, the landing-page guest flow — so a single user
    action gets every week in the picked window without one explicit click
    per week.

    This used to be ONE openEO fetch for the whole window
    (aggregate_temporal_period, bucketed server-side) — genuinely fewer
    queries, but verified live against real CDSE to also genuinely TIME OUT
    on a realistic 4-week/8-band request (~17 minutes, then a read timeout,
    no partial result at all). CDSE's processing time scales with how many
    raw scenes it has to touch, and a single synchronous call blocks on
    100% of that before returning anything — a wide window has several
    times more scenes than one week does. Per-tile calls cost more total
    queries, but each one is the proven-fast (well under a minute) single-
    week path, and the generator shape lets the caller commit each tile's
    result durably before moving to the next — so a slow or failing later
    tile can't erase the ones that already succeeded.

    A tile with no cloud-free scene is skipped, not an error (yields
    nothing for it) — the caller sees "no results at all" only if every
    tile came back empty/failed, not just one.
    """
    validate_search_window(start_date, end_date)

    resolved_end = end_date or datetime.now(timezone.utc).date()
    resolved_start = start_date or (resolved_end - timedelta(days=settings.NDVI_SEARCH_WINDOW_DAYS))

    # Newest first (compute_weekly_tiles' own order) — the week users
    # actually look at first is both computed and committed first.
    for tile_start, tile_end in compute_weekly_tiles(resolved_start, resolved_end):
        try:
            yield compute_ndvi(polygon, area_hectares, tile_start, tile_end)
        except (NoSatelliteImageFoundError, SatelliteDataError) as e:
            logger.warning(f"Skipping tile {tile_start}..{tile_end}: {e}")
            continue