"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getToken } from "@/lib/api/client";
import { useCreateField, useDeleteField, useField, useFieldNdvi, useNdviJob, useReanalyzeField } from "@/lib/api/hooks";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { isoDaysAgo, todayIso } from "@/components/ui/TimeWindowPicker";
import { computeWeeklyTiles, matchEntry, type WeekTile } from "@/lib/weekTiles";
import { WeekScrubber } from "@/components/map/WeekScrubber";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { PolygonGeometry } from "@/lib/api/types";
import type { MapLayer } from "@/lib/store/useAppStore";
import type { FieldOverlay } from "@/components/map/FieldsMap";
import { boundsFromGeometry } from "@/lib/geo";

const FieldsMap = dynamic(() => import("@/components/map/FieldsMap").then((m) => m.FieldsMap), {
  ssr: false,
  // #1a2417 is intentionally a literal, not a token: it approximates the
  // Mapbox satellite basemap's own dark tone (what's about to load in),
  // not the site's light/dark theme — the map looks the same regardless of
  // which theme the rest of the page is in.
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
 * /fields, runnable by anonymous visitors. Guests get the previous 4 weeks as
 * separate weekly readings (auto-analyzed one week at a time), NOT a single
 * averaged window — custom date ranges are gated behind an account. If no
 * token exists yet, we log in as the shared guest user right before saving.
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
  const [activeTileIndex, setActiveTileIndex] = useState(0);
  // True from the moment analysis starts until every weekly job is terminal.
  const [batchActive, setBatchActive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [locateSignal, setLocateSignal] = useState(0);
  // True only when THIS component minted the guest session — the demo field
  // is then ours to clean up on reset. Never delete under a pre-existing
  // (real or earlier-guest) session.
  const mintedGuestSession = useRef(false);

  // The four weekly tiles (newest first), fixed for the component's life so the
  // jobs we fire always match the tiles the scrubber displays.
  const [tiles] = useState<WeekTile[]>(() =>
    computeWeeklyTiles({ start_date: isoDaysAgo(28), end_date: todayIso() }),
  );
  // Weeks whose jobs haven't been fired yet — drained one at a time as each
  // finishes (sequential, to keep concurrent CDSE load to one query).
  const queueRef = useRef<WeekTile[]>([]);
  // Guards the sequential-advance effect so each finished job advances the
  // queue exactly once (the effect can re-run with the same terminal status).
  const processedJobRef = useRef<string | null>(null);

  const createField = useCreateField();
  const reanalyzeField = useReanalyzeField();
  const deleteField = useDeleteField();
  const jobStatus = useNdviJob(activeFieldId, activeJobId);
  const { data: field } = useField(activeFieldId);
  const { data: ndvi } = useFieldNdvi(activeFieldId);

  const history = ndvi?.history ?? [];
  const anyResults = history.length > 0;
  const activeEntry = tiles[activeTileIndex] ? matchEntry(tiles[activeTileIndex], history) : null;
  const isAnalyzing = mode === "saving" || batchActive;
  // Heatmap by default once any week has results; the toggle overrides.
  const layer: MapLayer = layerChoice ?? (anyResults ? "ndvi" : "satellite");

  // Sequential driver: when the current weekly job reaches a terminal state,
  // refresh the field (to pick up its new history row) and fire the next
  // queued week. When the queue empties, the batch is done.
  useEffect(() => {
    const status = jobStatus.data?.status;
    if (status !== "done" && status !== "failed") return;
    if (!activeJobId || !activeFieldId) return;
    if (processedJobRef.current === activeJobId) return;
    processedJobRef.current = activeJobId;

    // The NDVI PNGs/stats only exist once a job finishes — nothing else
    // refetches the queries fired (empty) while it was still running.
    queryClient.invalidateQueries({ queryKey: ["fields", activeFieldId] });

    const next = queueRef.current.shift();
    if (next) {
      reanalyzeField.mutate(
        { fieldId: activeFieldId, input: { start_date: next.start, end_date: next.end } },
        {
          // Clear the previous week's "taking longer" flag as the next starts.
          onSuccess: (job) => {
            setTimedOut(false);
            setActiveJobId(job.id);
          },
          onError: () => setBatchActive(false),
        },
      );
    } else {
      setBatchActive(false);
    }
  }, [jobStatus.data?.status, activeJobId, activeFieldId, reanalyzeField, queryClient]);

  // Per-job "taking longer than usual" timer — re-armed as each weekly job
  // starts (activeJobId changes), so it flags a genuinely stuck single job.
  // timedOut is cleared where activeJobId is set (handleAnalyze + the advance
  // effect's onSuccess), not here, to avoid a synchronous setState-in-effect.
  useEffect(() => {
    if (!activeJobId) return;
    const id = setTimeout(() => setTimedOut(true), JOB_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [activeJobId]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  function startDrawing() {
    setMode("drawing");
    setPendingGeometry(null);
    setSaveFailed(false);
    // Drawing gets the full-screen overlay too — more canvas to draw on, and it
    // reuses the same smooth expand as the dedicated expand button.
    setExpanded(true);
  }

  function reset() {
    // Demo fields shouldn't pile up in the shared guest account — but only
    // remove what we created under a session we minted ourselves, and only
    // once the ENTIRE weekly batch has reached a terminal state. Deleting the
    // field while any of its jobs is still running crashes that background job
    // trying to write results for a field that's already gone; leaving it lets
    // the jobs finish (it's still cleaned up on the next reset once terminal).
    if (mintedGuestSession.current && activeFieldId && !batchActive) {
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
    setActiveTileIndex(0);
    setBatchActive(false);
    queueRef.current = [];
    processedJobRef.current = null;
    setLayerChoice(null);
    setClearSignal((n) => n + 1);
    setExpanded(false);
  }

  function handleDrawComplete(geometry: PolygonGeometry, areaHectares: number) {
    setPendingGeometry(geometry);
    setPendingArea(areaHectares);
    setName(t("landingDrawDefaultName"));
    setMode("naming");
  }

  async function handleAnalyze() {
    if (!pendingGeometry || tiles.length === 0) return;
    setMode("saving");
    setSaveFailed(false);
    setTimedOut(false);
    try {
      if (!isAuthenticated && !getToken()) {
        await loginAsGuest();
        mintedGuestSession.current = true;
      }
      const newest = tiles[0];
      // Queue the older weeks; the sequential-advance effect fires them one by
      // one as each finishes. Creating the field kicks off the newest week.
      queueRef.current = tiles.slice(1);
      processedJobRef.current = null;
      setBatchActive(true);
      const result = await createField.mutateAsync({
        name: name || t("landingDrawDefaultName"),
        geometry: pendingGeometry,
        district: district || undefined,
        crop: crop || undefined,
        start_date: newest.start,
        end_date: newest.end,
      });
      setActiveFieldId(result.field.id);
      setActiveJobId(result.job_id);
      setActiveTileIndex(0);
      setMode("idle");
    } catch {
      setSaveFailed(true);
      setBatchActive(false);
      setMode("naming");
    }
  }

  const overlay: FieldOverlay | null =
    field && activeEntry
      ? {
          id: field.id,
          boundingBox: boundsFromGeometry(field.geometry),
          imageUrl: layer === "ndmi" ? (activeEntry.ndmi_png_url ?? "") : (activeEntry.ndvi_png_url ?? ""),
        }
      : null;

  // Feed only the field this visitor just drew back into the map (outline +
  // fly-to) — never the guest account's field list, which is shared.
  const mapFields = field ? [{ id: field.id, name: field.name, area_hectares: field.area_hectares, created_at: field.created_at }] : [];
  const mapGeometries: Record<string, PolygonGeometry> = field ? { [field.id]: field.geometry } : {};

  return (
    // This h-[400px] wrapper never leaves the layout — when the map jumps to
    // the fixed overlay, it holds the hero column's space open so the page
    // doesn't visibly reflow behind the translucent backdrop.
    <div className="relative h-[400px]">
      <div
        className={
          expanded
            ? "jk-backdrop-in fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6"
            : "contents"
        }
        onClick={expanded ? () => setExpanded(false) : undefined}
      >
        <div
          className={
            expanded
              ? "jk-overlay-in relative h-[85vh] w-[90vw] max-w-[1400px] overflow-hidden rounded-card-lg border border-border bg-[#1a2417] shadow-[0_24px_60px_rgba(0,0,0,.3)]"
              : "relative h-full w-full overflow-hidden rounded-card-lg border border-border bg-[#1a2417] shadow-card"
          }
          onClick={expanded ? (e) => e.stopPropagation() : undefined}
        >
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
            showGeocoder={mode === "idle" || mode === "drawing"}
            geocoderPlaceholder={t("landingSearchPlaceholder")}
            autoLocate
            locateSignal={locateSignal}
          />

          <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
            <div className="flex gap-1.5">
              {anyResults &&
                LAYERS.map((l) => (
                  <button
                    key={l.key}
                    onClick={() => setLayerChoice(l.key)}
                    className={`cursor-pointer rounded-lg px-3 py-3.5 text-[11px] font-semibold shadow-card ${
                      layer === l.key ? "bg-forest-900 text-white" : "bg-cream-card text-ink-600"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              <button
                onClick={() => setExpanded((v) => !v)}
                aria-label={expanded ? t("landingCollapseMapAria") : t("landingExpandMapAria")}
                className="jk-focus grid h-11 w-11 cursor-pointer place-items-center rounded-lg bg-cream-card text-ink-600 shadow-card"
              >
                {expanded ? (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.5 2v3.5H2M9.5 2v3.5H13M13 9.5H9.5V13M2 9.5h3.5V13" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 5.5V2h3.5M9.5 2H13v3.5M13 9.5V13H9.5M5.5 13H2V9.5" />
                  </svg>
                )}
              </button>
            </div>
            <button
              onClick={() => setLocateSignal((n) => n + 1)}
              aria-label={t("landingLocateAria")}
              className="jk-focus grid h-11 w-11 cursor-pointer place-items-center rounded-lg bg-cream-card text-ink-600 shadow-card"
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="7.5" cy="7.5" r="3.5" />
                <path d="M7.5 1v2.2M7.5 11.8V14M1 7.5h2.2M11.8 7.5H14" />
              </svg>
            </button>
          </div>

          <div className="absolute bottom-3 left-3 z-10 w-[252px] rounded-2xl border border-border bg-cream-card/95 p-3.5 shadow-card backdrop-blur-sm">
            {mode === "idle" && !activeFieldId && !isAnalyzing && (
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
                {/* Custom date ranges are an account feature; guests get a fixed
                    last-4-weeks view. */}
                <div className="rounded-xl bg-cream-inset px-3 py-2 text-[11px] leading-relaxed text-ink-500">
                  {t("landingDrawFourWeeksHint")}{" "}
                  <Link href="/signup" className="font-bold text-forest-700 underline-offset-2 hover:underline">
                    {t("landingDrawCustomRangeCta")}
                  </Link>
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

            {mode === "saving" && (
              <div className="flex flex-col items-center gap-2.5 py-2 text-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-cream-inset border-t-forest-500" />
                <div className="text-[13px] font-bold text-ink-900">{t("landingDrawAnalyzing")}</div>
                <div className="text-xs text-ink-400">{t("landingDrawAnalyzingHint")}</div>
              </div>
            )}

            {activeFieldId &&
              (!batchActive && !anyResults ? (
                <div className="flex flex-col gap-2.5">
                  <div className="text-xs leading-relaxed text-ink-500">{t("landingDrawNoResults")}</div>
                  <Button variant="secondary" onClick={reset}>
                    {t("landingDrawRetry")}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <WeekScrubber
                    tiles={tiles}
                    activeIndex={activeTileIndex}
                    onIndexChange={setActiveTileIndex}
                    ariaLabel="Select a week to view"
                    stateForTile={(tile) =>
                      matchEntry(tile, history) !== null ? "cached" : batchActive ? "analyzing" : "empty"
                    }
                  />
                  {activeEntry ? (
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <div className="text-ink-400">{t("landingDrawMean")}</div>
                        <div className="font-bold text-forest-ink-900">{activeEntry.ndvi_mean}</div>
                      </div>
                      <div>
                        <div className="text-ink-400">{t("landingDrawMin")}</div>
                        <div className="font-bold text-forest-ink-900">{activeEntry.ndvi_min}</div>
                      </div>
                      <div>
                        <div className="text-ink-400">{t("landingDrawMax")}</div>
                        <div className="font-bold text-forest-ink-900">{activeEntry.ndvi_max}</div>
                      </div>
                    </div>
                  ) : batchActive ? (
                    <div className="flex items-center justify-center gap-1.5 text-center text-[11px] text-ink-400">
                      <div className="h-3 w-3 flex-none animate-spin rounded-full border-2 border-cream-inset border-t-forest-500" />
                      {timedOut ? t("landingDrawTimeout") : t("landingDrawWeekAnalyzing")}
                    </div>
                  ) : (
                    <div className="text-center text-[11px] text-ink-400">{t("landingDrawWeekEmpty")}</div>
                  )}
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
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
