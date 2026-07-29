import type { MapLayer } from "@/lib/store/useAppStore";
import type { NdviHistoryItem } from "@/lib/api/types";

/** The index layers (everything except the raw satellite basemap). */
export type IndexLayer = Exclude<MapLayer, "satellite">;

/**
 * Chart-facing metadata per index: a short code for compact labels and its
 * CVD-validated categorical identity hue (the --m-* tokens in globals.css),
 * used consistently across the index list and the detail chart so a hue
 * always means the same index.
 */
export const INDEX_META: Record<IndexLayer, { short: string; color: string }> = {
  ndvi: { short: "NDVI", color: "var(--m-ndvi)" },
  ndmi: { short: "NDMI", color: "var(--m-ndmi)" },
  ndre: { short: "NDRE", color: "var(--m-ndre)" },
  nbr2: { short: "NBR2", color: "var(--m-nbr2)" },
  ndwi: { short: "NDWI", color: "var(--m-ndwi)" },
  cci: { short: "CIre", color: "var(--m-cci)" },
  evi: { short: "EVI", color: "var(--m-evi)" },
  savi: { short: "SAVI", color: "var(--m-savi)" },
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
