import type { MapLayer } from "@/lib/store/useAppStore";
import type { NdviHistoryItem } from "@/lib/api/types";
import {
  NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY,
  NDMI_MIN_DISPLAY, NDMI_MAX_DISPLAY,
  NDRE_MIN_DISPLAY, NDRE_MAX_DISPLAY,
  NBR2_MIN_DISPLAY, NBR2_MAX_DISPLAY,
  NDWI_MIN_DISPLAY, NDWI_MAX_DISPLAY,
  CCI_MIN_DISPLAY, CCI_MAX_DISPLAY,
  EVI_MIN_DISPLAY, EVI_MAX_DISPLAY,
  SAVI_MIN_DISPLAY, SAVI_MAX_DISPLAY,
} from "@/lib/ndviPalette";

/** The index layers (everything except the raw satellite basemap). */
export type IndexLayer = Exclude<MapLayer, "satellite">;

/**
 * Chart-facing metadata per index: a short code for compact sparkline labels
 * and its meaningful display range (mirrors the map legend). The trend chart
 * reads `short`/`range` here and full labels from MEASURES above.
 */
// `color` is a CVD-validated categorical identity hue per measure (see the
// --m-* tokens in globals.css); used consistently across sparklines, the
// single-measure detail line, and the compare overlay so a hue always means
// the same index. `range` is the measure's display range (mirrors the map
// legend), used to normalize the compare overlay onto one 0-100% axis.
export const INDEX_META: Record<IndexLayer, { short: string; range: [number, number]; color: string }> = {
  ndvi: { short: "NDVI", range: [NDVI_MIN_DISPLAY, NDVI_MAX_DISPLAY], color: "var(--m-ndvi)" },
  ndmi: { short: "NDMI", range: [NDMI_MIN_DISPLAY, NDMI_MAX_DISPLAY], color: "var(--m-ndmi)" },
  ndre: { short: "NDRE", range: [NDRE_MIN_DISPLAY, NDRE_MAX_DISPLAY], color: "var(--m-ndre)" },
  nbr2: { short: "NBR2", range: [NBR2_MIN_DISPLAY, NBR2_MAX_DISPLAY], color: "var(--m-nbr2)" },
  ndwi: { short: "NDWI", range: [NDWI_MIN_DISPLAY, NDWI_MAX_DISPLAY], color: "var(--m-ndwi)" },
  cci: { short: "CIre", range: [CCI_MIN_DISPLAY, CCI_MAX_DISPLAY], color: "var(--m-cci)" },
  evi: { short: "EVI", range: [EVI_MIN_DISPLAY, EVI_MAX_DISPLAY], color: "var(--m-evi)" },
  savi: { short: "SAVI", range: [SAVI_MIN_DISPLAY, SAVI_MAX_DISPLAY], color: "var(--m-savi)" },
};

/** The 8 index layers in canonical display order. */
export const INDEX_LAYERS = Object.keys(INDEX_META) as IndexLayer[];

/** Full "NDVI — vegetation" style label for an index (from MEASURES). */
export function indexLabel(layer: IndexLayer): string {
  return MEASURES.find((m) => m.key === layer)?.label ?? INDEX_META[layer].short;
}

/**
 * Single source of truth for the measure list — display order + labels for
 * the dropdown, shared by the fields map and the dashboard so they never
 * drift. Labels carry a plain-language hint since NBR2/NDRE/CCI mean nothing
 * to most users.
 */
export const MEASURES: { key: MapLayer; label: string }[] = [
  { key: "ndvi", label: "NDVI — vegetation" },
  { key: "ndmi", label: "NDMI — moisture" },
  { key: "ndre", label: "NDRE — nitrogen" },
  { key: "nbr2", label: "NBR2 — residue / burn" },
  { key: "ndwi", label: "NDWI — water" },
  { key: "cci", label: "CIre — red-edge chlorophyll" },
  { key: "evi", label: "EVI — vegetation (enhanced)" },
  { key: "savi", label: "SAVI — soil-adjusted" },
  { key: "satellite", label: "Satellite" },
];

/**
 * Overlay PNG for the active layer. Satellite has no index overlay (the
 * basemap shows through) — and NDVI is the fallback for any unmapped value.
 */
export function layerPng(entry: NdviHistoryItem, layer: MapLayer): string | null {
  switch (layer) {
    case "satellite":
      return null;
    case "ndmi":
      return entry.ndmi_png_url;
    case "ndre":
      return entry.ndre_png_url;
    case "nbr2":
      return entry.nbr2_png_url;
    case "ndwi":
      return entry.ndwi_png_url;
    case "cci":
      return entry.cci_png_url;
    case "evi":
      return entry.evi_png_url;
    case "savi":
      return entry.savi_png_url;
    default:
      return entry.ndvi_png_url;
  }
}

/** Mean/min/max for the active layer (satellite → NDVI). */
export function layerStats(
  entry: NdviHistoryItem,
  layer: MapLayer,
): { mean: number | null; min: number | null; max: number | null } {
  switch (layer) {
    case "ndmi":
      return { mean: entry.ndmi_mean, min: entry.ndmi_min, max: entry.ndmi_max };
    case "ndre":
      return { mean: entry.ndre_mean, min: entry.ndre_min, max: entry.ndre_max };
    case "nbr2":
      return { mean: entry.nbr2_mean, min: entry.nbr2_min, max: entry.nbr2_max };
    case "ndwi":
      return { mean: entry.ndwi_mean, min: entry.ndwi_min, max: entry.ndwi_max };
    case "cci":
      return { mean: entry.cci_mean, min: entry.cci_min, max: entry.cci_max };
    case "evi":
      return { mean: entry.evi_mean, min: entry.evi_min, max: entry.evi_max };
    case "savi":
      return { mean: entry.savi_mean, min: entry.savi_min, max: entry.savi_max };
    default:
      return { mean: entry.ndvi_mean, min: entry.ndvi_min, max: entry.ndvi_max };
  }
}
