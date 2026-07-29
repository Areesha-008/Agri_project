"use client";

import { useMemo, useState } from "react";
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
  // Shared across modules (see useAppStore) rather than local state — the
  // (app) layout owns polling this job to completion and invalidating
  // /clearing it, so switching to another module and back doesn't lose
  // track of an in-flight analysis.
  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);
  const reanalyzeField = useReanalyzeField();
  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);
  // Scope "analyzing" to the field that started the job — switching fields
  // mid-analysis should immediately restore the new field's controls, not
  // leave the spinner up because some *other* field is still processing.
  const isAnalyzing =
    activeJob !== null &&
    activeJob.fieldId === selectedFieldId &&
    jobStatus.data?.status !== "done" &&
    jobStatus.data?.status !== "failed";

  // Only the picked window's rows — the chart used to always render the
  // field's entire history regardless of this selection.
  const filteredHistory = useMemo(() => {
    const rows = ndvi?.history ?? [];
    if (!timeWindow) return rows;
    return rows.filter(
      (r) => r.satellite_image_date >= timeWindow.start_date && r.satellite_image_date <= timeWindow.end_date
    );
  }, [ndvi?.history, timeWindow]);

  function handleWindowChange(range: DateRange) {
    if (!selectedFieldId || reanalyzeField.isPending) return;
    setTimeWindow(range);
    // Mirrors FieldReanalyzePanel's gap check — only kick off a satellite
    // fetch for weeks this window is actually missing from cached history,
    // instead of unconditionally re-fetching data we may already have.
    const tiles = computeWeeklyTiles(range);
    const missing = tiles.filter((tile) => matchEntry(tile, ndvi?.history ?? []) === null);
    if (missing.length === 0) return;
    // Request only the missing span, not the whole picked window — a wide
    // range (e.g. a few months) is usually mostly already cached, and
    // re-fetching the covered part too just writes more duplicate rows for
    // weeks that already have a reading (see MeasureTrendChart's dedup).
    const spanStart = missing.reduce((min, t) => (t.start < min ? t.start : min), missing[0].start);
    const spanEnd = missing.reduce((max, t) => (t.end > max ? t.end : max), missing[0].end);
    reanalyzeField.mutate(
      { fieldId: selectedFieldId, input: { start_date: spanStart, end_date: spanEnd } },
      { onSuccess: (job) => setActiveJob({ fieldId: selectedFieldId, jobId: job.id }) }
    );
  }

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
