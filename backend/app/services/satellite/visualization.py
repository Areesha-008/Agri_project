"""
NDVI raster -> colored PNG visualization.

GEE's getMapId() used to return a ready-made tile URL with server-side
palette rendering baked in. CDSE/openEO gives us a raw NDVI raster instead,
so this module does that rendering ourselves: map each NDVI pixel value to
a color from the brown-to-green palette, and save the result as a PNG that
the frontend overlays on the ESRI map using the bounding_box returned
alongside it.
"""

import numpy as np
from PIL import Image


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    hex_color = hex_color.lstrip("#")
    return tuple(int(hex_color[i : i + 2], 16) for i in (0, 2, 4))


def render_ndvi_png(
    ndvi_array: np.ndarray,
    output_path: str,
    vmin: float,
    vmax: float,
    palette: list[str],
) -> None:
    """
    Renders an NDVI numpy array (values roughly in [-1, 1], NaN for
    masked/nodata pixels) to a colored PNG using a linear interpolation
    across `palette` between vmin and vmax.

    NaN pixels are rendered fully transparent so the map overlay only
    shows valid vegetation data.
    """
    rgb_palette = np.array([_hex_to_rgb(c) for c in palette], dtype="float32")
    n_colors = len(rgb_palette)

    clipped = np.clip(ndvi_array, vmin, vmax)
    normalized = (clipped - vmin) / (vmax - vmin)  # 0..1

    # Map normalized value to a fractional palette index, then interpolate
    # between the two nearest colors for a smooth gradient.
    scaled = normalized * (n_colors - 1)
    lower_idx = np.floor(scaled).astype(int)
    upper_idx = np.clip(lower_idx + 1, 0, n_colors - 1)
    frac = (scaled - lower_idx)[..., None]

    lower_colors = rgb_palette[lower_idx]
    upper_colors = rgb_palette[upper_idx]
    rgb = lower_colors * (1 - frac) + upper_colors * frac
    rgb = rgb.astype("uint8")

    alpha = np.where(np.isnan(ndvi_array), 0, 255).astype("uint8")

    rgba = np.dstack([rgb, alpha])
    Image.fromarray(rgba, mode="RGBA").save(output_path, format="PNG")