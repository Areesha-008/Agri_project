from pathlib import Path

import numpy as np
from PIL import Image

from app.services.satellite.ndvi_processor import (
    NDMI_MAX_DISPLAY,
    NDMI_MIN_DISPLAY,
    NDMI_PALETTE,
)
from app.services.satellite.visualization import _hex_to_rgb, render_ndvi_png


def test_ndmi_palette_bound_to_vmin_vmax_direction(tmp_path: Path):
    # One pixel at vmin (driest), one at vmax (moistest).
    array = np.array([[NDMI_MIN_DISPLAY, NDMI_MAX_DISPLAY]], dtype="float32")
    output_path = tmp_path / "ndmi.png"

    render_ndvi_png(
        array,
        output_path=str(output_path),
        vmin=NDMI_MIN_DISPLAY,
        vmax=NDMI_MAX_DISPLAY,
        palette=NDMI_PALETTE,
    )

    rendered = np.array(Image.open(output_path))
    dry_pixel = tuple(rendered[0, 0, :3])
    moist_pixel = tuple(rendered[0, 1, :3])

    assert dry_pixel == _hex_to_rgb(NDMI_PALETTE[0])
    assert moist_pixel == _hex_to_rgb(NDMI_PALETTE[-1])
