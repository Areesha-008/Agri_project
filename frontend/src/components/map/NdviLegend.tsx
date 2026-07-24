"use client";

import {
  NDVI_PALETTE,
  NDVI_MIN_DISPLAY,
  NDVI_MAX_DISPLAY,
  NDMI_PALETTE,
  NDMI_MIN_DISPLAY,
  NDMI_MAX_DISPLAY,
} from "@/lib/ndviPalette";

export function NdviLegend({ layer }: { layer: "ndvi" | "ndmi" }) {
  const palette = layer === "ndmi" ? NDMI_PALETTE : NDVI_PALETTE;
  const min = layer === "ndmi" ? NDMI_MIN_DISPLAY : NDVI_MIN_DISPLAY;
  const max = layer === "ndmi" ? NDMI_MAX_DISPLAY : NDVI_MAX_DISPLAY;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] font-semibold text-ink-600">{layer.toUpperCase()}</div>
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
