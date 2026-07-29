# Crop Health "Season trend" chart rework

## Problem

The Crop Health page (`frontend/src/app/(app)/health/page.tsx`) lays out two cards
side by side: a "Projected yield" health-gauge card, and a "Season trend" card
containing `MeasureTrendChart` (`frontend/src/components/ui/MeasureTrendChart.tsx`).
That widget has legibility and layout problems:

1. The 8 small measure tiles carry a tiny sparkline each. It's real data, but at that
   size it reads as decoration — it adds visual noise without saying anything the
   number doesn't already say, and it doesn't show the season's actual range.
2. The main detail chart below the tiles has no y-axis at all. A viewer sees a colored
   shape and a line but has no way to tell what the vertical position means numerically.
3. The tiles and the chart are stacked in one card, so the chart itself is
   cramped — most of the card's height goes to the tile grid above it.
4. The widget also carries a "Compare" mode (up to 4 measures overlaid on one
   normalized 0–100% axis) that overlaps in purpose with the tiles and adds real
   complexity (`compareSet`, `toggleCompare`, `COMPARE_CAP`, `CompareChart`) for a view
   nobody uses.

## Non-goals

- No backend changes. All data (`NdviHistoryItem[]`, already carrying per-index
  mean/min/max per satellite pass) is already returned by the existing API and is
  sufficient for everything below.
- No qualitative health interpretation (stressed/moderate/healthy or similar) on the
  chart — considered and explicitly rejected in review. The axis is plain numeric
  gridlines.
- No change to the 7D/30D/90D/Custom period picker or the underlying data-fetching
  logic in `health/page.tsx`.
- No change to the yield/health-gauge feature itself — it still exists and is used
  as-is on the Dashboard page (`app/(app)/dashboard/page.tsx`). Only its instance on
  the Crop Health page is removed, per §3 below.

## Design

### 1. Dependency: add Recharts

The current chart is 100% hand-rolled inline SVG; no charting library is installed in
`frontend/package.json` today. Add `recharts`. It provides `<YAxis>`/`<XAxis>` as plain
JSX components with real tick/gridline support, without hand-deriving scale math.
Everything stays client-rendered in the browser — hover tooltips and tap-to-select
behavior are preserved, nothing moves to a server-rendered image.

### 2. Index list: drop the sparkline, add season min/max

Each of the 8 rows keeps color dot, short code (NDVI, NDMI, …), and the latest mean
value, and adds two more figures: the **minimum and maximum of the mean series**
across the currently-selected period (7D/30D/90D/Custom) — i.e. "how low and high has
this measure's average gone this period," computed with `Math.min`/`Math.max` over the
same per-layer series already assembled for the chart (`seriesFor` in the current
code). No new API calls — this is a client-side reduction over data already fetched.

The `Sparkline` sub-component is deleted entirely.

The list changes from a 2×4 grid of tiles to a vertical list of rows (see §4), so each
row now reads as (mirroring the approved mockup):

```
● NDVI          0.35
  min 0.28 · max 0.42
```

### 3. Page layout: index list replaces the yield card

The "Projected yield" card (`HealthGauge` + yield figures, `health/page.tsx` lines
~93–115) is removed from this page. The two-column grid's left slot is taken by the
index list from §2; the right slot keeps the "Season trend" card (title + period
picker), now containing only the expanded detail chart — no longer sharing vertical
space with a tile grid above it.

Concretely:
- `frontend/src/components/ui/MeasureTrendChart.tsx` is split into two focused
  components: `MeasureIndexList` (the left card's contents — the row list from §2,
  taking `history`, `selected`, `onSelect`) and `MeasureDetailChart` (the right card's
  contents — the chart from §4, taking `history`, `selected`). Series-computation
  helpers they both need (`dedupeByDate`, `seriesFor`, date/gap helpers) move to a
  shared module rather than being duplicated.
- `selected: IndexLayer` state moves up into `HealthPage`, passed down to both new
  components — the same lifting pattern the page already uses for `timeWindow`.
- `useCropHealth`/`health` and the `HealthGauge` import become dead in this file once
  the yield card is deleted and are removed (the "All fields" grid further down the
  same page uses a *different* hook, `useAllCropHealth`/`allHealth`, and is unaffected;
  `HealthGauge` itself is not deleted since that grid still renders it).
- Compare mode is deleted in this same pass: `CompareChart`, the Single/Compare
  toggle, and its state (`compareSet`, `toggleCompare`, `COMPARE_CAP`, `isActive`,
  `capped`). Nothing outside `MeasureTrendChart.tsx` touches Compare's internals.

### 4. Detail chart: real y-axis, no interpretive bands

Rebuilt on Recharts, keeping every concept the current chart already has, but making
the axis legible:

- **Y-axis** — real tick marks and gridlines. Domain is data-fitted (the field's actual
  min/max readings for the period, padded ~8%), matching how the chart already scales
  today — just with labeled ticks added. (An index's full theoretical display range was
  considered as the fixed domain instead, to support health-band context, but bands
  were dropped — see below — so a data-fitted domain is simpler and keeps low-variance
  indices like NDMI legible instead of rendering as a near-flat line across a wide fixed
  scale.)
- **X-axis** — unchanged: calendar dates, same formatting and tick-thinning behavior as
  today (`fmtDate`, `DateAxis`'s show-first/last-or-all-when-few logic).
- **No health bands.** Stressed/moderate/healthy zones were prototyped and explicitly
  rejected — the chart carries no qualitative interpretation layer.
- **Min/max band** — kept as today: the measure's own identity color, translucent,
  drawn per contiguous coverage segment, showing spatial variability across the field
  on each date.
- **Mean line** — kept as today: solid line in the measure's identity color, broken
  across real coverage gaps (`GAP_BREAK_DAYS` = 21), with the existing hover
  interaction (nearest-point lookup, dashed guide line, tooltip showing exact
  date/mean/min–max).
- **Empty state** — unchanged: "No readings yet for {label}."

## Testing

- Existing frontend lint/typecheck must pass after the Recharts migration and the
  component split.
- Manual verification in the browser (per project convention for UI changes): the
  yield card is gone from Crop Health but unchanged on the Dashboard; the index list
  shows latest + min/max of mean per row with no sparklines; selecting a row expands
  the chart on the right with labeled y-axis ticks and no health bands; gap handling
  still breaks the line/band across a real coverage gap; hover tooltip still shows
  exact values; the Single/Compare toggle no longer appears anywhere.
