/** Hand-mirrored from backend/app/services/satellite/ndvi_processor.py's
 *  NDVI_PALETTE/NDMI_PALETTE + _MIN_DISPLAY/_MAX_DISPLAY. Static rendering
 *  constants, not runtime-configurable. */
export const NDVI_PALETTE = ["#8B4513", "#D2B48C", "#F0E68C", "#9ACD32", "#228B22", "#006400"];
export const NDVI_MIN_DISPLAY = -0.2;
export const NDVI_MAX_DISPLAY = 0.9;

export const NDMI_PALETTE = ["#08519C", "#4292C6", "#9ECAE1", "#FEE391", "#FEC44F"];
export const NDMI_MIN_DISPLAY = -0.5;
export const NDMI_MAX_DISPLAY = 0.5;

// NDRE (red-edge / nitrogen): deficient -> sufficient ramp (red -> green).
export const NDRE_PALETTE = ["#D73027", "#FC8D59", "#FEE08B", "#91CF60", "#1A9850"];
export const NDRE_MIN_DISPLAY = -0.1;
export const NDRE_MAX_DISPLAY = 0.6;

// NBR2 / NDTI (residue / burn): bare soil or burn scar (dark) -> straw residue.
export const NBR2_PALETTE = ["#5C4033", "#A97C50", "#D2B48C", "#E8DAB2", "#F2EAD3"];
export const NBR2_MIN_DISPLAY = -0.1;
export const NBR2_MAX_DISPLAY = 0.6;

// NDWI (open water, McFeeters): dry -> wet-blue.
export const NDWI_PALETTE = ["#B8860B", "#D2B48C", "#C7EAE5", "#67A9CF", "#2166AC"];
export const NDWI_MIN_DISPLAY = -0.3;
export const NDWI_MAX_DISPLAY = 0.6;

// CIre (red-edge chlorophyll, B08/B05 - 1; stored under the "cci" key):
// chlorotic/bare -> chlorophyll-rich.
export const CCI_PALETTE = ["#A6611A", "#DFC27D", "#F5F5C8", "#9DBF3F", "#1A7A1A"];
export const CCI_MIN_DISPLAY = 0.0;
export const CCI_MAX_DISPLAY = 3.0;

// EVI (enhanced vegetation): low -> high (YlGn).
export const EVI_PALETTE = ["#FFFFCC", "#C2E699", "#78C679", "#31A354", "#006837"];
export const EVI_MIN_DISPLAY = 0.0;
export const EVI_MAX_DISPLAY = 0.8;

// SAVI (soil-adjusted vegetation): bare soil -> vegetation (BrBG).
export const SAVI_PALETTE = ["#8C510A", "#D8B365", "#F6E8C3", "#5AB4AC", "#01665E"];
export const SAVI_MIN_DISPLAY = -0.2;
export const SAVI_MAX_DISPLAY = 0.8;
