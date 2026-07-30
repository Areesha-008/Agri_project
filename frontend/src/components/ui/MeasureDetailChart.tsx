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
            <Area dataKey="min" type="monotone" stackId="range" stroke="none" fill="transparent" connectNulls={false} isAnimationActive={false} />
            <Area
              dataKey="spread"
              type="monotone"
              stackId="range"
              stroke="none"
              fill={color}
              fillOpacity={0.16}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="mean"
              type="monotone"
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
