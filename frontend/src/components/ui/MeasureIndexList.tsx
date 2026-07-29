"use client";

import type { NdviHistoryItem } from "@/lib/api/types";
import { INDEX_LAYERS, INDEX_META, type IndexLayer } from "@/lib/measures";
import { dedupeByDate, meanRange, seriesFor } from "@/lib/measureSeries";

interface MeasureIndexListProps {
  history: NdviHistoryItem[];
  selected: IndexLayer;
  onSelect: (layer: IndexLayer) => void;
}

/**
 * Left-column index list — replaces the old sparkline tile grid. Each row is
 * color + code + latest mean + the season's min/max mean (no mini-chart —
 * dropped per design review as noise that didn't say anything the number
 * didn't). Click a row to load it into MeasureDetailChart on the right.
 */
export function MeasureIndexList({ history, selected, onSelect }: MeasureIndexListProps) {
  const rows = dedupeByDate(history).reverse();

  return (
    <div data-testid="measure-index-list" className="flex flex-col gap-1.5">
      {INDEX_LAYERS.map((layer) => {
        const series = seriesFor(rows, layer);
        const latest = series.at(-1)?.mean;
        const range = meanRange(series);
        const active = layer === selected;
        const color = INDEX_META[layer].color;
        return (
          <button
            key={layer}
            type="button"
            onClick={() => onSelect(layer)}
            aria-pressed={active}
            className={`jk-focus flex flex-col gap-0.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
              active
                ? "border-mint-border-strong bg-mint-100"
                : "border-border bg-cream-card hover:bg-cream-inset"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 flex-none rounded-full" style={{ background: color }} />
                <span className={`text-[11px] font-bold ${active ? "text-forest-ink-900" : "text-ink-600"}`}>
                  {INDEX_META[layer].short}
                </span>
              </span>
              <span className={`text-[11px] font-semibold tabular-nums ${active ? "text-forest-ink-700" : "text-ink-400"}`}>
                {latest == null ? "—" : latest.toFixed(2)}
              </span>
            </div>
            <div className="text-[10px] tabular-nums text-ink-400">
              {range == null ? "No readings" : `min ${range.min.toFixed(2)} · max ${range.max.toFixed(2)}`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
