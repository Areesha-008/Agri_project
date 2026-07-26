"use client";

import {
  NDVI_PALETTE,
  NDVI_MIN_DISPLAY,
  NDVI_MAX_DISPLAY,
  NDMI_PALETTE,
  NDMI_MIN_DISPLAY,
  NDMI_MAX_DISPLAY,
  NDRE_PALETTE,
  NDRE_MIN_DISPLAY,
  NDRE_MAX_DISPLAY,
  NBR2_PALETTE,
  NBR2_MIN_DISPLAY,
  NBR2_MAX_DISPLAY,
  NDWI_PALETTE,
  NDWI_MIN_DISPLAY,
  NDWI_MAX_DISPLAY,
  CCI_PALETTE,
  CCI_MIN_DISPLAY,
  CCI_MAX_DISPLAY,
  EVI_PALETTE,
  EVI_MIN_DISPLAY,
  EVI_MAX_DISPLAY,
  SAVI_PALETTE,
  SAVI_MIN_DISPLAY,
  SAVI_MAX_DISPLAY,
} from "@/lib/ndviPalette";
import type { IndexLayer } from "@/lib/measures";

const LEGENDS: Record<IndexLayer, { palette: string[]; min: number; max: number; label: string }> = {
  ndvi: { palette: NDVI_PALETTE, min: NDVI_MIN_DISPLAY, max: NDVI_MAX_DISPLAY, label: "NDVI · vegetation" },
  ndmi: { palette: NDMI_PALETTE, min: NDMI_MIN_DISPLAY, max: NDMI_MAX_DISPLAY, label: "NDMI · moisture" },
  ndre: { palette: NDRE_PALETTE, min: NDRE_MIN_DISPLAY, max: NDRE_MAX_DISPLAY, label: "NDRE · nitrogen" },
  nbr2: { palette: NBR2_PALETTE, min: NBR2_MIN_DISPLAY, max: NBR2_MAX_DISPLAY, label: "NBR2 · residue" },
  ndwi: { palette: NDWI_PALETTE, min: NDWI_MIN_DISPLAY, max: NDWI_MAX_DISPLAY, label: "NDWI · water" },
  cci: { palette: CCI_PALETTE, min: CCI_MIN_DISPLAY, max: CCI_MAX_DISPLAY, label: "CIre · red-edge chlorophyll" },
  evi: { palette: EVI_PALETTE, min: EVI_MIN_DISPLAY, max: EVI_MAX_DISPLAY, label: "EVI · vegetation" },
  savi: { palette: SAVI_PALETTE, min: SAVI_MIN_DISPLAY, max: SAVI_MAX_DISPLAY, label: "SAVI · soil-adjusted" },
};

export function NdviLegend({ layer }: { layer: IndexLayer }) {
  const { palette, min, max, label } = LEGENDS[layer];

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold text-ink-600">{label}</div>
      <div
        className="h-2 w-full rounded-full"
        style={{ background: `linear-gradient(to right, ${palette.join(", ")})` }}
      />
      <div className="flex justify-between text-[10px] text-ink-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
