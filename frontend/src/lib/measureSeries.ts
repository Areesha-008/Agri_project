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
