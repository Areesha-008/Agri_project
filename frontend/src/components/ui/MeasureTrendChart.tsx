"use client";

import { useMemo, useState } from "react";
import type { NdviHistoryItem } from "@/lib/api/types";
import {
  INDEX_LAYERS,
  INDEX_META,
  indexLabel,
  layerStats,
  type IndexLayer,
} from "@/lib/measures";

type Point = { date: string; mean: number; min: number; max: number };

/** Oldest→newest series of a single measure, dropping rows that predate it. */
function seriesFor(rows: NdviHistoryItem[], layer: IndexLayer): Point[] {
  const out: Point[] = [];
  for (const r of rows) {
    const s = layerStats(r, layer);
    if (s.mean == null) continue;
    out.push({ date: r.satellite_image_date, mean: s.mean, min: s.min ?? s.mean, max: s.max ?? s.mean });
  }
  return out;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const COMPARE_CAP = 4;

/**
 * Crop-health season trend, two modes:
 *  · Single — one measure's mean line + min/max variability band (hover for
 *    exact numbers). Best for reading absolute level.
 *  · Compare — up to 4 measures overlaid, each normalized to its own display
 *    range onto one 0–100% axis, for comparing *trajectories* ("nitrogen
 *    rising while moisture falls"). One axis; never two y-scales.
 * Each measure carries a fixed, CVD-validated identity hue used everywhere
 * (sparkline, single line, overlay), so a colour always means the same index.
 * Colours are theme-swapped --m-* tokens; identity is never colour-alone
 * (every mark is labelled, and the overlay has a legend + end-labels).
 */
export function MeasureTrendChart({ history }: { history: NdviHistoryItem[] }) {
  // get_field_ndvi returns newest-first; charts read left(old)→right(new).
  const rows = useMemo(() => [...history].reverse(), [history]);
  const [mode, setMode] = useState<"single" | "compare">("single");
  const [selected, setSelected] = useState<IndexLayer>("ndvi");
  const [compareSet, setCompareSet] = useState<IndexLayer[]>(["ndvi", "ndmi", "ndre"]);

  const seriesByLayer = useMemo(() => {
    const m = {} as Record<IndexLayer, Point[]>;
    for (const l of INDEX_LAYERS) m[l] = seriesFor(rows, l);
    return m;
  }, [rows]);

  function toggleCompare(layer: IndexLayer) {
    setCompareSet((prev) =>
      prev.includes(layer)
        ? prev.filter((l) => l !== layer)
        : prev.length >= COMPARE_CAP
          ? prev
          : [...prev, layer],
    );
  }

  const isActive = (l: IndexLayer) => (mode === "compare" ? compareSet.includes(l) : l === selected);
  const capped = mode === "compare" && compareSet.length >= COMPARE_CAP;

  return (
    <div className="flex flex-col gap-3">
      {/* mode toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] text-ink-400">
          {mode === "single" ? "Tap a measure to inspect it" : `Compare up to ${COMPARE_CAP} — tap to toggle`}
        </div>
        <div role="group" aria-label="Chart mode" className="flex rounded-lg bg-cream-inset p-0.5 text-[11px] font-semibold">
          {(["single", "compare"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className="cursor-pointer rounded-md px-2.5 py-1 capitalize"
              style={mode === m ? { background: "var(--color-forest-900)", color: "#fff" } : undefined}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* sparkline strip — selector (single: radio · compare: toggle) */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {INDEX_LAYERS.map((layer) => (
          <SparkTile
            key={layer}
            layer={layer}
            series={seriesByLayer[layer]}
            active={isActive(layer)}
            disabled={capped && !compareSet.includes(layer)}
            onSelect={() => (mode === "compare" ? toggleCompare(layer) : setSelected(layer))}
          />
        ))}
      </div>

      {mode === "single" ? (
        <DetailChart label={indexLabel(selected)} color={INDEX_META[selected].color} series={seriesByLayer[selected]} />
      ) : (
        <CompareChart rows={rows} layers={compareSet} />
      )}
    </div>
  );
}

function SparkTile({
  layer,
  series,
  active,
  disabled,
  onSelect,
}: {
  layer: IndexLayer;
  series: Point[];
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const latest = series.at(-1)?.mean;
  const color = INDEX_META[layer].color;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={`jk-focus flex flex-col gap-1 rounded-lg border px-2.5 py-2 text-left transition-colors ${
        active
          ? "border-mint-border-strong bg-mint-100"
          : disabled
            ? "cursor-not-allowed border-border bg-cream-card opacity-40"
            : "border-border bg-cream-card hover:bg-cream-inset"
      }`}
    >
      <div className="flex items-center justify-between gap-1">
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
      <Sparkline series={series} color={color} />
    </button>
  );
}

/** Tiny own-scaled area+line in the measure's identity colour. */
function Sparkline({ series, color }: { series: Point[]; color: string }) {
  const W = 120;
  const H = 30;

  if (series.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[30px] w-full" preserveAspectRatio="none" aria-hidden>
        <line x1="0" y1={H - 2} x2={W} y2={H - 2} stroke="var(--color-ink-400)" strokeWidth="1" strokeOpacity="0.4" />
      </svg>
    );
  }

  const means = series.map((p) => p.mean);
  const lo = Math.min(...means);
  const hi = Math.max(...means);
  const span = hi - lo || 1;
  const pad = 3;
  const x = (i: number) => (series.length === 1 ? W / 2 : (i / (series.length - 1)) * W);
  const y = (v: number) => H - pad - ((v - lo) / span) * (H - 2 * pad);

  const pts = series.map((p, i) => `${x(i).toFixed(1)},${y(p.mean).toFixed(1)}`).join(" ");
  const area = `M ${x(0).toFixed(1)},${H} L ${pts.replaceAll(" ", " L ")} L ${x(series.length - 1).toFixed(1)},${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[30px] w-full" preserveAspectRatio="none" aria-hidden>
      <path d={area} fill={color} fillOpacity="0.13" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {series.length === 1 && <circle cx={x(0)} cy={y(series[0].mean)} r="2" fill={color} />}
    </svg>
  );
}

// Fixed detail-chart geometry (viewBox units) — module-level so it's stable
// across renders and the memos below only depend on the data.
const W = 640;
const H = 190;
const padL = 10;
const padR = 12;
const padT = 16;
const padB = 24;
const plotW = W - padL - padR;
const plotH = H - padT - padB;

const xAt = (i: number, n: number) => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);

function DateAxis({ dates }: { dates: string[] }) {
  const n = dates.length;
  const showEvery = n <= 6;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 text-[10px] text-ink-400">
      {dates.map((d, i) =>
        showEvery || i === 0 || i === n - 1 ? (
          <span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(xAt(i, n) / W) * 100}%` }}>
            {fmtDate(d)}
          </span>
        ) : null,
      )}
    </div>
  );
}

function DetailChart({ label, color, series }: { label: string; color: string; series: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geom = useMemo(() => {
    if (series.length === 0) return null;
    let lo = Math.min(...series.map((p) => p.min));
    let hi = Math.max(...series.map((p) => p.max));
    if (hi === lo) {
      hi += 0.05;
      lo -= 0.05;
    }
    const padY = (hi - lo) * 0.08;
    lo -= padY;
    hi += padY;
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * plotH;
    return { y };
  }, [series]);

  if (!geom) {
    return (
      <div className="grid min-h-[160px] place-items-center rounded-xl border border-border bg-cream-card text-xs text-ink-400">
        No readings yet for {label}.
      </div>
    );
  }

  const { y } = geom;
  const n = series.length;
  const x = (i: number) => xAt(i, n);
  const meanLine = series.map((p, i) => `${x(i).toFixed(1)},${y(p.mean).toFixed(1)}`).join(" ");
  const bandTop = series.map((p, i) => `${x(i).toFixed(1)},${y(p.max).toFixed(1)}`);
  const bandBot = series.map((p, i) => `${x(i).toFixed(1)},${y(p.min).toFixed(1)}`).reverse();
  const band = n === 1 ? "" : `M ${bandTop.join(" L ")} L ${bandBot.join(" L ")} Z`;
  const hoverPoint = hover != null ? series[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = n === 1 ? 0 : Math.round(((vbX - padL) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[12px] font-bold text-forest-ink-900">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {label}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label={`${label} season trend — ${n} reading${n === 1 ? "" : "s"}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke="var(--color-border)" strokeWidth="1" />
          {band && <path d={band} fill={color} fillOpacity="0.15" />}
          {n === 1 && (
            <line x1={x(0)} y1={y(series[0].min)} x2={x(0)} y2={y(series[0].max)} stroke={color} strokeWidth="6" strokeOpacity="0.24" strokeLinecap="round" />
          )}
          <polyline points={meanLine} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {series.map((p, i) => (
            <circle key={i} cx={x(i)} cy={y(p.mean)} r={hover === i ? 4 : 2.5} fill={color} />
          ))}
          {hoverPoint && (
            <>
              <line x1={x(hover as number)} y1={padT} x2={x(hover as number)} y2={padT + plotH} stroke="var(--color-ink-400)" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.7" />
              <circle cx={x(hover as number)} cy={y(hoverPoint.mean)} r="5" fill="none" stroke={color} strokeWidth="2" />
            </>
          )}
        </svg>

        <DateAxis dates={series.map((p) => p.date)} />

        {hoverPoint && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-cream-card px-2.5 py-1.5 text-[10.5px] shadow-dropdown"
            style={{ left: `${Math.min(88, Math.max(12, (x(hover as number) / W) * 100))}%` }}
          >
            <div className="font-bold text-ink-900">{fmtDate(hoverPoint.date)}</div>
            <div className="mt-0.5 flex gap-2 tabular-nums">
              <span className="text-forest-ink-700">mean {hoverPoint.mean.toFixed(2)}</span>
              <span className="text-ink-400">{hoverPoint.min.toFixed(2)}–{hoverPoint.max.toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Option ③ — normalized multi-measure overlay (compare trajectories). */
function CompareChart({ rows, layers }: { rows: NdviHistoryItem[]; layers: IndexLayer[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = rows.length;

  if (layers.length === 0) {
    return (
      <div className="grid min-h-[160px] place-items-center rounded-xl border border-border bg-cream-card text-xs text-ink-400">
        Tap measures above to compare them.
      </div>
    );
  }
  if (n === 0) {
    return (
      <div className="grid min-h-[160px] place-items-center rounded-xl border border-border bg-cream-card text-xs text-ink-400">
        No readings yet.
      </div>
    );
  }

  const x = (i: number) => xAt(i, n);
  const yN = (norm: number) => padT + (1 - norm) * plotH; // norm 0..1 → y

  // Per-layer normalized points (row-index aligned, so a measure that starts
  // late simply begins further right). Raw values kept for the tooltip.
  const lines = layers.map((layer) => {
    const [vmin, vmax] = INDEX_META[layer].range;
    const pts: { i: number; norm: number; raw: number }[] = [];
    rows.forEach((r, i) => {
      const m = layerStats(r, layer).mean;
      if (m == null) return;
      pts.push({ i, norm: clamp01((m - vmin) / (vmax - vmin)), raw: m });
    });
    return { layer, color: INDEX_META[layer].color, pts };
  });

  const hoverDate = hover != null ? rows[hover]?.satellite_image_date : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = n === 1 ? 0 : Math.round(((vbX - padL) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {layers.map((layer) => (
          <span key={layer} className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-600">
            <span className="h-2 w-2 rounded-full" style={{ background: INDEX_META[layer].color }} />
            {INDEX_META[layer].short}
          </span>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full touch-none"
          role="img"
          aria-label={`Normalized comparison of ${layers.map((l) => INDEX_META[l].short).join(", ")}`}
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        >
          {/* 0% / 100% reference lines (normalized axis) */}
          <line x1={padL} y1={yN(1)} x2={W - padR} y2={yN(1)} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="2 3" />
          <line x1={padL} y1={yN(0)} x2={W - padR} y2={yN(0)} stroke="var(--color-border)" strokeWidth="1" />
          <text x={padL} y={yN(1) - 3} className="fill-[var(--color-ink-400)]" fontSize="9">100% of range</text>

          {/* Normalized lines converge, so direct end-labels collide/clip —
              the always-present legend above carries identity instead. */}
          {lines.map(({ layer, color, pts }) => {
            if (pts.length === 0) return null;
            const poly = pts.map((p) => `${x(p.i).toFixed(1)},${yN(p.norm).toFixed(1)}`).join(" ");
            return (
              <g key={layer}>
                <polyline points={poly} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {pts.map((p) => (
                  <circle key={p.i} cx={x(p.i)} cy={yN(p.norm)} r={hover === p.i ? 3.5 : 2} fill={color} />
                ))}
              </g>
            );
          })}

          {hover != null && (
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke="var(--color-ink-400)" strokeWidth="1" strokeDasharray="3 3" strokeOpacity="0.7" />
          )}
        </svg>

        <DateAxis dates={rows.map((r) => r.satellite_image_date)} />

        {hover != null && hoverDate && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-cream-card px-2.5 py-1.5 text-[10.5px] shadow-dropdown"
            style={{ left: `${Math.min(84, Math.max(16, (x(hover) / W) * 100))}%` }}
          >
            <div className="font-bold text-ink-900">{fmtDate(hoverDate)}</div>
            <div className="mt-0.5 flex flex-col gap-0.5 tabular-nums">
              {layers.map((layer) => {
                const raw = layerStats(rows[hover], layer).mean;
                return (
                  <div key={layer} className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: INDEX_META[layer].color }} />
                    <span className="text-ink-500">{INDEX_META[layer].short}</span>
                    <span className="ml-auto pl-2 font-semibold text-ink-900">{raw == null ? "—" : raw.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
