"use client";

import { useLayoutEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNdviJob, useReanalyzeField } from "@/lib/api/hooks";
import { TimeWindowPicker, isoDaysAgo, todayIso, type DateRange } from "@/components/ui/TimeWindowPicker";
import { WeekScrubber } from "@/components/map/WeekScrubber";
import { computeWeeklyTiles, matchEntry, type WeekTile } from "@/lib/weekTiles";
import { Button } from "@/components/ui/Button";
import type { NdviHistoryItem } from "@/lib/api/types";

interface FieldReanalyzePanelProps {
  fieldId: string;
  /** From useFieldNdvi(fieldId).data.history — newest-first, as the backend returns it. */
  history: NdviHistoryItem[];
  onActiveEntryChange: (entry: NdviHistoryItem | null) => void;
}

export function FieldReanalyzePanel({ fieldId, history, onActiveEntryChange }: FieldReanalyzePanelProps) {
  const queryClient = useQueryClient();
  // Default: last 30 days. Lands activeTileIndex 0 (most recent tile) on
  // "this week" without scanning `history` for a min/max span, which could
  // be arbitrarily wide/sparse for an old field.
  const [period, setPeriod] = useState<DateRange>(() => ({ start_date: isoDaysAgo(30), end_date: todayIso() }));
  const [activeTileIndex, setActiveTileIndex] = useState(0);

  // Mirrors health/page.tsx's handleWindowChange fix: track the field a job
  // was actually submitted against, not a live prop, and guard against
  // firing a second reanalyze while one is still pending.
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [pendingTile, setPendingTile] = useState<WeekTile | null>(null);

  const reanalyzeField = useReanalyzeField();
  const jobStatus = useNdviJob(activeFieldId, activeJobId);
  const isAnalyzing =
    activeJobId !== null && jobStatus.data?.status !== "done" && jobStatus.data?.status !== "failed";

  // Same invalidation precedent as useCreateField (hooks.ts) and
  // health/page.tsx — refetches useFieldNdvi globally via React Query's
  // shared cache, so no callback back to the parent is needed for it to see
  // new history.
  useLayoutEffect(() => {
    if (jobStatus.data?.status === "done") {
      queryClient.invalidateQueries({ queryKey: ["fields"] });
    }
  }, [jobStatus.data?.status, queryClient]);

  const tiles = computeWeeklyTiles(period);
  const activeTile = tiles[activeTileIndex] ?? null;
  const activeEntry = activeTile ? matchEntry(activeTile, history) : null;

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
  }

  function handleAnalyze() {
    if (!activeTile || isAnalyzing) return;
    setActiveFieldId(fieldId);
    setPendingTile(activeTile);
    reanalyzeField.mutate(
      { fieldId, input: { start_date: activeTile.start, end_date: activeTile.end } },
      { onSuccess: (job) => setActiveJobId(job.id) },
    );
  }

  const failedForActiveTile =
    jobStatus.data?.status === "failed" &&
    pendingTile !== null &&
    activeTile !== null &&
    pendingTile.start === activeTile.start &&
    pendingTile.end === activeTile.end;

  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-cream-card p-3.5">
      <div className="text-[13px] font-bold text-ink-900">Re-analyze a past week</div>

      <TimeWindowPicker value={period} onChange={handlePeriodChange} disabled={isAnalyzing} />

      <WeekScrubber
        tiles={tiles}
        activeIndex={activeTileIndex}
        onIndexChange={setActiveTileIndex}
        ariaLabel="Select a week to re-analyze"
        stateForTile={(tile, i) =>
          i === activeTileIndex && isAnalyzing ? "analyzing" : matchEntry(tile, history) !== null ? "cached" : "empty"
        }
      />

      {tiles.length > 0 && !activeEntry && !isAnalyzing && (
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
            "Analyze this week"
          )}
        </Button>
      )}

      {isAnalyzing && (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-cream-inset border-t-forest-500" />
          Analyzing via Sentinel-2…
        </div>
      )}

      {failedForActiveTile && (
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
