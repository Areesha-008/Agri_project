"use client";

import type { MapLayer } from "@/lib/store/useAppStore";
import { MEASURES } from "@/lib/measures";
import { NavIcons } from "@/components/layout/icons";

/**
 * Measure picker for the map overlay. A native <select> on purpose: with 9
 * measures a pill row overflows, and a custom popover would be clipped by the
 * map/card `overflow-hidden` — the native option list renders in the browser's
 * top layer instead, and comes keyboard- and screen-reader-accessible for free.
 */
export function MeasureDropdown({
  value,
  onChange,
  className = "",
}: {
  value: MapLayer;
  onChange: (layer: MapLayer) => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MapLayer)}
        aria-label="Map measure"
        className="jk-focus h-8 w-full cursor-pointer appearance-none rounded-lg border border-input-border bg-cream-card py-1.5 pl-3 pr-8 text-[11px] font-semibold text-ink-900 shadow-card"
      >
        {MEASURES.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-ink-500">
        {NavIcons.chevron}
      </span>
    </div>
  );
}
