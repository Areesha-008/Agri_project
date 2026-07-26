"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

// forest-ink-700 (not forest-700 — that's a frozen fill token, not the
// inverting text ramp) since these render as standalone text on a neutral
// card background, exactly forest-ink's documented use case.
const STATUS_COLOR: Record<string, string> = {
  Healthy: "var(--color-forest-ink-700)",
  Stressed: "var(--color-alert-amber-text)",
  Critical: "var(--color-down-red)",
};

export default function HealthPage() {
  const queryClient = useQueryClient();
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const { data: field } = useField(selectedFieldId);
  const { data: health } = useCropHealth(selectedFieldId);
  const { data: ndvi } = useFieldNdvi(selectedFieldId);
  const { data: fields } = useFields();
  const fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  const { data: allHealth } = useAllCropHealth(fieldIds);

  const [timeWindow, setTimeWindow] = useState<DateRange | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const reanalyzeField = useReanalyzeField();
  const jobStatus = useNdviJob(activeFieldId, activeJobId);
  // Scope "analyzing" to the field that started the job — switching fields
  // mid-analysis should immediately restore the new field's controls, not
  // leave the spinner up because some *other* field is still processing.
  const isAnalyzing =
    activeJobId !== null &&
    activeFieldId === selectedFieldId &&
    jobStatus.data?.status !== "done" &&
    jobStatus.data?.status !== "failed";

  // Job completion isn't observable any other way (no websocket/SSE) — this
  // effect is what actually refreshes the trend chart/gauge once the
  // background job finishes; a broad ["fields"] invalidation matches what
  // useCreateField already does on success, just triggered at the right
  // time (job done, not job created).
  useEffect(() => {
    if (jobStatus.data?.status === "done") {
      queryClient.invalidateQueries({ queryKey: ["fields"] });
    }
  }, [jobStatus.data?.status, queryClient]);

  function handleWindowChange(range: DateRange) {
    if (!selectedFieldId || reanalyzeField.isPending) return;
    setTimeWindow(range);
    setActiveFieldId(selectedFieldId);
    reanalyzeField.mutate(
      { fieldId: selectedFieldId, input: range },
      { onSuccess: (job) => setActiveJobId(job.id) }
    );
  }

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <h1 className="text-lg font-bold text-ink-900">Crop health</h1>

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
          <MeasureTrendChart history={ndvi?.history ?? []} />
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

      <Card className="flex flex-col gap-2.5">
        <div className="text-sm font-bold">Lab recommendations — {field?.name ?? "—"}</div>
        <div className="grid grid-cols-1 gap-3 text-xs leading-relaxed text-ink-900 md:grid-cols-3">
          <div className="rounded-xl bg-cream-inset p-3">
            <b className="text-ink-900">Nitrogen top-dress</b>
            <br />
            NDVI dip suggests possible N deficiency — consider a urea top-dress after the next rain window.
          </div>
          <div className="rounded-xl bg-cream-inset p-3">
            <b className="text-ink-900">Targeted irrigation</b>
            <br />
            Check NDMI for moisture-stressed zones and irrigate selectively rather than the whole field.
          </div>
          <div className="rounded-xl bg-cream-inset p-3">
            <b className="text-ink-900">Rust scouting</b>
            <br />
            Scout for stripe rust pustules twice this week. If found, photograph with the Disease Scanner.
          </div>
        </div>
      </Card>
    </div>
  );
}
