"use client";

import { useLayoutEffect, useState } from "react";
import { useNdviJob, useReanalyzeField } from "@/lib/api/hooks";
import { useAppStore } from "@/lib/store/useAppStore";
import { TimeWindowPicker, isoDaysAgo, todayIso, type DateRange } from "@/components/ui/TimeWindowPicker";
import { WeekScrubber } from "@/components/map/WeekScrubber";
import { computeWeeklyTiles, matchEntry } from "@/lib/weekTiles";
import { Button } from "@/components/ui/Button";
import type { NdviHistoryItem } from "@/lib/api/types";

interface FieldReanalyzePanelProps {
  fieldId: string;
  /** From useFieldNdvi(fieldId).data.history — newest-first, as the backend returns it. */
  history: NdviHistoryItem[];
  onActiveEntryChange: (entry: NdviHistoryItem | null) => void;
}

export function FieldReanalyzePanel({ fieldId, history, onActiveEntryChange }: FieldReanalyzePanelProps) {
  // Default: last 30 days. Lands activeTileIndex 0 (most recent tile) on
  // "this week" without scanning `history` for a min/max span, which could
  // be arbitrarily wide/sparse for an old field.
  const [period, setPeriod] = useState<DateRange>(() => ({ start_date: isoDaysAgo(30), end_date: todayIso() }));
  const [activeTileIndex, setActiveTileIndex] = useState(0);

  // Shared across modules (see useAppStore), not local state — this panel
  // remounts via key={selectedField.id} on field switch (fields/page.tsx),
  // which used to drop tracking of an in-flight job; the (app) layout now
  // owns polling it to completion and invalidating/clearing it centrally.
  const activeJob = useAppStore((s) => s.activeJob);
  const setActiveJob = useAppStore((s) => s.setActiveJob);

  const reanalyzeField = useReanalyzeField();
  const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);
  const isAnalyzing =
    activeJob !== null &&
    activeJob.fieldId === fieldId &&
    jobStatus.data?.status !== "done" &&
    jobStatus.data?.status !== "failed";

  const tiles = computeWeeklyTiles(period);
  const activeTile = tiles[activeTileIndex] ?? null;
  const activeEntry = activeTile ? matchEntry(activeTile, history) : null;
  // Any tile in the picked period without a cached reading yet — "Analyse
  // this period" only shows while there's a real gap to fill.
  const hasGap = tiles.some((tile) => matchEntry(tile, history) === null);

  // Reports the derived active entry up to the parent. This calls a PARENT
  // callback in response to a derived value changing, not this component's
  // own setState, so it doesn't trip react-hooks/set-state-in-effect (that
  // rule only flags calling a useState setter local to the same component).
  // useLayoutEffect, not useEffect: this panel remounts via
  // key={selectedField.id} on field switch, and with a passive useEffect
  // there's a real one-frame flash of the OLD field's NDVI image over the
  // NEW field's boundary whenever the new field's data is already
  // cache-warm (useField/useFieldNdvi resolve synchronously from cache).
  useLayoutEffect(() => {
    onActiveEntryChange(activeEntry);
  }, [activeEntry, onActiveEntryChange]);

  function handlePeriodChange(range: DateRange) {
    setPeriod(range);
    setActiveTileIndex(0); // most recent tile of the new period
    // Drop tracking of this field's previous-period job so its stale
    // analyzing/failed state can't bleed into the newly picked period —
    // but only if it's actually this field's job: activeJob is a shared
    // global slot, and a different field's in-flight job (started
    // elsewhere, e.g. before the user switched selected field) must not be
    // clobbered just because this field's period picker was touched.
    if (activeJob?.fieldId === fieldId) setActiveJob(null);
  }

  function handleAnalyze() {
    if (isAnalyzing) return;
    const missing = tiles.filter((tile) => matchEntry(tile, history) === null);
    if (missing.length === 0) return;
    // Only re-fetch the span actually missing cached data, not the whole
    // picked period — verified live that the common case is "just the
    // newest week" (satellite data lags a few days behind today), so this
    // keeps that case down to one tile's worth of satellite query instead
    // of redundantly re-analysing weeks that are already cached. Only
    // degrades (back to covering the whole span) for non-contiguous gaps,
    // which is rare.
    const spanStart = missing.reduce((min, t) => (t.start < min ? t.start : min), missing[0].start);
    const spanEnd = missing.reduce((max, t) => (t.end > max ? t.end : max), missing[0].end);
    reanalyzeField.mutate(
      { fieldId, input: { start_date: spanStart, end_date: spanEnd } },
      { onSuccess: (job) => setActiveJob({ fieldId, jobId: job.id }) },
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-cream-card p-3.5">
      <div className="text-[13px] font-bold text-ink-900">Re-analyse a past period</div>

      <TimeWindowPicker value={period} onChange={handlePeriodChange} disabled={isAnalyzing} />

      <WeekScrubber
        tiles={tiles}
        activeIndex={activeTileIndex}
        onIndexChange={setActiveTileIndex}
        ariaLabel="Select a week to re-analyse"
        stateForTile={(tile) => (matchEntry(tile, history) !== null ? "cached" : isAnalyzing ? "analyzing" : "empty")}
      />

      {hasGap && !isAnalyzing && (
        <Button
          variant="primary"
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs"
          onClick={handleAnalyze}
          disabled={reanalyzeField.isPending}
        >
          {reanalyzeField.isPending ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Starting…
            </>
          ) : (
            "Analyse this period"
          )}
        </Button>
      )}

      {isAnalyzing && (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-cream-inset border-t-forest-500" />
          Analysing via Sentinel-2…
        </div>
      )}

      {jobStatus.data?.status === "failed" && (
        <div role="alert" className="rounded-xl bg-alert-red-bg p-2.5 text-[11.5px] text-alert-red-text">
          {jobStatus.data?.error_message ?? "Analysis failed."}
        </div>
      )}

      {reanalyzeField.isError && (
        <div role="alert" className="rounded-xl bg-alert-red-bg p-2.5 text-[11.5px] text-alert-red-text">
          Couldn&apos;t start analysis — check your connection and try again.
        </div>
      )}
    </div>
  );
}
