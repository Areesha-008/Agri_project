"use client";

import { useMemo, useState } from "react";
import { useAllCropHealth, useField, useFieldNdvi, useFields } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Card } from "@/components/ui/Card";
import { HealthGauge } from "@/components/ui/HealthGauge";
import { TimeWindowPicker, type DateRange } from "@/components/ui/TimeWindowPicker";
import { MeasureIndexList } from "@/components/ui/MeasureIndexList";
import { MeasureDetailChart } from "@/components/ui/MeasureDetailChart";
import type { IndexLayer } from "@/lib/measures";

// forest-ink-700 (not forest-700 — that's a frozen fill token, not the
// inverting text ramp) since these render as standalone text on a neutral
// card background, exactly forest-ink's documented use case.
const STATUS_COLOR: Record<string, string> = {
  Healthy: "var(--color-forest-ink-700)",
  Stressed: "var(--color-alert-amber-text)",
  Critical: "var(--color-down-red)",
};

export default function HealthPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const { data: field } = useField(selectedFieldId);
  const { data: ndvi } = useFieldNdvi(selectedFieldId);
  const { data: fields } = useFields();
  const fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  const { data: allHealth } = useAllCropHealth(fieldIds);

  const [timeWindow, setTimeWindow] = useState<DateRange | null>(null);
  const [selected, setSelected] = useState<IndexLayer>("ndvi");

  // Only the picked window's rows — the chart used to always render the
  // field's entire history regardless of this selection. Purely a display
  // filter over whatever's already cached: picking a timeframe here never
  // triggers a satellite fetch (that's My Fields' explicit, opt-in
  // "Analyse this period" flow via FieldReanalyzePanel instead) — it just
  // shows whatever data is already available for the period.
  const filteredHistory = useMemo(() => {
    const rows = ndvi?.history ?? [];
    if (!timeWindow) return rows;
    return rows.filter(
      (r) => r.satellite_image_date >= timeWindow.start_date && r.satellite_image_date <= timeWindow.end_date
    );
  }, [ndvi?.history, timeWindow]);

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <h1 className="text-lg font-bold text-ink-900">Crop health</h1>

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
            <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} disabled={!selectedFieldId} />
          </div>
          <MeasureDetailChart history={filteredHistory} selected={selected} />
        </Card>
      </div>

      <div className="text-[13px] font-bold text-ink-600">All fields</div>
      <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {fields?.map((f) => {
          const h = allHealth?.[f.id];
          return (
            <button key={f.id} onClick={() => setSelectedFieldId(f.id)} className="text-left">
              <Card
                className={`flex flex-col gap-2.5 hover:border-[#A8CDB4] ${f.id === selectedFieldId ? "border-forest-500" : ""}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-[13px] font-bold">{f.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <HealthGauge score={h?.health_score ?? 0} size={58} label="" />
                  <div className="text-[11px] leading-relaxed text-ink-500">
                    NDVI {h?.ndvi_trend.at(-1)?.ndvi_mean.toFixed(2) ?? "—"}
                    <br />
                    {f.area_hectares ?? "—"} ha
                  </div>
                </div>
                <div
                  className="text-[11px] font-semibold"
                  style={{ color: STATUS_COLOR[h?.status_label ?? ""] ?? "var(--color-ink-500)" }}
                >
                  {h?.status_label ?? "No data"}
                </div>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
