"use client";

import { useAlerts, useField, useMandiRates, useWeather } from "@/lib/api/hooks";
import { polygonCentroid } from "@/lib/geo";
import { useAppStore } from "@/lib/store/useAppStore";
import { Card } from "@/components/ui/Card";
import type { Mandi } from "@/lib/api/types";

const MANDIS: { key: Mandi; label: string }[] = [
  { key: "faisalabad", label: "Faisalabad" },
  { key: "lahore", label: "Lahore" },
  { key: "multan", label: "Multan" },
];

export default function MarketPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const selectedMandi = useAppStore((s) => s.selectedMandi);
  const setSelectedMandi = useAppStore((s) => s.setSelectedMandi);

  const { data: field } = useField(selectedFieldId);
  const centroid = field ? polygonCentroid(field.geometry) : null;
  const { data: forecast } = useWeather(centroid?.lat ?? null, centroid?.lon ?? null);
  const { data: mandiRates } = useMandiRates(selectedMandi);
  const { data: alerts } = useAlerts(false);
  const pestAlerts = alerts?.filter((a) => a.category === "pest") ?? [];

  return (
    <div className="flex flex-col gap-3.5 p-5.5">
      <h1 className="text-lg font-bold text-ink-900">Market Prices &amp; Weather</h1>

      {pestAlerts.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-alert-red-border bg-alert-red-bg p-4">
          {pestAlerts.map((a) => (
            <div key={a.id}>
              <div className="text-sm font-extrabold text-alert-red-text">{a.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-alert-red-body">{a.message}</div>
            </div>
          ))}
        </div>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-bold">7-day agromet forecast{field ? ` — ${field.district ?? field.name}` : ""}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
          {forecast?.map((d) => (
            <div
              key={d.date}
              className="rounded-xl p-2.5 text-center text-xs"
              style={{
                background: d.rain ? "var(--color-alert-amber-bg)" : "var(--color-cream-bg)",
                border: d.rain ? "1px solid var(--color-alert-amber-border)" : "1px solid transparent",
              }}
            >
              <div className="font-semibold text-ink-500">{d.day}</div>
              <div className="mt-1 text-base font-bold" style={{ color: d.rain ? "var(--color-alert-amber-text)" : "var(--color-ink-900)" }}>
                {d.temp_hi}°
              </div>
              <div className="text-[10px] text-ink-400">{d.temp_lo}° low</div>
              <div className="mt-1 text-[10px] text-ink-500">{d.desc}</div>
            </div>
          ))}
          {!forecast && <div className="col-span-full text-xs text-ink-400">Select a field to see its forecast.</div>}
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold">
            Mandi rates <span className="text-xs font-semibold text-ink-400">PKR / 40 kg</span>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-input-border text-[11.5px] font-semibold">
            {MANDIS.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMandi(m.key)}
                className={`cursor-pointer px-3 py-1.5 ${selectedMandi === m.key ? "bg-forest-900 text-white" : "text-ink-500"}`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        {/* 7-day sparkline is the least essential column (decorative trend, not a number
            users act on) — collapse it below sm to match the forecast grid's own sm:
            breakpoint above, instead of squeezing all 4 columns at every width. */}
        <div id="mktHead" className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 border-b border-cream-inset pb-2 text-[10.5px] font-bold uppercase text-ink-400 sm:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <span>Commodity</span>
          <span className="text-right">Today</span>
          <span className="text-right">Change</span>
          <span className="hidden text-right sm:block">7-day</span>
        </div>
        <div id="mktRows" className="flex flex-col">
          {mandiRates?.map((r) => (
            <div
              key={r.commodity}
              className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 border-b border-cream-inset py-2.5 text-xs last:border-0 sm:grid-cols-[1.6fr_1fr_1fr_1fr]"
            >
              <div>
                <div className="font-semibold text-ink-900">{r.commodity}</div>
                <div className="text-[10.5px] text-ink-400" lang="ur">{r.urdu_name}</div>
              </div>
              <div className="text-right font-bold">{r.price_pkr_per_40kg.toLocaleString()}</div>
              <div className="text-right font-bold" style={{ color: r.change_pct >= 0 ? "var(--color-forest-ink-700)" : "var(--color-down-red)" }}>
                {r.change_pct >= 0 ? "▲" : "▼"}
                {Math.abs(r.change_pct)}%
              </div>
              <div className="hidden items-end justify-end gap-0.5 sm:flex">
                {r.history_7d.map((v, i) => (
                  <div key={i} className="w-1.5 rounded-t-sm bg-mint-border-strong" style={{ height: `${Math.max(4, v / 2)}px` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[10.5px] text-ink-400">
          Source: district market committee rates · indicative, confirm at mandi gate
        </div>
      </Card>
    </div>
  );
}
