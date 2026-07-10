"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCropHealth, useField, useFieldNdvi, useAlerts, useMandiRates, useWeather, useLedgerEntries } from "@/lib/api/hooks";
import { boundsFromGeometry, polygonCentroid } from "@/lib/geo";
import { useAppStore, type MapLayer } from "@/lib/store/useAppStore";
import { Card } from "@/components/ui/Card";
import { HealthGauge } from "@/components/ui/HealthGauge";
import type { FieldListItem } from "@/lib/api/types";
import type { FieldOverlay } from "@/components/map/FieldsMap";

const FieldsMap = dynamic(() => import("@/components/map/FieldsMap").then((m) => m.FieldsMap), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[220px] place-items-center text-xs text-ink-400">Loading map…</div>,
});

const CATEGORY_DOT: Record<string, string> = {
  Fertilizer: "#40916C",
  Irrigation: "#4E8DBF",
  Spray: "#C1512F",
  Scan: "#B07D2B",
  Operation: "#8a927f",
};

const LAYERS: { key: MapLayer; label: string }[] = [
  { key: "ndvi", label: "NDVI" },
  { key: "ndmi", label: "NDMI" },
  { key: "satellite", label: "Satellite" },
];

export default function DashboardPage() {
  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const selectedMandi = useAppStore((s) => s.selectedMandi);
  const mapLayer = useAppStore((s) => s.mapLayer);
  const setMapLayer = useAppStore((s) => s.setMapLayer);

  const { data: field } = useField(selectedFieldId);
  const { data: ndvi } = useFieldNdvi(selectedFieldId);
  const { data: health } = useCropHealth(selectedFieldId);
  const { data: alerts } = useAlerts(false);
  const { data: mandiRates } = useMandiRates(selectedMandi);
  const { data: ledgerEntries } = useLedgerEntries();

  const centroid = field ? polygonCentroid(field.geometry) : null;
  const { data: forecast } = useWeather(centroid?.lat ?? null, centroid?.lon ?? null);

  const latest = ndvi?.latest;
  const topAlert = alerts?.[0];

  const mapFields: FieldListItem[] = field
    ? [{ id: field.id, name: field.name, area_hectares: field.area_hectares, created_at: field.created_at }]
    : [];
  const mapGeometries = field ? { [field.id]: field.geometry } : {};
  const overlay: FieldOverlay | null =
    field && latest
      ? {
          id: field.id,
          boundingBox: boundsFromGeometry(field.geometry),
          imageUrl: mapLayer === "ndmi" ? (latest.ndmi_png_url ?? "") : (latest.ndvi_png_url ?? ""),
        }
      : null;

  return (
    <div className="flex min-h-full flex-col gap-3.5 p-5.5">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <div className="text-lg font-bold text-ink-900">Assalam-o-Alaikum</div>
        <div className="text-xs text-ink-400">
          {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
        </div>
      </div>

      {topAlert && (
        <div className="flex items-center gap-3 rounded-2xl border border-alert-red-border bg-alert-red-bg p-3">
          <div className="grid h-7.5 w-7.5 flex-none place-items-center rounded-[9px] bg-alert-red">
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M7 1.5 L13 12 H1 Z" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
              <path d="M7 5.5 V8.5 M7 10.4 V10.5" stroke="#fff" strokeWidth="1.6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold text-alert-red-text">{topAlert.title}</div>
            <div className="text-xs text-alert-red-body">{topAlert.message}</div>
          </div>
          <Link
            href="/market"
            className="flex-none rounded-lg border border-alert-red-border bg-white px-3 py-1.5 text-xs font-semibold text-alert-red-text hover:bg-[#FCE5DC]"
          >
            View advisory
          </Link>
        </div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-3.5 lg:grid-cols-[1.5fr_1fr_1fr]">
        {/* Live field map card */}
        <Card className="flex min-h-0 flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-ink-900">Field NDVI — {field?.name ?? "—"}</div>
            <Link href="/fields" className="text-[11px] font-semibold text-forest-700">
              Open map →
            </Link>
          </div>
          <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-[11px] bg-[#2a3325]">
            {field ? (
              <FieldsMap
                fields={mapFields}
                fieldGeometries={mapGeometries}
                selectedFieldId={field.id}
                onSelectField={() => {}}
                layer={mapLayer}
                overlay={overlay}
                drawing={false}
                onDrawComplete={() => {}}
                clearSignal={0}
              />
            ) : (
              <Link href="/fields" className="grid h-full place-items-center text-xs text-white/50">
                No field selected — draw a field to get started
              </Link>
            )}
            {field && (
              <div className="pointer-events-none absolute right-3 top-3 flex gap-1.5">
                {LAYERS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => setMapLayer(l.key)}
                    className={`pointer-events-auto rounded-lg px-2.5 py-1.5 text-[11px] font-semibold shadow-card ${
                      mapLayer === l.key ? "bg-forest-900 text-white" : "bg-white text-ink-600"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            )}
            {latest && (
              <div className="pointer-events-none absolute right-3 top-12 rounded-lg bg-black/55 px-2.5 py-1.5 text-[10px] text-white">
                Sentinel-2 L2A · {latest.satellite_image_date} · cloud {latest.cloud_cover_percent ?? "—"}%
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {[
              ["MEAN", latest?.ndvi_mean, "#1B4332"],
              ["MIN", latest?.ndvi_min, "#8B4513"],
              ["MAX", latest?.ndvi_max, "#228B22"],
              ["AREA", field?.area_hectares ? `${field.area_hectares} ha` : "—", "#1e2b23"],
            ].map(([label, value, color]) => (
              <div key={label as string} className="flex-1 rounded-lg bg-cream-inset px-2.5 py-2">
                <div className="text-[10px] font-semibold text-ink-400">{label}</div>
                <div className="text-base font-bold" style={{ color: color as string }}>
                  {value ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Middle col */}
        <div className="flex min-h-0 flex-col gap-3.5">
          <Link href="/health">
            <Card className="flex flex-col items-center gap-2 hover:border-[#C9DECE]">
              <div className="self-start text-[13px] font-bold text-ink-900">Crop health</div>
              <HealthGauge score={health?.health_score ?? 0} label={(health?.status_label ?? "—").toUpperCase()} />
              <div className="text-center text-[11.5px] leading-snug text-ink-500">
                Projected <b className="text-ink-900">{health?.yield_t_per_ha ?? "—"} t/ha</b> ·{" "}
                {health?.yield_maund_per_acre ?? "—"} maund/acre
              </div>
            </Card>
          </Link>
          <Link href="/market" className="min-h-0 flex-1">
            <Card className="flex h-full flex-col gap-2.5 hover:border-[#C9DECE]">
              <div className="flex items-center justify-between">
                <div className="text-[13px] font-bold text-ink-900">Weather</div>
              </div>
              {forecast && forecast[0] ? (
                <div className="flex items-center gap-2.5">
                  <div className="text-[22px] font-extrabold leading-none text-ink-900">{forecast[0].temp_hi}°</div>
                  <div className="text-[11px] text-ink-400">
                    Humidity {forecast[0].humidity_pct}% · Wind {forecast[0].wind_kmh} km/h
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-400">No field selected</div>
              )}
              <div className="flex gap-1 text-center text-[10px] text-ink-500">
                {forecast?.slice(0, 5).map((d) => (
                  <div
                    key={d.date}
                    className="flex-1 rounded-lg px-0.5 py-1.5"
                    style={{ background: d.rain ? "#FBF3E1" : "#F6F4ED" }}
                  >
                    {d.day}
                    <div className="text-[11px] font-bold" style={{ color: d.rain ? "#B07D2B" : "#1e2b23" }}>
                      {d.temp_hi}°
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </Link>
        </div>

        {/* Right col */}
        <div className="flex min-h-0 flex-col gap-3.5">
          <Link href="/market">
            <Card className="flex flex-col gap-2 hover:border-[#C9DECE]">
              <div className="flex items-baseline justify-between">
                <div className="text-[13px] font-bold text-ink-900">Mandi rates</div>
                <div className="text-[10.5px] text-ink-400">PKR / 40 kg</div>
              </div>
              <div className="flex flex-col text-xs">
                {mandiRates?.slice(0, 4).map((r) => (
                  <div key={r.commodity} className="flex items-center gap-2 border-b border-cream-inset py-1.5 last:border-0">
                    <span className="flex-1 font-semibold text-ink-900">{r.commodity}</span>
                    <span className="font-bold">{r.price_pkr_per_40kg.toLocaleString()}</span>
                    <span
                      className="w-11 text-right text-[11px] font-bold"
                      style={{ color: r.change_pct >= 0 ? "#2D6A4F" : "#C1512F" }}
                    >
                      {r.change_pct >= 0 ? "▲" : "▼"}
                      {Math.abs(r.change_pct)}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </Link>
          <Link href="/ledger" className="min-h-0 flex-1">
            <Card className="flex h-full flex-col gap-2.5 hover:border-[#C9DECE]">
              <div className="text-[13px] font-bold text-ink-900">Recent ledger</div>
              <div className="flex flex-col gap-2.5 overflow-auto">
                {ledgerEntries?.slice(0, 3).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2 text-xs">
                    <span
                      className="mt-1 h-2 w-2 flex-none rounded-sm"
                      style={{ background: CATEGORY_DOT[entry.category] ?? "#8a927f" }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-900">{entry.title}</div>
                      <div className="truncate text-[11px] text-ink-400">{entry.detail}</div>
                    </div>
                  </div>
                ))}
                {ledgerEntries?.length === 0 && <div className="text-xs text-ink-400">No entries yet.</div>}
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
