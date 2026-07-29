# Crop Health "Season trend" chart rework

## Problem

`MeasureTrendChart` (`frontend/src/components/ui/MeasureTrendChart.tsx`), shown on the
Crop Health page (`frontend/src/app/(app)/health/page.tsx`), has two legibility problems:

1. The 8 small measure tiles above the main chart each carry a tiny sparkline. It's
   real data, but at that size it reads as decoration rather than information — it adds
   visual noise without adding anything the mean value doesn't already say.
2. The main detail chart below the tiles has no y-axis at all. A viewer sees a colored
   shape and a line but has no way to tell whether the value is good, bad, or what the
   vertical position even means numerically.

The widget also carries a "Compare" mode (up to 4 measures overlaid on one normalized
0–100% axis) that overlaps in purpose with the tiles and adds real complexity
(`compareSet`, `toggleCompare`, `COMPARE_CAP`, `CompareChart`) for a view nobody uses.

## Non-goals

- No backend changes. All data (`NdviHistoryItem[]`, already carrying per-index
  mean/min/max per satellite pass) is already returned by the existing API and is
  sufficient for everything below.
- No per-crop or per-growth-stage health thresholds. Bands are generic per index.
- No change to the 7D/30D/90D/Custom period picker or the underlying data-fetching
  logic in `health/page.tsx` — only the chart component itself changes.

## Design

### 1. Dependency: add Recharts

The current chart is 100% hand-rolled inline SVG; no charting library is installed in
`frontend/package.json` today. Add `recharts`. It provides `<YAxis>`, `<XAxis>`, and
`<ReferenceArea>` (a shaded region between two y-values, with an optional label) as
plain JSX components — exactly the primitives this rework needs, without hand-deriving
scale/axis math. (Considered `visx`: lower-level, would mean re-implementing axis/band
math by hand for no benefit here, since Recharts already provides both ready-made.)

Everything stays client-rendered in the browser — hover tooltips and tap-to-select
behavior are preserved, nothing moves to a server-rendered image.

### 2. Measure tiles: drop the sparkline

Each of the 8 tiles keeps: color dot, short code (NDVI, NDMI, …), and the latest mean
value — exactly as today. The `Sparkline` sub-component and its call site are deleted;
nothing replaces it. This was confirmed as the full scope of the tile change — no new
min/max figures are added to the tile.

### 3. Remove Compare mode

Delete `CompareChart`, the Single/Compare mode toggle, and the associated state
(`compareSet`, `toggleCompare`, `COMPARE_CAP`, `isActive`, `capped`). `MeasureTrendChart`
is only imported by `health/page.tsx`, and nothing outside the file touches Compare's
internals, so this is a self-contained deletion. The widget becomes: tile grid → one
detail chart for whichever measure is currently selected.

### 4. Detail chart: real axes + health bands

Rebuilt on Recharts (`ComposedChart` or equivalent), keeping every concept the current
chart already has, but making them legible:

- **Y-axis** — real tick marks and gridlines. Domain covers both the field's actual
  readings for the period and the index's known display range (`INDEX_META[layer].range`
  in `measures.ts`), padded slightly, so bands are never clipped and a value outside the
  "normal" range (e.g. an unusually high NDVI reading) still renders on-chart rather than
  being cut off.
- **X-axis** — unchanged: calendar dates, same formatting and tick-thinning behavior as
  today (`fmtDate`, `DateAxis`'s show-first/last-or-all-when-few logic).
- **Health bands** — three shaded `ReferenceArea` zones (stressed / moderate / healthy),
  positioned per the threshold table in §5, each with a small text label. Rendered in a
  fixed semantic scale reusing existing theme tokens — `--color-alert-red` (stressed),
  `--color-alert-amber` (moderate), `--color-forest-500` (healthy) — at low opacity, so
  they read as background context, not foreground data. This is deliberately independent
  of the measure's own identity hue (`INDEX_META[layer].color`), so band color always
  means the same thing (bad→good) regardless of which measure is selected.
- **Min/max band** — kept as today: the measure's own identity color, translucent, drawn
  per contiguous coverage segment, showing spatial variability across the field on each
  date. Layered on top of the health bands.
- **Mean line** — kept as today: solid line in the measure's identity color, broken
  across real coverage gaps (`GAP_BREAK_DAYS` = 21), with the existing hover
  interaction (nearest-point lookup, dashed guide line, tooltip showing exact
  date/mean/min–max).
- **Empty state** — unchanged: "No readings yet for {label}."

### 5. Threshold config

One new exported config in `measures.ts`, keyed by index, read by the detail chart to
place `ReferenceArea`s. Values are generic (not per-crop), drawn from widely-cited
remote-sensing guidelines, and intentionally isolated in one small data structure so
they can be retuned later without touching chart rendering code:

| Index | Stressed | Moderate | Healthy |
|---|---|---|---|
| NDVI | < 0.2 | 0.2 – 0.5 | > 0.5 |
| NDMI | < 0.0 | 0.0 – 0.2 | > 0.2 |
| NDRE | < 0.2 | 0.2 – 0.4 | > 0.4 |
| EVI | < 0.2 | 0.2 – 0.4 | > 0.4 |
| SAVI | < 0.2 | 0.2 – 0.4 | > 0.4 |
| NDWI | < 0.0 | 0.0 – 0.2 | > 0.2 |
| CIre (CCI) | < 1.0 | 1.0 – 2.0 | > 2.0 |
| NBR2 | *own display range split into thirds, labeled "low / moderate / high"* | | |

NBR2 has no established agronomic stress cutoff in the literature (it's more commonly
used for burn severity / residue moisture than crop health), so it gets the same visual
treatment with honest, non-agronomic labels instead of stressed/healthy language.

## Testing

- Existing frontend lint/typecheck must pass after the Recharts migration.
- Manual verification in the browser (per project convention for UI changes): tiles
  render without sparklines, detail chart shows labeled y-axis ticks and the three
  health bands for at least one index with an established threshold (e.g. NDVI) and for
  NBR2 (the tertile-split case), gap handling still breaks the line/band across a real
  coverage gap, hover tooltip still shows exact values, and the Single/Compare toggle no
  longer appears.
