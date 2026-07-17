"use client";

import { useMemo } from "react";
import { useAllCropHealth, useCropHealth, useField, useFields } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Card } from "@/components/ui/Card";
import { HealthGauge } from "@/components/ui/HealthGauge";

const STATUS_COLOR: Record<string, string> = {
  Healthy: "#2D6A4F",
  Stressed: "#B07D2B",
  Critical: "#C1512F",
};

export default function HealthPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const { data: field } = useField(selectedFieldId);
  const { data: health } = useCropHealth(selectedFieldId);
  const { data: fields } = useFields();
  const fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  const { data: allHealth } = useAllCropHealth(fieldIds);

  const maxTrend = Math.max(0.01, ...(health?.ndvi_trend.map((p) => p.ndvi_mean) ?? [0.01]));

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
            <div className="h-2 rounded-full bg-[#EDEAE0]">
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

        {/* NDVI trend */}
        <Card className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-bold">NDVI season trend — {field?.name ?? "—"}</div>
            <div className="text-[11px] text-ink-400">Sentinel-2 history</div>
          </div>
          {health && health.ndvi_trend.length > 0 ? (
            <div className="flex min-h-[160px] flex-1 items-end gap-3 overflow-x-auto border-b border-cream-inset px-0.5 pb-0">
              {health.ndvi_trend.map((point) => (
                <div key={point.date} className="flex h-full w-11 flex-none flex-col items-center justify-end gap-1.5">
                  <div className="text-[10px] font-bold text-forest-ink-700">{point.ndvi_mean.toFixed(2)}</div>
                  <div
                    className="w-6 rounded-t-md bg-gradient-to-b from-forest-500 to-mint-300"
                    style={{ height: `${Math.max(6, (point.ndvi_mean / maxTrend) * 120)}px` }}
                  />
                  <div className="whitespace-nowrap text-[10px] text-ink-400">
                    {new Date(point.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[160px] flex-1 place-items-center text-xs text-ink-400">No readings yet.</div>
          )}
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
