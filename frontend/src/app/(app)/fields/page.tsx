"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  useCreateField,
  useDeleteField,
  useField,
  useFieldGeometries,
  useFieldNdvi,
  useFields,
  useNdviJob,
} from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TimeWindowPicker, type DateRange } from "@/components/ui/TimeWindowPicker";
import { NdviLegend } from "@/components/map/NdviLegend";
import { MeasureDropdown } from "@/components/map/MeasureDropdown";
import { FieldReanalyzePanel } from "@/components/map/FieldReanalyzePanel";
import { layerPng, layerStats, type IndexLayer } from "@/lib/measures";
import type { IrrigationType, NdviHistoryItem, PolygonGeometry } from "@/lib/api/types";
import type { FieldOverlay } from "@/components/map/FieldsMap";
import { boundsFromGeometry } from "@/lib/geo";

const FieldsMap = dynamic(() => import("@/components/map/FieldsMap").then((m) => m.FieldsMap), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-ink-400">Loading map…</div>,
});

type Mode = "idle" | "drawing" | "naming" | "saving";

export default function FieldsPage() {
  const { data: fields } = useFields();
  const fieldIds = useMemo(() => fields?.map((f) => f.id) ?? [], [fields]);
  const { data: geometries } = useFieldGeometries(fieldIds);

  const selectedFieldId = useAppStore((s) => s.selectedFieldId);
  const setSelectedFieldId = useAppStore((s) => s.setSelectedFieldId);
  const mapLayer = useAppStore((s) => s.mapLayer);
  const setMapLayer = useAppStore((s) => s.setMapLayer);

  const { data: selectedField } = useField(selectedFieldId);
  const { data: ndvi } = useFieldNdvi(selectedFieldId);

  const [activeEntry, setActiveEntry] = useState<NdviHistoryItem | null>(null);

  const [mode, setMode] = useState<Mode>("idle");
  const [pendingGeometry, setPendingGeometry] = useState<PolygonGeometry | null>(null);
  const [pendingArea, setPendingArea] = useState(0);
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [crop, setCrop] = useState("");
  const [irrigationType, setIrrigationType] = useState<IrrigationType | undefined>(undefined);
  const [sowingDate, setSowingDate] = useState("");
  const [timeWindow, setTimeWindow] = useState<DateRange | null>(null);
  const [clearSignal, setClearSignal] = useState(0);
  const [locateSignal, setLocateSignal] = useState(0);
  // Shared across modules (see useAppStore) rather than local state — an
  // in-flight job must keep being tracked even if this page unmounts when
  // the user switches to another module; the (app) layout owns polling it
  // to completion and clearing it, so this page just reads the slot.
  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);

  const createField = useCreateField();
  const deleteField = useDeleteField();
  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);
  // Derived, not stored: once useNdviJob's polling (see hooks.ts) reports a
  // terminal status, this just naturally becomes false on the next render —
  // no effect needed to "notice" the job finished and flip local state.
  const isAnalyzing =
    activeJob !== null && jobStatus.data?.status !== "done" && jobStatus.data?.status !== "failed";
  // activeJob is now a shared slot (see useAppStore) — FieldReanalyzePanel's
  // "re-analyse a past period" writes to it too, so isAnalyzing alone can no
  // longer tell "just-created field's first analysis" (which should block
  // this whole panel behind the big spinner) apart from "re-analysing one
  // gap week of a field whose data is already on screen" (which shouldn't:
  // FieldReanalyzePanel already shows its own compact analysing state).
  // A field with zero history rows yet has never finished a first analysis,
  // which is exactly the distinction needed, with no extra state to track.
  const showBlockingSpinner = isAnalyzing && (ndvi?.history?.length ?? 0) === 0;

  function startDrawing() {
    setMode("drawing");
    setPendingGeometry(null);
  }

  function cancelDrawing() {
    setMode("idle");
    setPendingGeometry(null);
    setClearSignal((n) => n + 1);
  }

  function handleDrawComplete(geometry: PolygonGeometry, areaHectares: number) {
    setPendingGeometry(geometry);
    setPendingArea(areaHectares);
    setName(`Field ${(fields?.length ?? 0) + 1}`);
    setMode("naming");
  }

  async function handleDelete(field: { id: string; name: string }) {
    if (!window.confirm(`Delete "${field.name}"? This removes its NDVI history, alerts and ledger entries too.`)) {
      return;
    }
    await deleteField.mutateAsync(field.id);
    if (selectedFieldId === field.id) setSelectedFieldId(null);
  }

  async function handleSave() {
    if (!pendingGeometry) return;
    setMode("saving");
    try {
      const result = await createField.mutateAsync({
        name,
        geometry: pendingGeometry,
        district: district || undefined,
        crop: crop || undefined,
        irrigation_type: irrigationType,
        sowing_date: sowingDate || undefined,
        ...(timeWindow ?? {}),
      });
      setActiveJob({ fieldId: result.field.id, jobId: result.job_id });
      setSelectedFieldId(result.field.id);
      setMode("idle");
    } catch {
      setMode("naming");
    }
  }

  const overlay: FieldOverlay | null =
    selectedField && activeEntry
      ? {
          id: selectedField.id,
          boundingBox: boundsFromGeometry(selectedField.geometry),
          imageUrl: layerPng(activeEntry, mapLayer) ?? "",
        }
      : null;

  return (
    <div id="fieldsWrap" className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Tools panel — stacks above the map below md instead of squeezing a fixed 290px
          panel next to it, which crushed the map (the page's core draw/analyze surface)
          to a sliver on phone widths. max-h caps the panel so the map still gets room
          even with a long field list. */}
      <div
        id="fieldsPanel"
        className="flex max-h-[45vh] w-full flex-none flex-col gap-3.5 overflow-auto border-b border-border bg-cream-card p-4 md:max-h-none md:w-[290px] md:border-b-0 md:border-r"
      >
        {mode === "idle" && !showBlockingSpinner && (
          <>
            <Button onClick={startDrawing}>+ Draw new field boundary</Button>
            <div className="flex flex-col gap-2">
              {fields?.map((f) => (
                <div
                  key={f.id}
                  className={`flex items-center gap-2 rounded-xl border p-3 ${
                    f.id === selectedFieldId ? "border-forest-500 bg-mint-100" : "border-border bg-cream-card"
                  }`}
                >
                  {/* bg-mint-100 stays a constant light chip color across themes (see globals.css),
                      so its text must stay constant dark too — ink-900/ink-400 would invert to
                      light-on-light in dark mode when this row is selected. */}
                  <button onClick={() => setSelectedFieldId(f.id)} className="min-w-0 flex-1 cursor-pointer text-left">
                    <div className={`truncate text-[13px] font-bold ${f.id === selectedFieldId ? "text-forest-900" : "text-ink-900"}`}>{f.name}</div>
                    <div className={`text-xs ${f.id === selectedFieldId ? "text-forest-700" : "text-ink-400"}`}>{f.area_hectares ?? "—"} ha</div>
                  </button>
                  <button
                    onClick={() => handleDelete(f)}
                    disabled={deleteField.isPending}
                    aria-label={`Delete ${f.name}`}
                    title="Delete field"
                    className="flex-none cursor-pointer rounded-lg p-1.5 text-ink-400 opacity-60 hover:bg-alert-red-bg hover:text-alert-red-text hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                      <path d="M2.5 3.5 H11.5 M5 3.5 V2 a1 1 0 0 1 1-1 h2 a1 1 0 0 1 1 1 V3.5 M5.5 6.5 V10.5 M8.5 6.5 V10.5 M3.5 3.5 L4 12 a1 1 0 0 0 1 1 h4 a1 1 0 0 0 1-1 L10.5 3.5" />
                    </svg>
                  </button>
                </div>
              ))}
              {fields?.length === 0 && (
                <div className="text-xs text-ink-400">No fields yet — draw your first one.</div>
              )}
            </div>
          </>
        )}

        {mode === "drawing" && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-bold text-ink-900">Draw your boundary</div>
            <div className="text-xs leading-relaxed text-ink-500">
              Click on the map to place points (≥3). Double-click to finish the shape.
            </div>
            <Button variant="secondary" onClick={cancelDrawing}>
              Cancel
            </Button>
          </div>
        )}

        {mode === "naming" && (
          <div className="flex flex-col gap-3">
            <div className="text-[13px] font-bold text-ink-900">Field details</div>
            <div className="rounded-xl bg-mint-100 p-3 text-xs text-forest-700">
              Estimated area: <b>{pendingArea} ha</b> (server recomputes exactly on save)
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-600">Satellite data window</label>
              <TimeWindowPicker value={timeWindow} onChange={setTimeWindow} />
            </div>
            <Input label="Field name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="District" placeholder="Faisalabad" value={district} onChange={(e) => setDistrict(e.target.value)} />
            <Input label="Crop" placeholder="Wheat" value={crop} onChange={(e) => setCrop(e.target.value)} />
            <Input
              label="Sowing date"
              type="date"
              value={sowingDate}
              onChange={(e) => setSowingDate(e.target.value)}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-ink-600">Irrigation</label>
              <div role="group" aria-label="Irrigation" className="flex rounded-lg bg-cream-inset p-0.5 text-[12.5px] font-semibold">
                {(["irrigated", "rainfed"] as IrrigationType[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setIrrigationType(option)}
                    aria-pressed={irrigationType === option}
                    className="h-9 flex-1 cursor-pointer rounded-md px-3 capitalize"
                    style={irrigationType === option ? { background: "var(--color-forest-900)", color: "#fff" } : undefined}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
            <Button onClick={handleSave} disabled={!name || createField.isPending}>
              Finish &amp; analyse
            </Button>
            <Button variant="secondary" onClick={cancelDrawing}>
              Cancel
            </Button>
          </div>
        )}

        {(mode === "saving" || (mode === "idle" && showBlockingSpinner)) && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-cream-card p-6 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-4 border-cream-inset border-t-forest-500" />
            <div className="text-[13px] font-bold text-ink-900">Analysing via Sentinel-2…</div>
            <div className="text-xs text-ink-400">Fetching cloud-free imagery and computing your field&apos;s indices.</div>
          </div>
        )}

        {selectedField && mode === "idle" && !showBlockingSpinner && (
          <div className="mt-auto flex flex-col gap-3.5">
            <FieldReanalyzePanel
              key={selectedField.id}
              fieldId={selectedField.id}
              history={ndvi?.history ?? []}
              onActiveEntryChange={setActiveEntry}
            />
            {activeEntry && (() => {
              // Reflect whichever index the map is showing; satellite falls
              // back to NDVI. Older rows may lack an index → show a dash.
              const stat = layerStats(activeEntry, mapLayer);
              const label = mapLayer === "satellite" ? "NDVI" : mapLayer.toUpperCase();
              const fmt = (v: number | null) => (v == null ? "—" : v);
              return (
                <div className="rounded-2xl border border-border bg-cream-card p-3.5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[13px] font-bold text-ink-900">{selectedField.name}</span>
                    <span className="rounded-md bg-cream-inset px-1.5 py-0.5 text-[10px] font-semibold text-ink-500">
                      {label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="text-ink-400">Mean</div>
                      <div className="font-bold text-forest-ink-900">{fmt(stat.mean)}</div>
                    </div>
                    <div>
                      <div className="text-ink-400">Min</div>
                      <div className="font-bold text-forest-ink-900">{fmt(stat.min)}</div>
                    </div>
                    <div>
                      <div className="text-ink-400">Max</div>
                      <div className="font-bold text-forest-ink-900">{fmt(stat.max)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="relative flex-1">
        <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
          <MeasureDropdown value={mapLayer} onChange={setMapLayer} className="w-48" />
          {/* Manual re-locate — always live (user-initiated), unlike the
              once-per-session auto-locate that fires when the map first loads. */}
          <button
            onClick={() => setLocateSignal((n) => n + 1)}
            aria-label="Find my location"
            title="Find my location"
            className="jk-focus grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-cream-card text-ink-600 shadow-card"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="7.5" r="3.5" />
              <path d="M7.5 1v2.2M7.5 11.8V14M1 7.5h2.2M11.8 7.5H14" />
            </svg>
          </button>
        </div>
        <FieldsMap
          fields={fields ?? []}
          fieldGeometries={geometries ?? {}}
          selectedFieldId={selectedFieldId}
          onSelectField={setSelectedFieldId}
          layer={mapLayer}
          overlay={overlay}
          drawing={mode === "drawing"}
          onDrawComplete={handleDrawComplete}
          clearSignal={clearSignal}
          showGeocoder={mode === "idle" || mode === "drawing"}
          geocoderPlaceholder="Search a location…"
          autoLocate
          locateSignal={locateSignal}
        />
        {overlay && mapLayer !== "satellite" && (
          <div className="absolute bottom-3 left-3 z-10 flex w-44 flex-col gap-2.5 rounded-card border border-border bg-cream-card p-2.5 shadow-card">
            {/* guarded by mapLayer !== "satellite" above, so it's an index layer */}
            <NdviLegend layer={mapLayer as IndexLayer} />
          </div>
        )}
      </div>
    </div>
  );
}
