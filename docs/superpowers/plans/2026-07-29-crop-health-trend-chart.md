# Crop Health "Season trend" Chart Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Crop Health page's sparkline tiles + axis-less chart with a vertical index list (min/max-of-mean, no sparkline) on the left and a real-axis Recharts detail chart expanded into the space the removed yield/health-gauge card used to occupy.

**Architecture:** `MeasureTrendChart.tsx` (one combined widget: tile grid + Compare mode + hand-rolled SVG chart) is deleted and replaced by two focused client components — `MeasureIndexList` (left card) and `MeasureDetailChart` (right card, built on Recharts) — sharing a `selected: IndexLayer` state lifted into `HealthPage`. Series-shaping logic they both need moves into a new `lib/measureSeries.ts` module. `health/page.tsx`'s "Projected yield" card is deleted; the index list takes its grid slot.

**Tech Stack:** Next.js 16 / React 19 (existing), Recharts ^3.10.1 (new dependency — confirmed React 19 peer-dep support via `npm view recharts peerDependencies`), Tailwind v4 (existing), Playwright (existing e2e runner).

## Global Constraints

- No backend changes — all data needed (`NdviHistoryItem[]`, mean/min/max per index per satellite pass) is already returned by `GET /fields/{id}/ndvi`.
- No qualitative health-interpretation (stressed/moderate/healthy or similar) on the chart — prototyped and explicitly rejected during design review. The y-axis is plain numeric gridlines only.
- The yield/health-gauge feature itself is **not** being removed from the app — only its card instance on the Crop Health page. `HealthGauge` and `useCropHealth` stay in use on `app/(app)/dashboard/page.tsx`, untouched.
- This repo has **no unit-test framework** (no jest/vitest/@testing-library — confirmed via `frontend/package.json`). Its only automated frontend tests are Playwright e2e specs in `frontend/e2e/`. Do not add a new test framework for this feature — verification is `npm run lint` + `npx tsc --noEmit` + a Playwright e2e spec + a manual browser check, matching the existing convention.
- `npm`/`npx` are not on PATH in this shell (Anaconda shadows them) — prefix every command with `export PATH="/usr/local/bin:$PATH"` and run from `frontend/`.
- `npm run lint` runs plain `eslint` (flat config) — do not use `next lint`, it doesn't exist in this Next.js version and parses `lint` as a directory.

---

### Task 1: Shared series-shaping helpers

**Files:**
- Create: `frontend/src/lib/measureSeries.ts`

**Interfaces:**
- Consumes: `NdviHistoryItem` (`@/lib/api/types`), `IndexLayer`/`layerStats` (`@/lib/measures`).
- Produces (used by Tasks 2 and 3):
  - `export type Point = { date: string; mean: number; min: number; max: number }`
  - `export type ChartRow = { x: number; mean: number | null; min: number | null; spread: number | null }`
  - `export function dedupeByDate(history: NdviHistoryItem[]): NdviHistoryItem[]`
  - `export function seriesFor(rows: NdviHistoryItem[], layer: IndexLayer): Point[]`
  - `export function parseDateMs(iso: string): number`
  - `export function fmtDate(ms: number): string`
  - `export function dateDomain(dates: string[]): [number, number]`
  - `export function yDomain(series: Point[]): [number, number]`
  - `export function tickXs(series: Point[]): number[]`
  - `export function meanRange(series: Point[]): { min: number; max: number } | null`
  - `export function buildChartRows(series: Point[]): ChartRow[]`
  - `export const GAP_BREAK_DAYS = 21`

This is a straight extraction of logic that already exists (and is already correct/battle-tested) in the current `frontend/src/components/ui/MeasureTrendChart.tsx` (`dedupeByDate`, `seriesFor`, `fmtDate`, `parseDateMs`, `dateDomain`, the `DetailChart` component's y-domain-with-8%-padding calculation), plus new logic to bridge the old hand-rolled SVG gap-drawing (`splitSegments`, which produced separate `<path>` shapes per contiguous run) into a single Recharts-friendly array with an explicit `null`-valued breakpoint row spliced into any real coverage gap — Recharts' `connectNulls={false}` then breaks the line/band there natively, which is simpler and more standard than rendering one chart element per segment.

- [ ] **Step 1: Write `lib/measureSeries.ts`**

```typescript
import type { NdviHistoryItem } from "@/lib/api/types";
import { layerStats, type IndexLayer } from "@/lib/measures";

export type Point = { date: string; mean: number; min: number; max: number };

/** One row on the chart's shared numeric x-axis. `mean`/`min`/`spread` are
 * all null on rows spliced in at a real coverage gap (see buildChartRows) —
 * connectNulls={false} on the Recharts Area/Line breaks the shape there. */
export type ChartRow = { x: number; mean: number | null; min: number | null; spread: number | null };

const DAY_MS = 86_400_000;

/** ~3x this app's own weekly NDVI bucketing cadence — a wider gap than this
 * means real missing satellite coverage, not just calendar noise. */
export const GAP_BREAK_DAYS = 21;

/**
 * Repeated re-analysis of the same week (e.g. clicking a preset before the
 * gap-check fix, or just re-running "Analyse this period") writes a NEW
 * NdviHistory row instead of updating one — the backend keeps every row and
 * only orders by computed_at as a tiebreak (see get_field_ndvi). Left
 * undeduped, the chart would plot every one of those as its own point.
 * history is newest-first with computed_at DESC as the tiebreak, so keeping
 * the first occurrence per date keeps the most recently computed one.
 */
export function dedupeByDate(history: NdviHistoryItem[]): NdviHistoryItem[] {
  const seen = new Set<string>();
  const out: NdviHistoryItem[] = [];
  for (const r of history) {
    if (seen.has(r.satellite_image_date)) continue;
    seen.add(r.satellite_image_date);
    out.push(r);
  }
  return out;
}

/** Oldest→newest series of a single measure, dropping rows that predate it. */
export function seriesFor(rows: NdviHistoryItem[], layer: IndexLayer): Point[] {
  const out: Point[] = [];
  for (const r of rows) {
    const s = layerStats(r, layer);
    if (s.mean == null) continue;
    out.push({ date: r.satellite_image_date, mean: s.mean, min: s.min ?? s.mean, max: s.max ?? s.mean });
  }
  return out;
}

// Parsed once per relative-position calculation, never compared for exact
// calendar-day equality — a systematic UTC-midnight offset cancels out when
// every date is placed on the same shared timeline.
export function parseDateMs(iso: string): number {
  return new Date(iso).getTime();
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** X-axis domain in epoch ms. Padded by a day on each side for a single-date
 * series — Recharts' numeric axis needs domain[0] < domain[1]. */
export function dateDomain(dates: string[]): [number, number] {
  const ms = dates.map(parseDateMs);
  let lo = Math.min(...ms);
  let hi = Math.max(...ms);
  if (hi === lo) {
    lo -= DAY_MS;
    hi += DAY_MS;
  }
  return [lo, hi];
}

/** Y-axis domain: the field's actual min/max for the period, padded ~8% —
 * matches how the chart has always scaled, just now with labeled ticks. */
export function yDomain(series: Point[]): [number, number] {
  let lo = Math.min(...series.map((p) => p.min));
  let hi = Math.max(...series.map((p) => p.max));
  if (hi === lo) {
    hi += 0.05;
    lo -= 0.05;
  }
  const pad = (hi - lo) * 0.08;
  return [lo - pad, hi + pad];
}

/** Explicit x-axis tick positions (real readings only, never a spliced-in
 * gap breakpoint) — mirrors the old DateAxis: show every date when there
 * are few enough to fit, otherwise just the first and last. */
export function tickXs(series: Point[]): number[] {
  const xs = series.map((p) => parseDateMs(p.date));
  if (xs.length <= 6) return xs;
  return [xs[0], xs[xs.length - 1]];
}

/** Min/max of the *mean* across the period — "how low/high has this
 * measure's average gone this period," shown on the index-list row. */
export function meanRange(series: Point[]): { min: number; max: number } | null {
  if (series.length === 0) return null;
  const means = series.map((p) => p.mean);
  return { min: Math.min(...means), max: Math.max(...means) };
}

/**
 * Flattens a Point[] onto one shared numeric x-axis, splicing a null row at
 * the midpoint of any real coverage gap (> GAP_BREAK_DAYS) so the mean line
 * and the min/max band break there instead of bridging months with zero
 * actual readings. `min`/`spread` (= max - min) are plain numbers, stacked
 * with Recharts' `stackId` to draw the min→max band — deliberately not an
 * array-valued dataKey, so a null gap row behaves exactly like an ordinary
 * numeric Area/Line gap with no special-casing needed.
 */
export function buildChartRows(series: Point[]): ChartRow[] {
  const rows: ChartRow[] = [];
  series.forEach((p, i) => {
    const x = parseDateMs(p.date);
    rows.push({ x, mean: p.mean, min: p.min, spread: p.max - p.min });
    if (i < series.length - 1) {
      const nextMs = parseDateMs(series[i + 1].date);
      const gapDays = (nextMs - x) / DAY_MS;
      if (gapDays > GAP_BREAK_DAYS) {
        rows.push({ x: (x + nextMs) / 2, mean: null, min: null, spread: null });
      }
    }
  });
  return rows;
}
```

- [ ] **Step 2: Typecheck and lint**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: both pass with no errors (this file isn't imported anywhere yet, so it only needs to be internally valid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/measureSeries.ts
git commit -m "Add shared measure-series helpers for the trend chart rework"
```

---

### Task 2: `MeasureIndexList` component

**Files:**
- Create: `frontend/src/components/ui/MeasureIndexList.tsx`

**Interfaces:**
- Consumes: `Point`, `dedupeByDate`, `seriesFor`, `meanRange` (Task 1, `@/lib/measureSeries`); `INDEX_LAYERS`, `INDEX_META`, `IndexLayer` (`@/lib/measures`); `NdviHistoryItem` (`@/lib/api/types`).
- Produces (used by Task 4's page wiring):
  - `export function MeasureIndexList(props: { history: NdviHistoryItem[]; selected: IndexLayer; onSelect: (layer: IndexLayer) => void }): JSX.Element`

- [ ] **Step 1: Write the component**

```tsx
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
    <div className="flex flex-col gap-1.5">
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
```

- [ ] **Step 2: Typecheck and lint**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: both pass (component isn't wired into a page yet, but is fully self-contained and valid).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/MeasureIndexList.tsx
git commit -m "Add MeasureIndexList — index rows with latest + season min/max, no sparkline"
```

---

### Task 3: `MeasureDetailChart` component (Recharts)

**Files:**
- Create: `frontend/src/components/ui/MeasureDetailChart.tsx`
- Modify: `frontend/package.json`, `frontend/package-lock.json` (new dependency)

**Interfaces:**
- Consumes: `ChartRow`, `Point`, `buildChartRows`, `dateDomain`, `dedupeByDate`, `fmtDate`, `seriesFor`, `tickXs`, `yDomain` (Task 1, `@/lib/measureSeries`); `INDEX_META`, `indexLabel`, `IndexLayer` (`@/lib/measures`); `NdviHistoryItem` (`@/lib/api/types`); `recharts` (new dependency).
- Produces (used by Task 4's page wiring):
  - `export function MeasureDetailChart(props: { history: NdviHistoryItem[]; selected: IndexLayer }): JSX.Element`

- [ ] **Step 1: Add the Recharts dependency**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npm install recharts
```

Expected: `recharts` (`^3.10.1` or newer) appears under `dependencies` in `package.json`; `package-lock.json` updates; install completes with no peer-dependency errors (`recharts`'s `peerDependencies` already cover `react`/`react-dom` `^19.0.0`, matching this repo's React 19.2.4).

- [ ] **Step 2: Write the component**

```tsx
"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NdviHistoryItem } from "@/lib/api/types";
import { INDEX_META, indexLabel, type IndexLayer } from "@/lib/measures";
import {
  buildChartRows,
  dateDomain,
  dedupeByDate,
  fmtDate,
  seriesFor,
  tickXs,
  yDomain,
  type ChartRow,
} from "@/lib/measureSeries";

interface MeasureDetailChartProps {
  history: NdviHistoryItem[];
  selected: IndexLayer;
}

/**
 * Right-column expanded detail chart for whichever index is selected in
 * MeasureIndexList. Real y-axis ticks/gridlines (data-fitted domain, ~8%
 * padded) and the existing x-axis date formatting — no qualitative
 * stressed/moderate/healthy bands, dropped per design review. The min/max
 * band is two stacked Areas (`min` invisible + `spread` = max-min visible)
 * rather than an array-valued dataKey, so a real coverage gap's null
 * breakpoint row (see buildChartRows) behaves like an ordinary Area/Line
 * gap with no extra handling.
 */
export function MeasureDetailChart({ history, selected }: MeasureDetailChartProps) {
  const rows = useMemo(() => dedupeByDate(history).reverse(), [history]);
  const series = useMemo(() => seriesFor(rows, selected), [rows, selected]);
  const label = indexLabel(selected);
  const color = INDEX_META[selected].color;

  if (series.length === 0) {
    return (
      <div className="grid min-h-[300px] place-items-center rounded-xl border border-border bg-cream-card text-xs text-ink-400">
        No readings yet for {label}.
      </div>
    );
  }

  const chartRows = buildChartRows(series);
  const [yLo, yHi] = yDomain(series);
  const xDomain = dateDomain(series.map((p) => p.date));
  const ticks = tickXs(series);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-forest-ink-900">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div data-testid="measure-detail-chart" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid horizontal vertical={false} stroke="var(--color-border)" strokeDasharray="2 3" />
            <XAxis
              dataKey="x"
              type="number"
              domain={xDomain}
              ticks={ticks}
              tickFormatter={fmtDate}
              tick={{ fontSize: 10, fill: "var(--color-ink-400)" }}
              axisLine={{ stroke: "var(--color-border)" }}
              tickLine={false}
            />
            <YAxis
              domain={[yLo, yHi]}
              tickFormatter={(v: number) => v.toFixed(2)}
              tick={{ fontSize: 10, fill: "var(--color-ink-400)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "var(--color-ink-400)", strokeDasharray: "3 3", strokeOpacity: 0.7 }}
            />
            <Area dataKey="min" stackId="range" stroke="none" fill="transparent" connectNulls={false} isAnimationActive={false} />
            <Area
              dataKey="spread"
              stackId="range"
              stroke="none"
              fill={color}
              fillOpacity={0.16}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="mean"
              stroke={color}
              strokeWidth={2}
              dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5, fill: color, stroke: "var(--color-cream-card)", strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartRow }[] }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  if (row.mean == null || row.min == null || row.spread == null) return null;
  const max = row.min + row.spread;
  return (
    <div className="rounded-lg border border-border bg-cream-card px-2.5 py-1.5 text-[10.5px] shadow-dropdown">
      <div className="font-bold text-ink-900">{fmtDate(row.x)}</div>
      <div className="mt-0.5 flex gap-2 tabular-nums">
        <span className="text-forest-ink-700">mean {row.mean.toFixed(2)}</span>
        <span className="text-ink-400">
          {row.min.toFixed(2)}–{max.toFixed(2)}
        </span>
      </div>
    </div>
  );
}
```

Note (deliberate simplification, matches this codebase's existing "narrate the trade-off" comment style): a reading that's isolated by a real coverage gap on *both* sides renders as a lone dot with no min/max tick — the old hand-rolled chart drew a short vertical tick for that case, but Recharts' stacked-Area band needs at least two consecutive non-null rows to fill a shape. This is a narrow edge case (a single reading surrounded by 21+ day gaps on both sides); if it ever needs the tick back, add a `<Scatter>` + `<ErrorBar>` overlay for exactly the isolated points.

- [ ] **Step 3: Typecheck and lint**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: both pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/ui/MeasureDetailChart.tsx
git commit -m "Add MeasureDetailChart — Recharts detail chart with a real y-axis, no health bands"
```

---

### Task 4: Wire into the Crop Health page; delete the old widget

**Files:**
- Modify: `frontend/src/app/(app)/health/page.tsx`
- Modify: `frontend/src/lib/measures.ts`
- Delete: `frontend/src/components/ui/MeasureTrendChart.tsx`

**Interfaces:**
- Consumes: `MeasureIndexList` (Task 2), `MeasureDetailChart` (Task 3), `IndexLayer` (`@/lib/measures`).
- Produces: nothing further downstream — this is the page-level integration point.

- [ ] **Step 1: Remove the now-dead `range` field from `INDEX_META`**

`INDEX_META[layer].range` had exactly one reader in the whole codebase — `CompareChart` in `MeasureTrendChart.tsx`, being deleted in Step 4 below. Confirm before editing:

```bash
cd frontend/src
grep -rn "\.range\b" --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Expected: only the `MeasureTrendChart.tsx` hit. Then edit `frontend/src/lib/measures.ts` — replace the top of the file:

```typescript
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
```

with:

```typescript
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
```

Leave the rest of `measures.ts` (`INDEX_LAYERS`, `indexLabel`, `MEASURES`, `layerPng`, `layerStats`) untouched.

- [ ] **Step 2: Delete the old widget**

```bash
git rm frontend/src/components/ui/MeasureTrendChart.tsx
```

- [ ] **Step 3: Rewrite `health/page.tsx`'s imports and state**

Replace the import block:

```typescript
import {
  useAllCropHealth,
  useCropHealth,
  useField,
  useFieldNdvi,
  useFields,
  useNdviJob,
  useReanalyzeField,
} from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Card } from "@/components/ui/Card";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { TimeWindowPicker, type DateRange } from "@/components/ui/TimeWindowPicker";
import { MeasureTrendChart } from "@/components/ui/MeasureTrendChart";
import { computeWeeklyTiles, matchEntry } from "@/lib/weekTiles";
```

with:

```typescript
import {
  useAllCropHealth,
  useField,
  useFieldNdvi,
  useFields,
  useNdviJob,
  useReanalyzeField,
} from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Card } from "@/components/ui/Card";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { TimeWindowPicker, type DateRange } from "@/components/ui/TimeWindowPicker";
import { MeasureIndexList } from "@/components/ui/MeasureIndexList";
import { MeasureDetailChart } from "@/components/ui/MeasureDetailChart";
import { computeWeeklyTiles, matchEntry } from "@/lib/weekTiles";
import type { IndexLayer } from "@/lib/measures";
```

(`useCropHealth` is dropped from the hooks import — `health/page.tsx`'s only use of it was the yield card being deleted in Step 4. `HealthGauge` stays: the "All fields" grid further down the same page still renders it via the separate `useAllCropHealth`/`allHealth` hook.)

Inside `HealthPage`, delete this line (the single-field crop-health fetch, now unused):

```typescript
  const { data: health } = useCropHealth(selectedFieldId);
```

Add a `selected` state next to the existing `timeWindow` state:

```typescript
  const [timeWindow, setTimeWindow] = useState<DateRange | null>(null);
  const [selected, setSelected] = useState<IndexLayer>("ndvi");
```

- [ ] **Step 4: Replace the two-card grid**

Replace this whole block:

```tsx
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        {/* Yield projection */}
        <Card className="flex items-center gap-5">
          <HealthGauge score={health?.health_score ?? 0} size={130} label={(health?.status_label ?? "—").toUpperCase()} />
          <div className="flex flex-1 flex-col gap-2.5">
            <div className="text-sm font-bold">Projected yield — {field?.name ?? "—"}</div>
            <div className="text-2xl font-extrabold leading-none text-forest-ink-900">
              {health?.yield_maund_per_acre ?? "—"}{" "}
              <span className="text-[13px] font-semibold text-ink-400">
                maund/acre · {health?.yield_t_per_ha ?? "—"} t/ha
              </span>
            </div>
            <div className="h-2 rounded-full bg-cream-inset">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-mint-300 to-forest-500"
                style={{ width: `${health?.health_score ?? 0}%` }}
              />
            </div>
            <div className="text-[11.5px] leading-snug text-ink-500">
              Based on {field?.area_hectares ?? "—"} ha area and district baseline ({health?.baseline_district ?? "—"}
              , {health?.baseline_crop ?? "—"}).
            </div>
          </div>
        </Card>

        {/* Season trend — all measures (sparkline overview) + selected-measure detail */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-bold">Season trend — {field?.name ?? "—"}</div>
            {isAnalyzing ? (
              <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-cream-inset border-t-forest-500" />
                Analysing via Sentinel-2…
              </div>
            ) : (
              <TimeWindowPicker value={timeWindow} onChange={handleWindowChange} disabled={!selectedFieldId || reanalyzeField.isPending} />
            )}
          </div>
          <MeasureTrendChart history={filteredHistory} />
        </Card>
      </div>
```

with:

```tsx
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[300px_1fr]">
        {/* Indices — replaces the yield/health-gauge card. Selecting a row
            loads it into the expanded chart on the right. */}
        <Card className="flex flex-col gap-2.5">
          <div className="text-sm font-bold">Indices — {field?.name ?? "—"}</div>
          <MeasureIndexList history={filteredHistory} selected={selected} onSelect={setSelected} />
        </Card>

        {/* Season trend — expanded detail chart for the selected index */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-bold">Season trend — {field?.name ?? "—"}</div>
            {isAnalyzing ? (
              <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-cream-inset border-t-forest-500" />
                Analysing via Sentinel-2…
              </div>
            ) : (
              <TimeWindowPicker value={timeWindow} onChange={handleWindowChange} disabled={!selectedFieldId || reanalyzeField.isPending} />
            )}
          </div>
          <MeasureDetailChart history={filteredHistory} selected={selected} />
        </Card>
      </div>
```

Everything below this block (the "All fields" grid and "Lab recommendations" card) is unchanged.

- [ ] **Step 5: Typecheck and lint**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
```

Expected: both pass — this is the point where the old file's deletion and every reference to it/`.range` must resolve cleanly across the whole project.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/"(app)"/health/page.tsx frontend/src/lib/measures.ts
git add frontend/src/components/ui/MeasureTrendChart.tsx
git commit -m "Replace Crop Health's yield card + sparkline widget with the index list + expanded chart"
```

---

### Task 5: E2e coverage

**Files:**
- Create: `frontend/e2e/health.spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks directly — drives the real page through the browser, mocking the same API routes `fields.spec.ts` already mocks (`auth/guest`, `auth/me`, `fields`, `fields/:id`) plus `fields/:id/ndvi` (populated this time) and `fields/:id/crop-health` (read by the still-present "All fields" grid via `useAllCropHealth`).

- [ ] **Step 1: Write the test**

```typescript
import { expect, test } from "@playwright/test";

const MOCK_USER = { id: "11111111-1111-1111-1111-111111111111", email: "guest@jadeedkashtkar.demo", is_active: true, created_at: "2026-01-01T00:00:00Z" };
const MOCK_FIELD = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Mocked Field",
  geometry: { type: "Polygon", coordinates: [[[73.08, 31.4], [73.09, 31.4], [73.09, 31.41], [73.08, 31.41], [73.08, 31.4]]] },
  area_hectares: 12.4,
  district: "Faisalabad",
  crop: "Wheat",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function ndviRow(date: string, ndviMean: number) {
  return {
    id: `row-${date}`,
    ndvi_mean: ndviMean, ndvi_min: ndviMean - 0.1, ndvi_max: ndviMean + 0.1,
    ndmi_mean: 0.06, ndmi_min: -0.03, ndmi_max: 0.15,
    ndre_mean: 0.22, ndre_min: 0.14, ndre_max: 0.3,
    nbr2_mean: 0.11, nbr2_min: 0.06, nbr2_max: 0.16,
    ndwi_mean: -0.35, ndwi_min: -0.44, ndwi_max: -0.26,
    cci_mean: 0.52, cci_min: 0.42, cci_max: 0.62,
    evi_mean: 0.23, evi_min: 0.16, evi_max: 0.31,
    savi_mean: 0.21, savi_min: 0.13, savi_max: 0.29,
    date_range_start: null,
    satellite_image_date: date,
    cloud_cover_percent: 5,
    source_collection: "sentinel-2-l2a",
    ndvi_png_url: null, ndmi_png_url: null, ndre_png_url: null, nbr2_png_url: null,
    ndwi_png_url: null, cci_png_url: null, evi_png_url: null, savi_png_url: null,
    computed_at: "2026-07-20T00:00:00Z",
  };
}
// The real API returns history newest-first (get_field_ndvi orders by
// computed_at DESC) — MeasureIndexList/MeasureDetailChart both do
// `dedupeByDate(history).reverse()` to get oldest→newest internally, so this
// mock has to match that newest-first contract or "latest" comes out as the
// wrong end of the array.
const MOCK_HISTORY = [ndviRow("2026-07-19", 0.31), ndviRow("2026-07-12", 0.34), ndviRow("2026-07-05", 0.3)];

const MOCK_CROP_HEALTH = {
  field_id: MOCK_FIELD.id,
  health_score: 60,
  status_label: "Healthy",
  yield_maund_per_acre: 26.18,
  yield_t_per_ha: 2.11,
  baseline_district: "DEFAULT",
  baseline_crop: "DEFAULT",
  ndvi_trend: [],
};

/**
 * Exercises the reworked Crop Health page against a mocked backend: the
 * yield/health-gauge card is gone, the index list shows latest + season
 * min/max with no sparklines, selecting a row swaps the expanded chart, and
 * the chart has real y-axis tick labels. No live FastAPI/Postgres/CDSE
 * needed — see fields.spec.ts for the same pattern.
 */
test("crop health page shows the index list and swaps the expanded chart on selection", async ({ page }) => {
  await page.route("**/api/v1/auth/guest", (route) =>
    route.fulfill({ json: { access_token: "mock-token", token_type: "bearer" } }),
  );
  await page.route("**/api/v1/auth/me", (route) => route.fulfill({ json: MOCK_USER }));
  await page.route("**/api/v1/fields", (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({ json: [{ id: MOCK_FIELD.id, name: MOCK_FIELD.name, area_hectares: MOCK_FIELD.area_hectares, created_at: MOCK_FIELD.created_at }] });
    } else {
      route.continue();
    }
  });
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}`, (route) => route.fulfill({ json: MOCK_FIELD }));
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}/ndvi`, (route) =>
    route.fulfill({ json: { latest: MOCK_HISTORY[0], history: MOCK_HISTORY } }),
  );
  await page.route(`**/api/v1/fields/${MOCK_FIELD.id}/crop-health`, (route) => route.fulfill({ json: MOCK_CROP_HEALTH }));

  await page.goto("/login");
  await page.getByText("Try without an account").click();
  await page.waitForURL("**/fields");
  // A hard page.goto("/health") would reload and lose the in-memory
  // auth/query-cache state the guest-login click just established — follow
  // the sidebar link instead, like a real user would.
  await page.getByRole("link", { name: "Crop Health" }).click();
  await page.waitForURL("**/health");

  // Yield/health-gauge card is gone from this page.
  await expect(page.getByText("Projected yield")).toHaveCount(0);

  // Index list: NDVI row shows latest + season min/max, no sparkline svg.
  // series.at(-1) after dedupeByDate(history).reverse() is 2026-07-19 (the
  // newest date, first element of the newest-first mock) → latest 0.31.
  // meanRange takes min/max of the three ndvi_mean values (0.31/0.34/0.30)
  // — NOT the individual rows' own ndvi_min/ndvi_max — giving 0.30/0.34.
  const ndviRowLocator = page.getByRole("button", { name: /NDVI/ });
  await expect(ndviRowLocator).toBeVisible();
  await expect(ndviRowLocator.getByText("0.31")).toBeVisible();
  await expect(ndviRowLocator.getByText(/min 0\.30 · max 0\.34/)).toBeVisible();
  await expect(ndviRowLocator.locator("svg")).toHaveCount(0);

  // Default selection is NDVI; the chart header reflects it.
  await expect(page.getByText("NDVI — vegetation")).toBeVisible();

  // Selecting NDMI swaps the expanded chart's header.
  await page.getByRole("button", { name: /NDMI/ }).click();
  await expect(page.getByText("NDMI — moisture")).toBeVisible();

  // The chart has real y-axis tick labels now (Recharts renders them as SVG
  // <text> elements) — selected via our own data-testid, not a Recharts
  // internal class name, so this doesn't depend on Recharts' DOM structure.
  const chart = page.getByTestId("measure-detail-chart");
  await expect(chart.locator("svg")).toBeVisible();
  const tickCount = await chart.locator("svg text").count();
  expect(tickCount).toBeGreaterThan(0);

  // The old Single/Compare toggle no longer exists anywhere on the page.
  await expect(page.getByText("Compare", { exact: true })).toHaveCount(0);
});
```

- [ ] **Step 2: Run it**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx playwright test e2e/health.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/e2e/health.spec.ts
git commit -m "Add e2e coverage for the reworked Crop Health index list + detail chart"
```

---

### Task 6: Manual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Full project check**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npx tsc --noEmit
npm run lint
npx playwright test
```

Expected: all green.

- [ ] **Step 2: Manual browser check (per project convention for UI changes)**

```bash
export PATH="/usr/local/bin:$PATH"
cd frontend
npm run dev
```

Open `http://localhost:3000/login`, click "Try without an account" (real guest auth into the shared demo account — see the project's local-env notes; don't guess at real credentials), navigate to Crop Health, and confirm against the approved mockup (`https://claude.ai/code/artifact/066b416f-b6e8-43ee-a6da-1bfcdf7cd484`):

- No "Projected yield" card anywhere on the page.
- Left card is a vertical list of 8 rows: color dot, code, latest value, `min … · max …` — no mini-charts.
- Clicking a row highlights it and swaps the chart on the right.
- The chart has visible numeric y-axis tick labels and gridlines, dates on the x-axis, the translucent min/max band, and no stressed/moderate/healthy coloring.
- Hovering the chart shows the dashed crosshair + tooltip (date, mean, min–max).
- If the demo account's field has a real coverage gap (>21 days between two readings) in its history, confirm the line/band actually breaks there instead of bridging across it.
- Toggle light/dark theme and confirm the chart and list read correctly in both.

- [ ] **Step 3: Report status**

If everything matches, this plan is complete. If anything doesn't match, note the specific mismatch (which of the bullets above failed and how) rather than re-guessing at a fix inline — that's a signal to go back to the relevant task, not to patch around it here.
