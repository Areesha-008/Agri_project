"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getToken } from "@/lib/api/client";
import { useCreateField, useDeleteField, useField, useFieldNdvi, useNdviJob } from "@/lib/api/hooks";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { boundsFromGeometry } from "@/lib/geo";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PolygonGeometry } from "@/lib/api/types";
import type { MapLayer } from "@/lib/store/useAppStore";
import type { FieldOverlay } from "@/components/map/FieldsMap";

const FieldsMap = dynamic(() => import("@/components/map/FieldsMap").then((m) => m.FieldsMap), {
  ssr: false,
  loading: () => <div className="jk-contours-dark h-full w-full animate-pulse bg-[#1a2417]" />,
});

type Mode = "idle" | "drawing" | "naming" | "saving";

const LAYERS: { key: MapLayer; label: string }[] = [
  { key: "ndvi", label: "NDVI" },
  { key: "ndmi", label: "NDMI" },
  { key: "satellite", label: "Satellite" },
];

// A CDSE job can hang in "running" with no server-side timeout — stop
// showing an endless spinner after this long and offer a retry.
const JOB_TIMEOUT_MS = 150_000;

/**
 * Landing-page hero: the real field-drawing + NDVI/NDMI analysis flow from
 * /fields, runnable by anonymous visitors. If no token exists yet, we log in
 * as the shared guest user (same as "Try without an account") right before
 * saving — never earlier, and never over an existing session.
 */
export function LandingFieldAnalyzer() {
  const { t } = useTranslation();
  const { isAuthenticated, loginAsGuest } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("idle");
  const [pendingGeometry, setPendingGeometry] = useState<PolygonGeometry | null>(null);
  const [pendingArea, setPendingArea] = useState(0);
  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [crop, setCrop] = useState("");
  const [clearSignal, setClearSignal] = useState(0);
  const [layerChoice, setLayerChoice] = useState<MapLayer | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  // True only when THIS component minted the guest session — the demo field
  // is then ours to clean up on reset. Never delete under a pre-existing
  // (real or earlier-guest) session.
  const mintedGuestSession = useRef(false);

  const createField = useCreateField();
  const deleteField = useDeleteField();
  const jobStatus = useNdviJob(activeFieldId, activeJobId);
  const { data: field } = useField(activeFieldId);
  const { data: ndvi } = useFieldNdvi(activeFieldId);

  const isAnalyzing =
    mode === "saving" ||
    (activeJobId !== null && jobStatus.data?.status !== "done" && jobStatus.data?.status !== "failed");
  const jobFailed = jobStatus.data?.status === "failed";
  const jobDone = jobStatus.data?.status === "done";
  const showResults = jobDone && Boolean(ndvi?.latest);
  // Heatmap by default once results exist; the toggle overrides.
  const layer: MapLayer = layerChoice ?? (showResults ? "ndvi" : "satellite");

  // The NDVI PNGs only exist once the job finishes — nothing else refetches
  // the queries that were fired (empty) while the job was still running.
  useEffect(() => {
    if (!jobDone || !activeFieldId) return;
    queryClient.invalidateQueries({ queryKey: ["fields", activeFieldId] });
  }, [jobDone, activeFieldId, queryClient]);

  useEffect(() => {
    if (!activeJobId) return;
    const id = setTimeout(() => setTimedOut(true), JOB_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [activeJobId]);

  function startDrawing() {
    setMode("drawing");
    setPendingGeometry(null);
    setSaveFailed(false);
  }

  function reset() {
    // Demo fields shouldn't pile up in the shared guest account — but only
    // remove what we created under a session we minted ourselves.
    if (mintedGuestSession.current && activeFieldId) {
      deleteField.mutate(activeFieldId);
    }
    setMode("idle");
    setPendingGeometry(null);
    setPendingArea(0);
    setName("");
    setDistrict("");
    setCrop("");
    setSaveFailed(false);
    setTimedOut(false);
    setActiveJobId(null);
    setActiveFieldId(null);
    setLayerChoice(null);
    setClearSignal((n) => n + 1);
  }

  function handleDrawComplete(geometry: PolygonGeometry, areaHectares: number) {
    setPendingGeometry(geometry);
    setPendingArea(areaHectares);
    setName(t("landingDrawDefaultName"));
    setMode("naming");
  }

  async function handleAnalyze() {
    if (!pendingGeometry) return;
    setMode("saving");
    setSaveFailed(false);
    try {
      if (!isAuthenticated && !getToken()) {
        await loginAsGuest();
        mintedGuestSession.current = true;
      }
      const result = await createField.mutateAsync({
        name: name || t("landingDrawDefaultName"),
        geometry: pendingGeometry,
        district: district || undefined,
        crop: crop || undefined,
      });
      setActiveFieldId(result.field.id);
      setActiveJobId(result.job_id);
      setMode("idle");
    } catch {
      setSaveFailed(true);
      setMode("naming");
    }
  }

  const overlay: FieldOverlay | null =
    field && ndvi?.latest && jobDone
      ? {
          id: field.id,
          boundingBox: boundsFromGeometry(field.geometry),
          imageUrl: layer === "ndmi" ? (ndvi.latest.ndmi_png_url ?? "") : (ndvi.latest.ndvi_png_url ?? ""),
        }
      : null;

  // Feed only the field this visitor just drew back into the map (outline +
  // fly-to) — never the guest account's field list, which is shared.
  const mapFields = field ? [{ id: field.id, name: field.name, area_hectares: field.area_hectares, created_at: field.created_at }] : [];
  const mapGeometries: Record<string, PolygonGeometry> = field ? { [field.id]: field.geometry } : {};

  return (
    <div className="relative h-[400px] overflow-hidden rounded-card-lg border border-border bg-[#1a2417] shadow-card">
      <FieldsMap
        fields={mapFields}
        fieldGeometries={mapGeometries}
        selectedFieldId={field?.id ?? null}
        onSelectField={() => {}}
        layer={layer}
        overlay={overlay}
        drawing={mode === "drawing"}
        onDrawComplete={handleDrawComplete}
        clearSignal={clearSignal}
      />

      {showResults && (
        <div className="absolute right-3 top-3 z-10 flex gap-1.5">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              onClick={() => setLayerChoice(l.key)}
              className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[11px] font-semibold shadow-card ${
                layer === l.key ? "bg-forest-900 text-white" : "bg-white text-ink-600"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="absolute bottom-3 left-3 z-10 w-[252px] rounded-2xl border border-border bg-white/95 p-3.5 shadow-card backdrop-blur-sm">
        {mode === "idle" && !isAnalyzing && !activeFieldId && (
          <div className="flex flex-col gap-2.5">
            <div className="text-xs leading-relaxed text-ink-500">{t("landingDrawHint")}</div>
            <Button onClick={startDrawing}>{t("landingDrawCta")}</Button>
          </div>
        )}

        {mode === "drawing" && (
          <div className="flex flex-col gap-2.5">
            <div className="text-xs leading-relaxed text-ink-500">{t("landingDrawInstruction")}</div>
            <Button variant="secondary" onClick={reset}>
              {t("cancel")}
            </Button>
          </div>
        )}

        {mode === "naming" && (
          <div className="flex flex-col gap-2.5">
            <div className="rounded-xl bg-mint-100 px-3 py-2 text-xs text-forest-700">
              {t("landingDrawAreaLabel")}: <b>{pendingArea} ha</b>
            </div>
            <Input label={t("landingDrawNameLabel")} value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex gap-2">
              <Input
                placeholder={t("landingDrawDistrictPlaceholder")}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full"
              />
              <Input
                placeholder={t("landingDrawCropPlaceholder")}
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                className="w-full"
              />
            </div>
            {saveFailed && <div className="text-xs font-semibold text-alert-red-text">{t("landingDrawError")}</div>}
            <Button onClick={handleAnalyze} disabled={!name}>
              {saveFailed ? t("landingDrawRetry") : t("landingDrawAnalyze")}
            </Button>
            <Button variant="secondary" onClick={reset}>
              {t("cancel")}
            </Button>
          </div>
        )}

        {isAnalyzing && !timedOut && (
          <div className="flex flex-col items-center gap-2.5 py-2 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cream-inset border-t-forest-500" />
            <div className="text-[13px] font-bold text-ink-900">{t("landingDrawAnalyzing")}</div>
            <div className="text-xs text-ink-400">{t("landingDrawAnalyzingHint")}</div>
          </div>
        )}

        {timedOut && !showResults && !jobFailed && (
          <div className="flex flex-col gap-2.5">
            <div className="text-xs leading-relaxed text-ink-500">{t("landingDrawTimeout")}</div>
            <Button variant="secondary" onClick={reset}>
              {t("landingDrawRetry")}
            </Button>
          </div>
        )}

        {jobFailed && (
          <div className="flex flex-col gap-2.5">
            <div className="text-xs font-semibold text-alert-red-text">{t("landingDrawError")}</div>
            <Button variant="secondary" onClick={reset}>
              {t("landingDrawRetry")}
            </Button>
          </div>
        )}

        {showResults && (
          <div className="flex flex-col gap-2.5">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <div className="text-ink-400">{t("landingDrawMean")}</div>
                <div className="font-bold text-forest-900">{ndvi!.latest!.ndvi_mean}</div>
              </div>
              <div>
                <div className="text-ink-400">{t("landingDrawMin")}</div>
                <div className="font-bold text-forest-900">{ndvi!.latest!.ndvi_min}</div>
              </div>
              <div>
                <div className="text-ink-400">{t("landingDrawMax")}</div>
                <div className="font-bold text-forest-900">{ndvi!.latest!.ndvi_max}</div>
              </div>
            </div>
            <Button variant="secondary" onClick={reset}>
              {t("landingDrawAgain")}
            </Button>
            <Link
              href="/signup"
              className="jk-focus text-center text-xs font-bold text-forest-700 underline-offset-2 hover:underline"
            >
              {t("landingDrawSignupCta")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
