# Plan 05 — Crop-health graph window filtering + cross-module analysis-job persistence

**Goal (2 user-reported bugs):**
1. **Crop health page:** picking a time period (7D/30D/90D/Custom) in the season-trend picker does not change the graph — it always shows the same full history. Confirmed visually: user-supplied screenshot shows the chart spanning "23 Jan – 20 Jul" regardless of which control is active.
2. **My Fields page:** starting a field analysis (satellite fetch), switching to another module, then returning makes the analysis look like it stopped — instead of continuing to reflect progress until the job actually completes.

> ⚠️ `frontend/AGENTS.md`: this Next.js has breaking changes vs. training data — read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing code.
> ⚠️ Line numbers below are as of commit `51c0a9b`. Re-locate by anchor text/comment, not raw line number, if the tree has moved on.

---

## Phase 0 — Documentation discovery (COMPLETE — consolidated findings)

### Bug 1 — why the graph never reflects the picked window

- `frontend/src/app/(app)/health/page.tsx:117` — `<MeasureTrendChart history={ndvi?.history ?? []} />`. `ndvi` comes from `useFieldNdvi(selectedFieldId)` (`frontend/src/lib/api/hooks.ts:30-36`), which calls `GET /fields/{id}/ndvi` with **no date params at all** — it always returns the field's *entire* history.
- Backend confirms there is no windowed variant: `backend/app/services/ndvi_job_service.py:262-278` (`get_field_ndvi`) unconditionally queries **all** `NdviHistory` rows for the field, ordered newest-first. `backend/app/api/v1/routes_fields.py:113-119` accepts no query params on this route.
- `frontend/src/components/ui/MeasureTrendChart.tsx:45` — `MeasureTrendChart({ history })` takes the array as-is and plots every row (`seriesFor`, lines 16-24). It has **no concept of a date-range prop** to filter by.
- The picker's own state, `timeWindow` (`health/page.tsx:40`), is **only** used inside `handleWindowChange` (`health/page.tsx:65-73`) to fire `reanalyzeField.mutate({fieldId, input: range})` — i.e. it kicks off a **new backend satellite-fetch job** for that window, then (`health/page.tsx:59-63`) invalidates `["fields"]` on completion so `useFieldNdvi` refetches. But that refetch is still the same unfiltered "all history" call. **The selected window never once gates what's rendered.** That's the entire bug — confirmed independently by the user's screenshot (axis unchanged across picker states).
- A side effect: every preset click (even "7D" when 7-day data is already cached) unconditionally fires a brand-new reanalyze job, which is slow and makes the picker feel broken/unresponsive on top of not changing the display.
- **A correct precedent for the "avoid redundant reanalyze" half already exists** in this codebase: `frontend/src/components/map/FieldReanalyzePanel.tsx:80-98` (`handleAnalyze`) only calls `reanalyzeField.mutate` for tiles that are actually missing from cached `history` (`hasGap`, computed via `frontend/src/lib/weekTiles.ts`'s `computeWeeklyTiles`/`matchEntry`). `health/page.tsx`'s picker never got this treatment — it's the simpler, unpatched sibling.

### Bug 2 — why analysis looks like it "stops" on module switch

- The backend job is a detached `BackgroundTasks` target: `backend/app/services/ndvi_job_service.py` module docstring (lines 1-9) and `run_ndvi_job` (lines 151-237) explicitly open their **own** `SessionLocal()` because they run *after* the HTTP response is sent. **The satellite fetch itself never stops when the browser navigates away** — this is purely a frontend state-tracking bug, not a backend/job bug.
- Job-in-progress tracking (`activeFieldId` + `activeJobId`, feeding an `isAnalyzing` derivation) is duplicated as **component-local `useState`** in three separate places, each vulnerable to being wiped on unmount:
  1. `frontend/src/app/(app)/fields/page.tsx:57-58` (state), `:62` (`useNdviJob` poll), `:66-67` (`isAnalyzing`), `:106-107` (set on job creation). This state gates the entire left panel — draw button vs. spinner (`:134`, `:206-212`) vs. field list.
  2. `frontend/src/app/(app)/health/page.tsx:41-52` — same pattern, second independent copy.
  3. `frontend/src/components/map/FieldReanalyzePanel.tsx:30-39` — third independent copy, **additionally** remounted via `key={selectedField.id}` at `fields/page.tsx:217`, so it also loses tracking on a plain field switch, not just a module switch.
- `useNdviJob` (`hooks.ts:46-56`) only polls while `enabled: Boolean(fieldId && jobId)` — once the owning component unmounts and that local state is gone, polling simply stops; there is no reconciliation step anywhere that asks "is there still a job running for this field?" on remount.
- Net effect: navigate away from `/fields` while `mode === "saving"`/`isAnalyzing === true`, then come back → `fields/page.tsx` has remounted fresh, `activeJobId` is `null` again, `mode` is `"idle"` again → the spinner is gone and the normal field list renders, which reads to the user as "the analysis stopped," even though the backend job is still running (or already finished) headless.
- `frontend/src/app/(app)/fields/page.tsx` has **no invalidate-on-done effect at all** (unlike `health/page.tsx:59-63` and `FieldReanalyzePanel.tsx:45-49`) — a pre-existing, separate gap that the fix below closes for free by centralizing the effect.
- **Reuse targets already in this codebase** for the fix (ladder rung 2 — don't invent new plumbing):
  - `frontend/src/lib/store/useAppStore.ts` — a Zustand store that **already solves this exact class of problem** for `selectedFieldId`/`mapLayer` (global, survives route navigation, no persistence middleware needed for in-session nav).
  - `frontend/src/app/(app)/layout.tsx` — confirmed to persist across every route inside the `(app)` group (only `{children}` swaps; `Sidebar`/`TopBar` don't remount) — the natural place to host one long-lived poll/invalidate effect instead of three short-lived, duplicated ones.
  - `frontend/src/app/providers.tsx:13` — `QueryClient` has `staleTime: 30_000` and lives above the router already, so the query cache itself already survives navigation; only the *job-id reference* needs to move.

### Anti-patterns to avoid
- No new backend endpoint/query params for "windowed NDVI history" — the frontend already holds the complete history client-side; filtering it is a one-line `.filter()`, not a new API surface.
- No new global state library, context provider, websocket, or SSE channel for "keep tracking the job" — the app already has a working cross-page store (Zustand) and a working poll-based job-status hook (`useNdviJob`); reuse both.
- No multi-job dictionary (`Record<fieldId, jobId>`). Every existing call site already assumes exactly one tracked job at a time (e.g. `health/page.tsx:48-52`'s `activeFieldId === selectedFieldId` guard only makes sense under a single-slot assumption). Generalizing to true concurrent multi-field job tracking is out of scope — not what was reported, and the current UI has no affordance for watching two fields at once anyway. Flag as a documented non-goal, not a silent limitation.

---

## Phase 1 — Crop health: make the graph respect the selected window

**File:** `frontend/src/app/(app)/health/page.tsx`

1. Filter what's handed to the chart instead of passing raw `ndvi?.history`:
   ```ts
   const filteredHistory = useMemo(() => {
     const rows = ndvi?.history ?? [];
     if (!timeWindow) return rows;
     return rows.filter(
       (r) => r.satellite_image_date >= timeWindow.start_date && r.satellite_image_date <= timeWindow.end_date
     );
   }, [ndvi?.history, timeWindow]);
   ```
   Replace line 117's `history={ndvi?.history ?? []}` with `history={filteredHistory}`. `timeWindow === null` (no explicit selection yet) keeps today's "show everything" behavior, matching `TimeWindowPicker`'s own documented contract (`TimeWindowPicker.tsx:13`).
   - `NdviHistoryItem.satellite_image_date` is a plain `YYYY-MM-DD` string on the wire (confirmed via `weekTiles.ts:84-87`'s `matchEntry`, which does the identical plain-string comparison) — no `Date` parsing needed, mirrors an existing pattern instead of inventing one.

2. Stop firing a redundant reanalyze job when the picked window's data is already cached. Port the gap-check from `FieldReanalyzePanel.tsx:80-98`:
   - Import `computeWeeklyTiles`, `matchEntry` from `@/lib/weekTiles`.
   - In `handleWindowChange` (`health/page.tsx:65-73`), compute the picked range's tiles and check whether any tile has no matching entry in `ndvi?.history`. Only call `reanalyzeField.mutate(...)` if there's an actual gap; otherwise just `setTimeWindow(range)` — Phase 1's filter above redraws instantly from already-cached data, no spinner, no network call.

### Verification checklist
- `cd frontend && npx tsc --noEmit` clean.
- `npx eslint src/app/\(app\)/health/page.tsx` clean.
- Manual: on `/health`, click 7D → 30D → 90D → a custom range narrower than existing data. Confirm the chart's x-axis start/end and point count actually change each time (contrast with the reported screenshot, where "23 Jan – 20 Jul" never moved).
- Manual: pick a preset whose data is already cached — confirm the chart updates **immediately**, with no "Analysing via Sentinel-2…" spinner and no network request to `/reanalyze` (check the Network tab).
- Manual: pick a custom range with a genuine gap (dates never analyzed before) — confirm the spinner *does* show, a `/reanalyze` call fires, and the chart updates to the filtered window once the job completes.

### Anti-pattern guard
- Don't touch `get_field_ndvi` / `GET /fields/{id}/ndvi` on the backend — this is a display-layer fix only.
- Don't add a new prop-drilled "selectedRange" concept inside `MeasureTrendChart` itself — filtering the array before it reaches the component is simpler and keeps that component's existing contract (`history: NdviHistoryItem[]`) unchanged.

---

## Phase 2 — Persist analysis-job tracking across module switches

**Files:** `frontend/src/lib/store/useAppStore.ts`, `frontend/src/app/(app)/layout.tsx`, `frontend/src/app/(app)/fields/page.tsx`, `frontend/src/app/(app)/health/page.tsx`, `frontend/src/components/map/FieldReanalyzePanel.tsx`

1. **Add one shared slice to the existing store** (`useAppStore.ts`), next to `selectedFieldId`:
   ```ts
   activeJob: { fieldId: string; jobId: string } | null;
   setActiveJob: (job: { fieldId: string; jobId: string } | null) => void;
   ```

2. **Host a single poll/invalidate/auto-clear effect in `(app)/layout.tsx`**, since it's the one component guaranteed to stay mounted across every module in this route group:
   ```ts
   const activeJob = useAppStore((s) => s.activeJob);
   const setActiveJob = useAppStore((s) => s.setActiveJob);
   const queryClient = useQueryClient();
   const jobStatus = useNdviJob(activeJob?.fieldId ?? null, activeJob?.jobId ?? null);
   useEffect(() => {
     if (jobStatus.data?.status === "done" || jobStatus.data?.status === "failed") {
       queryClient.invalidateQueries({ queryKey: ["fields"] });
       setActiveJob(null);
     }
   }, [jobStatus.data?.status, queryClient, setActiveJob]);
   ```
   This one effect replaces the two existing duplicated invalidate-on-done effects (`health/page.tsx:59-63`, `FieldReanalyzePanel.tsx:45-49`) and closes the pre-existing gap where `fields/page.tsx` had none at all.

3. **Update all three call sites to read/write `useAppStore`'s `activeJob` instead of local `useState`:**
   - `fields/page.tsx`: remove local `activeJobId`/`activeFieldId` (`:57-58`); `isAnalyzing` (`:66-67`) reads `useAppStore((s) => s.activeJob)` instead; `handleSave` (`:106-107`) calls `setActiveJob({ fieldId: result.field.id, jobId: result.job_id })`.
   - `health/page.tsx`: remove local `activeFieldId`/`activeJobId` (`:41-42`); `isAnalyzing` (`:48-52`) reads the store slice (keep the existing `activeJob.fieldId === selectedFieldId` guard — it's still correct and now doubly justified since the slice is app-wide, not page-local); `handleWindowChange` (`:68,71-72`) calls `setActiveJob(...)`.
   - `FieldReanalyzePanel.tsx`: remove local `activeFieldId`/`activeJobId` (`:30-31`); `isAnalyzing` (`:36-39`) reads the store slice; `handleAnalyze` (`:93,96`) calls `setActiveJob(...)`; `handlePeriodChange` (`:76-77`) still intentionally drops tracking of the old period's job by calling `setActiveJob(null)` — that per-period reset is correct existing behavior, not part of the bug, just re-expressed through the shared setter.
   - Since the layout-level effect (step 2) now owns invalidation, delete the now-redundant local effects at `health/page.tsx:59-63` and `FieldReanalyzePanel.tsx:45-49`.

4. **Explicit non-goal (state it, don't build it):** a hard browser refresh (not in-app navigation) still drops the in-memory `activeJob` — Zustand's default store isn't persisted to `sessionStorage`, and there's no backend "list pending jobs" endpoint to reconcile against on a fresh mount. The job keeps running headless server-side either way; only "resume watching after a reload" is out of scope, since the user's complaint is specifically about switching modules in-app, not reloading the page. If wanted later, that's a separate follow-up (persist middleware + a small reconciliation query), not something to speculatively build now.

### Verification checklist
- `cd frontend && npx tsc --noEmit` clean.
- `npx eslint src/app/\(app\)/fields/page.tsx src/app/\(app\)/health/page.tsx src/components/map/FieldReanalyzePanel.tsx src/app/\(app\)/layout.tsx src/lib/store/useAppStore.ts` clean.
- `grep -n "activeJobId\|activeFieldId" frontend/src/app/\(app\)/fields/page.tsx frontend/src/app/\(app\)/health/page.tsx frontend/src/components/map/FieldReanalyzePanel.tsx` — should show **zero** local `useState` declarations of these names left (all three now read/write the shared store instead).
- `git diff frontend/package.json` — empty (no new dependency added).
- Manual (the actual reported bug): on `/fields`, draw and save a new field (or trigger a re-analyze) so the "Analysing via Sentinel-2…" spinner shows. While it's spinning, click to `/health` or `/ledger`, wait a few seconds, then click back to `/fields`. Confirm the spinner is **still showing** if the job hasn't finished, and the field/NDVI data has **populated correctly** if it completed while away — i.e., no false "it stopped" state.
- Manual: same test but switch the *selected field* on `/fields` mid-analysis (exercises `FieldReanalyzePanel`'s remount-via-`key` case) — confirm tracking survives that too.
- Manual: confirm a genuinely finished/failed job still correctly clears `isAnalyzing` everywhere (no permanently-stuck spinner) — the layout effect's auto-clear on `"done"`/`"failed"` covers this.

### Anti-pattern guard
- Don't add `sessionStorage`/`localStorage` persistence to `useAppStore` for this — not needed for the in-app-navigation bug that was reported (see non-goal above).
- Don't turn `activeJob` into a `Record<fieldId, jobId>` map — every existing call site already assumes a single tracked job; matching that assumption is the lazy, correct-for-what's-actually-used fix, not an artificial limitation.
- Don't introduce React Context for this — Zustand is already the app's cross-component state mechanism (`useAppStore` is used from `Sidebar`, `TopBar`, `fields/page.tsx`, `health/page.tsx` already); adding Context alongside it would be a second, redundant state mechanism.

---

## Phase 3 — Final verification

1. Run both phases' checklists above.
2. `cd frontend && npx tsc --noEmit && npx eslint .` (whole-project pass, not just touched files) — confirm no regressions elsewhere from the `useAppStore` shape change.
3. Re-run the exact repro from the user's screenshot: confirm the season-trend chart's x-axis labels change with each picker selection (no longer permanently "23 Jan – 20 Jul" regardless of input).
4. Re-run the exact repro from the user's second report: start a field analysis, switch modules, come back — confirm continuity end-to-end (spinner persists or clears correctly, data lands once the job is actually done).
5. `git status` / `git diff --stat` — confirm the changed-file set matches exactly: `useAppStore.ts`, `(app)/layout.tsx`, `fields/page.tsx`, `health/page.tsx`, `FieldReanalyzePanel.tsx` (plus no incidental changes elsewhere).
