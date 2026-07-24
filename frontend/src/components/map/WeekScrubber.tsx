"use client";

import { formatTileLabel, type WeekTile } from "@/lib/weekTiles";

export type TileState = "empty" | "cached" | "analyzing";

// Must match `.jk-slider::-webkit-slider-thumb` width in globals.css (20px).
// A native range thumb's travel is inset by its own radius, so the tick
// rail below has to be positioned against that same inset — flexbox
// `justify-between` alone insets by half a dot width instead, which drifts
// visibly out of sync with the thumb as tile count grows.
const THUMB_DIAMETER_PX = 20;
const THUMB_RADIUS_PX = THUMB_DIAMETER_PX / 2;

interface WeekScrubberProps {
  tiles: WeekTile[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  /** Per-tile status driving the tick-rail color. */
  stateForTile: (tile: WeekTile, index: number) => TileState;
  /** Slider aria-label — the surrounding context differs (re-analyze vs. view). */
  ariaLabel?: string;
}

/**
 * The date scrubber shared by the /fields re-analyze panel and the landing
 * hero's 4-week view: a centered date label, a range slider over the tiles,
 * and a read-only tick rail. The rail is aria-hidden and non-interactive —
 * the range input's thumb/track/arrow-keys are the only interaction. Three
 * tick states: dim = no reading, mid-green pulse = analyzing, solid dark-green
 * = has a reading.
 */
export function WeekScrubber({
  tiles,
  activeIndex,
  onIndexChange,
  stateForTile,
  ariaLabel = "Select a week",
}: WeekScrubberProps) {
  if (tiles.length === 0) return null;
  const activeTile = tiles[activeIndex] ?? null;

  return (
    <div className="flex flex-col gap-2">
      {/* The date is the one thing this control exists to communicate — the
          focal point, sized to lead; the slider and rail are the mechanism. */}
      <div className="text-center text-[13px] font-bold text-ink-900">
        {activeTile ? formatTileLabel(activeTile) : ""}
      </div>
      {tiles.length > 1 && (
        <>
          <input
            type="range"
            min={0}
            max={tiles.length - 1}
            step={1}
            value={activeIndex}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            aria-label={ariaLabel}
            aria-valuetext={activeTile ? formatTileLabel(activeTile) : undefined}
            className="jk-focus jk-slider h-5 w-full cursor-pointer"
          />
          <div aria-hidden="true" className="relative h-2">
            {tiles.map((tile, i) => {
              const state = stateForTile(tile, i);
              const fraction = i / (tiles.length - 1);
              return (
                <div
                  key={tile.start}
                  title={formatTileLabel(tile)}
                  style={{ left: `calc(${THUMB_RADIUS_PX}px + (100% - ${THUMB_DIAMETER_PX}px) * ${fraction})` }}
                  className={`absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full transition-colors ${
                    state === "analyzing"
                      ? "animate-pulse bg-forest-700"
                      : state === "cached"
                        ? "bg-forest-900"
                        : "bg-ink-400/40"
                  } ${i === activeIndex ? "ring-2 ring-forest-900 ring-offset-1 ring-offset-cream-card" : ""}`}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
