"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getToken } from "@/lib/api/client";
import { useCreateField, useDeleteField, useField, useFieldNdvi, useNdviJob } from "@/lib/api/hooks";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { isoDaysAgo, todayIso } from "@/components/ui/TimeWindowPicker";
import { computeWeeklyTiles, matchEntry, type WeekTile } from "@/lib/weekTiles";
import { WeekScrubber } from "@/components/map/WeekScrubber";
import { Button } from "@/components/ui/Button";
import type { PolygonGeometry } from "@/lib/api/types";
import type { MapLayer } from "@/lib/store/useAppStore";
import type { FieldOverlay } from "@/components/map/FieldsMap";
import { MeasureDropdown } from "@/components/map/MeasureDropdown";
import { ScanSweep } from "@/components/map/ScanSweep";
import { layerPng, layerStats } from "@/lib/measures";
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

// A CDSE job can hang in "running" with no server-side timeout — stop
// showing an endless spinner after this long and offer a retry.
const JOB_TIMEOUT_MS = 150_000;

/**
 * Landing-page hero: the real field-drawing + NDVI/NDMI analysis flow from
 * /fields, runnable by anonymous visitors. Guests get the previous 4 weeks as
 * separate weekly readings, NOT a single averaged window — custom date
 * ranges are gated behind an account. The whole 4-week window is fetched in
 * ONE satellite query (compute_ndvi_periods on the backend splits it into
 * weekly composites server-side), so this fires exactly one job, not one
 * per week. If no token exists yet, we log in as the shared guest user
 * right before saving.
 */
export function LandingFieldAnalyzer() {
  const { t } = useTranslation();
  const { isAuthenticated, loginAsGuest } = useAuth();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("idle");
  const [pendingGeometry, setPendingGeometry] = useState<PolygonGeometry | null>(null);
  const [pendingArea, setPendingArea] = useState(0);
  const [clearSignal, setClearSignal] = useState(0);
  const [layerChoice, setLayerChoice] = useState<MapLayer | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [activeTileIndex, setActiveTileIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [locateSignal, setLocateSignal] = useState(0);
  // True only when THIS component minted the guest session — the demo field
  // is then ours to clean up on reset. Never delete under a pre-existing
  // (real or earlier-guest) session.
  const mintedGuestSession = useRef(false);

  // The four weekly tiles (newest first), fixed for the component's life —
  // just used to label the scrubber and drive the one createField request's
  // start/end (oldest tile's start to newest tile's end).
  const [tiles] = useState<WeekTile[]>(() =>
    computeWeeklyTiles({ start_date: isoDaysAgo(28), end_date: todayIso() }),
  );

  const createField = useCreateField();
  const deleteField = useDeleteField();
  const jobStatus = useNdviJob(activeFieldId, activeJobId);
  const { data: field } = useField(activeFieldId);
  const { data: ndvi } = useFieldNdvi(activeFieldId);

  const history = ndvi?.history ?? [];
  const anyResults = history.length > 0;
  const activeEntry = tiles[activeTileIndex] ? matchEntry(tiles[activeTileIndex], history) : null;
  const isAnalyzing =
    mode === "saving" ||
    (activeJobId !== null && jobStatus.data?.status !== "done" && jobStatus.data?.status !== "failed");
  // Heatmap by default once any week has results; the toggle overrides.
  const layer: MapLayer = layerChoice ?? (anyResults ? "ndvi" : "satellite");

  // The NDVI PNGs/stats only exist once the job finishes — nothing else
  // refetches the field's query while it was still running.
  useEffect(() => {
    if (jobStatus.data?.status === "done" && activeFieldId) {
      queryClient.invalidateQueries({ queryKey: ["fields", activeFieldId] });
    }
  }, [jobStatus.data?.status, activeFieldId, queryClient]);

  // "Taking longer than usual" timer for the one job this flow fires.
  // timedOut is cleared where activeJobId is set (handleAnalyze), not here,
  // to avoid a synchronous setState-in-effect.
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
    // once its job has reached a terminal state. Deleting the field while
    // its job is still running crashes that background job trying to write
    // results for a field that's already gone; leaving it lets the job
    // finish (it's still cleaned up on the next reset once terminal).
    if (mintedGuestSession.current && activeFieldId && !isAnalyzing) {
      deleteField.mutate(activeFieldId);
    }
    setMode("idle");
    setPendingGeometry(null);
    setPendingArea(0);
    setSaveFailed(false);
    setTimedOut(false);
    setActiveJobId(null);
    setActiveFieldId(null);
    setActiveTileIndex(0);
    setLayerChoice(null);
    setClearSignal((n) => n + 1);
    setExpanded(false);
  }

  function handleDrawComplete(geometry: PolygonGeometry, areaHectares: number) {
    setPendingGeometry(geometry);
    setPendingArea(areaHectares);
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
      // tiles is newest-first — span the whole 4-week window in ONE
      // request; compute_ndvi_periods splits it into weekly readings
      // server-side from a single satellite fetch.
      const oldest = tiles[tiles.length - 1];
      const newest = tiles[0];
      const result = await createField.mutateAsync({
        name: t("landingDrawDefaultName"),
        geometry: pendingGeometry,
        start_date: oldest.start,
        end_date: newest.end,
      });
      setActiveFieldId(result.field.id);
      setActiveJobId(result.job_id);
      setActiveTileIndex(0);
      setMode("idle");
    } catch {
      setSaveFailed(true);
      setMode("naming");
    }
  }

  const overlay: FieldOverlay | null =
    field && activeEntry
      ? {
          id: field.id,
          boundingBox: boundsFromGeometry(field.geometry),
          imageUrl: layerPng(activeEntry, layer) ?? "",
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

          <ScanSweep active={isAnalyzing} />

          <div className="absolute right-3 top-3 z-10 flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              {anyResults && (
                <MeasureDropdown value={layer} onChange={setLayerChoice} className="w-44" />
              )}
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
                {saveFailed && <div className="text-xs font-semibold text-alert-red-text">{t("landingDrawError")}</div>}
                <Button onClick={handleAnalyze}>
                  {saveFailed ? t("landingDrawRetry") : t("landingDrawAnalyze")}
                </Button>
                <Button variant="secondary" onClick={reset}>
                  {t("cancel")}
                </Button>
              </div>
            )}

            {/* No spinner here (or in the per-week readout below): the scan
                sweeping across the map behind this panel is the progress
                indicator, and a second spinning thing next to it would just
                split attention between two motions saying the same thing. */}
            {mode === "saving" && (
              <div className="flex flex-col items-center gap-1.5 py-2 text-center">
                <div className="text-[13px] font-bold text-ink-900">{t("landingDrawAnalyzing")}</div>
                <div className="text-xs text-ink-400">{t("landingDrawAnalyzingHint")}</div>
              </div>
            )}

            {activeFieldId &&
              (!isAnalyzing && !anyResults ? (
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
                      matchEntry(tile, history) !== null ? "cached" : isAnalyzing ? "analyzing" : "empty"
                    }
                  />
                  {activeEntry ? (() => {
                    // Track the measure the dropdown selects, not always NDVI.
                    const stat = layerStats(activeEntry, layer);
                    const fmt = (v: number | null) => (v == null ? "—" : v);
                    return (
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <div className="text-ink-400">{t("landingDrawMean")}</div>
                          <div className="font-bold text-forest-ink-900">{fmt(stat.mean)}</div>
                        </div>
                        <div>
                          <div className="text-ink-400">{t("landingDrawMin")}</div>
                          <div className="font-bold text-forest-ink-900">{fmt(stat.min)}</div>
                        </div>
                        <div>
                          <div className="text-ink-400">{t("landingDrawMax")}</div>
                          <div className="font-bold text-forest-ink-900">{fmt(stat.max)}</div>
                        </div>
                      </div>
                    );
                  })() : isAnalyzing ? (
                    <div className="text-center text-[11px] text-ink-400">
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
