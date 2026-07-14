# Plan 01 — Landing page redesign: live field-drawing hero + section restructure

**Goal (3 user requirements):**
1. Replace the hero map with the **complete field-drawing functionality**: a visitor draws a boundary, names the field, and gets the **full NDVI/NDMI analysis with heatmap overlay** — without signing in, without leaving the landing page.
2. Remove the field map ("My Fields — satellite field mapping" card) from the "Everything we offer" features section.
3. Move the "How it works" section **above** "Everything we offer" and delete the "Powered by…" strip.

**Product decision (confirmed with user):** anonymous visitors get the full draw → analyze → heatmap flow on the landing page itself. Mechanism: **silent guest auth** — the backend's `POST /api/v1/auth/guest` returns a real token for a fixed demo user (`backend/app/api/v1/routes_auth.py:41-51`), so zero backend changes are needed.

> ⚠️ **Every phase:** `frontend/AGENTS.md` warns this Next.js has breaking changes vs. training data. Read the relevant guide in `frontend/node_modules/next/dist/docs/` before writing code.
>
> ⚠️ Line numbers below are as of commit `7721976`. Phase 1 shifts them — later phases must re-locate by the quoted anchor text/comments, not raw line numbers.

---

## Phase 0 — Documentation discovery (COMPLETE — consolidated findings)

### Landing page structure — `frontend/src/app/page.tsx` (715 lines, `"use client"`)
Section order inside `LandingPage()` (starts line 325):

| # | Section | Lines | Notes |
|---|---------|-------|-------|
| 1 | `<Nav t={t} />` | 349 | Anchor links `#features`, `#how`, `#mission` at 248-250 |
| 2 | Hero (`id="top"`) | 351-394 | `<HeroMap />` at 390-392 inside `<div className="jk-map-in">` |
| 3 | **"Powered by…" strip** | 396-412 | `{t("landingPoweredBy")}` + 4 hardcoded logos — **delete** |
| 4 | Features bento (`id="features"`) | 414-615 | Header 415-426, grid 428-594, ledger banner 596-614 |
| 5 | How it works (`id="how"`) | 617-651 | Driven by `STEPS` array (328-344) — **move above #4** |
| 6 | Mission (`id="mission"`) | 653-675 | |
| 7 | CTA + footer | 677-712 | CTA background reuses `FIELDS_TILE_IMAGE` at line 682 |

- `HeroMap` dynamic import at `page.tsx:11-16`: `dynamic(..., { ssr: false, loading: () => <div className="jk-contours-dark h-[400px] animate-pulse rounded-card-lg bg-[#1a2417]" /> })`.
- `FIELDS_TILE_IMAGE` (Mapbox Static Images URL) defined at `page.tsx:19` — used by Card A **and** the CTA banner (line 682). Keep the constant.
- Card A to remove = `page.tsx:429-458` (`<Reveal index={0}>` … static `<img>` + fake SVG polygon + "Drawing boundary · 6 points" badge).
- Remaining bento cards: B `NdviCard` 1×2 (461-463), C crop-health 1×1 (466-486), D disease 1×1 (489-516), E weather 2×1 (519-556), F mandi 2×1 (559-593). Grid: `grid grid-cols-1 gap-4 lg:grid-cols-4 lg:auto-rows-[172px]` (line 428) with explicit `lg:col-start/row-start` per card.

### Allowed APIs (verified in source — use ONLY these)
| API | Source | Signature / notes |
|-----|--------|-------------------|
| `FieldsMap` | `frontend/src/components/map/FieldsMap.tsx:33` | Props (lines 21-31): `{ fields, fieldGeometries, selectedFieldId, onSelectField, layer: MapLayer, overlay: FieldOverlay \| null, drawing: boolean, onDrawComplete(geometry, areaHectares), clearSignal: number }`. Exports `FieldOverlay { id, boundingBox, imageUrl }` (15-19). Uses `@mapbox/mapbox-gl-draw`; area via internal `shoelaceAreaHectares` (200-213). Safely inert with empty `fields`/`geometries`/`overlay=null`. |
| `useAuth()` | `frontend/src/lib/auth/AuthProvider.tsx:96` | `{ user, isLoading, isAuthenticated, login, signup, loginAsGuest, logout }`. `loginAsGuest()` (69-74) calls `authApi.guest()`, stores token, invalidates `["auth","me"]`. |
| `useCreateField()` | `frontend/src/lib/api/hooks.ts:81-87` | Mutation; input `CreateFieldInput { name, geometry, district?, crop? }` (`resources.ts:37-42`); returns `{ field, job_id }` (see `fields/page.tsx:96-104`). Does NOT gate on auth — token must exist before calling. |
| `useNdviJob(fieldId, jobId)` | `hooks.ts:46-56` | Polls every 2 s while status `pending`/`running`; terminal: `"done"` / `"failed"`. |
| `useField(fieldId)` / `useFieldNdvi(fieldId)` | `hooks.ts:22-36` | `enabled: Boolean(fieldId)` — no auth gate; fine for a locally-tracked field id. |
| `boundsFromGeometry(geometry)` | `frontend/src/lib/geo` (used `fields/page.tsx:115`) | Builds `FieldOverlay.boundingBox`. |
| `MapLayer` | `frontend/src/lib/store/useAppStore` | `"ndvi" \| "ndmi" \| "satellite"`. |
| Guest endpoint | `backend/app/api/v1/routes_auth.py:41-51` | `POST /auth/guest` → `Token`; fixed shared demo user. |
| i18n | `frontend/src/lib/i18n/useTranslation.ts` | `const { t, lang, dir } = useTranslation()`; dictionary EN+UR in `frontend/src/lib/i18n/dictionary.ts`. |

### Copy-ready reference flows
- **Draw → name → save → poll → overlay state machine:** `frontend/src/app/(app)/fields/page.tsx:26,47-118` (`Mode = "idle" | "drawing" | "naming" | "saving"`, `handleDrawComplete` 77-82, `handleSave` 92-109, `isAnalyzing` derivation 63-64, `overlay` construction 111-118).
- **Layer toggle buttons:** `fields/page.tsx:223-235`; **stats card (mean/min/max):** 200-218; **"Analyzing via Sentinel-2…" spinner:** 192-198; **naming form:** 174-190.
- **Dynamic map import (`ssr:false`):** `fields/page.tsx:21-24` or `page.tsx:11-16`.
- **Read-only FieldsMap embed:** `dashboard/page.tsx:105-115`.

### Anti-patterns / constraints (do NOT violate)
- ❌ No `useFields()` / `useFieldGeometries()` on the landing page — the guest account is **shared**; listing would expose other visitors' fields. Track only the locally created field id.
- ❌ Do not call `loginAsGuest()` if a token already exists / `isAuthenticated` — it would replace a real user's session. Guard: only guest-login when `!isAuthenticated && !getToken()` (`getToken` from `@/lib/api/client`).
- ❌ No static import of `FieldsMap`/`mapbox-gl` in the page — must stay `next/dynamic` + `ssr: false` (WebGL, `window`).
- ❌ No turf.js or new map libs — deps already present: `mapbox-gl ^3.26.0`, `@mapbox/mapbox-gl-draw ^1.5.1`. Env: `NEXT_PUBLIC_MAP_TILES_KEY` (already public).
- ❌ Don't invalidate/list the `["fields"]` query cache-wide from the landing widget beyond what `useCreateField` already does.
- ❌ Don't delete `FIELDS_TILE_IMAGE` (still used by CTA banner) or the `landingNavFeatures/How` keys.
- ❌ New visible strings must go through `dictionary.ts` (EN + UR) — the landing page is bilingual with RTL (`dir` on root, `page.tsx:347`).

### Tests touching this page
`frontend/e2e/routing.spec.ts:3-7` asserts hero headline text (`"every acre"`) + "Sign in" link — unaffected if hero copy stays. No test asserts the Powered-by strip, section order, or Card A. Mapbox draw interaction is explicitly not e2e-covered (`e2e/fields.spec.ts:15-20`).

---

## Phase 1 — Section surgery in `page.tsx` (no new functionality)

**What to implement** (all in `frontend/src/app/page.tsx`):
1. **Delete the "Powered by…" strip**: the whole `border-y … bg-cream-card` block, lines 396-412 (anchor: `{t("landingPoweredBy")}`).
2. **Delete Card A** from the features bento: `<Reveal index={0}>` block, lines 429-458 (anchor: `My Fields — satellite field mapping`).
3. **Repack the bento grid** (line 428) into a clean 4×2 — this exact placement fills the grid with no holes:
   - B `NdviCard`: `lg:col-start-1 lg:row-start-1 lg:col-span-1 lg:row-span-2`
   - C crop health: `lg:col-start-2 lg:row-start-1` (1×1)
   - D disease: `lg:col-start-2 lg:row-start-2` (1×1)
   - E weather: `lg:col-start-3 lg:row-start-1 lg:col-span-2` (2×1)
   - F mandi: `lg:col-start-3 lg:row-start-2 lg:col-span-2` (2×1)
   - Renumber `Reveal index={…}` props to be consecutive from 0 (they stagger the entrance animation).
4. **Move the "How it works" block** (lines 617-651, anchor `id="how"`) to directly **before** the features block (anchor `id="features"`, line 415). Straight sibling-block move; both live in the same flex column.
5. **Reorder nav anchors** to match the new page order: swap lines 248-249 so `#how` comes before `#features`.
6. Leave `landingPoweredBy` dictionary keys for Phase 3 cleanup.

**Verification checklist:**
- [ ] `cd frontend && npx next lint && npx tsc --noEmit` pass.
- [ ] `grep -n "landingPoweredBy" frontend/src/app/page.tsx` → no matches.
- [ ] `grep -n "My Fields — satellite field mapping" frontend/src/app/page.tsx` → no matches.
- [ ] `grep -n "FIELDS_TILE_IMAGE" frontend/src/app/page.tsx` → still ≥2 matches (constant + CTA usage).
- [ ] Visual: run dev server, confirm order Hero → How it works → Everything we offer → Mission → CTA; bento shows 5 cards, no gaps at `lg` width.
- [ ] `npx playwright test e2e/routing.spec.ts` passes.

**Anti-pattern guards:** don't touch `HeroMap` usage yet; don't remove dictionary keys yet; don't reflow the grid to 3 columns (E/F are 2-span and would break).

---

## Phase 2 — `LandingFieldAnalyzer` component (the new hero)

**What to implement:** new file `frontend/src/components/map/LandingFieldAnalyzer.tsx` (`"use client"`). It is a landing-sized replica of the fields-page flow — **copy the state machine from `fields/page.tsx:47-118`**, don't invent a new one.

Composition:
- Render `FieldsMap` (dynamic, `ssr: false`, loading placeholder copied from `page.tsx:11-16`) inside a fixed-height container (`h-[400px]` to match the old hero, `rounded-card-lg overflow-hidden`) with props: `fields={[]}`, `fieldGeometries={{}}`, `selectedFieldId={null}`, `onSelectField={() => {}}`, `layer` from **local** `useState<MapLayer>("satellite")` (do not use the global `useAppStore.mapLayer` — avoid leaking demo state into the app), `overlay`, `drawing={mode === "drawing"}`, `onDrawComplete`, `clearSignal`.
- **State machine** (copy `Mode` union from `fields/page.tsx:26`, add job phases): `idle → drawing → naming → saving → analyzing → done | error`.
  - `idle`: overlay card with a "Draw your field" primary button (+ one-line hint).
  - `drawing`: hint chip "Click to place points (≥3), double-click to finish" (copy text pattern `fields/page.tsx:164-167`) + Cancel (increments `clearSignal`, copy `cancelDrawing` 71-75).
  - `naming` (on `onDrawComplete`, copy `handleDrawComplete` 77-82): compact card showing estimated area (`{areaHectares} ha`) + name input (prefilled), optional district/crop inputs, "Analyze NDVI" button — mirrors `fields/page.tsx:174-190` using the same `Input`/`Button` UI components.
  - `saving/analyzing` (copy `handleSave` 92-109 + `isAnalyzing` 63-64): **before** `createField.mutateAsync`, ensure a token: `if (!isAuthenticated && !getToken()) await loginAsGuest();` (`AuthProvider.tsx:69-74`, `client.ts` `getToken`). Then create → store `activeFieldId`/`activeJobId` → `useNdviJob` polls. Show the Sentinel-2 spinner card (copy 192-198).
  - `done` (job status `"done"`): build `overlay` exactly as `fields/page.tsx:111-118` (`useField` + `useFieldNdvi` + `boundsFromGeometry`; `imageUrl` switches on layer NDVI/NDMI), default the layer toggle to `ndvi` so the heatmap is immediately visible; show NDVI/NDMI/Satellite toggle (copy 223-235) + stats card mean/min/max (copy 200-218) + a "Draw another field" reset button (resets all local state, increments `clearSignal`). Also surface a soft CTA link to `/signup` ("Save this analysis — create a free account") — no redirect, just a link.
  - `error` (guest login reject, create 4xx/5xx, or job status `"failed"`): small error card + "Try again".
- **i18n:** every visible string added via new `landingDraw*` keys in `dictionary.ts` (EN + UR mirror; EN block near line 122-132, UR near 251-261). Get `t` via `useTranslation()`.

**Documentation references:** `fields/page.tsx` (state machine, forms, spinner, toggle, stats), `FieldsMap.tsx:21-31` (props), `AuthProvider.tsx:69-74` (guest), `hooks.ts:46-56, 81-87`, `resources.ts:37-42`, `dashboard/page.tsx:105-115` (inert embed reference).

**Verification checklist:**
- [ ] `npx tsc --noEmit` passes; component compiles with zero new dependencies in `package.json`.
- [ ] `grep -n "useFields\|useFieldGeometries" frontend/src/components/map/LandingFieldAnalyzer.tsx` → no matches.
- [ ] `grep -n "loginAsGuest" …` → exactly one call site, guarded by `!isAuthenticated && !getToken()`.
- [ ] Manual (backend on :8000, frontend on :3000, real `NEXT_PUBLIC_MAP_TILES_KEY`): draw ≥3 points → area appears → analyze → spinner → NDVI heatmap PNG drapes over the polygon; NDMI toggle swaps the PNG; stats show mean/min/max; "Draw another" resets cleanly; flow works in a fresh incognito session (no prior token).
- [ ] Language toggle to Urdu: all new strings render in Urdu, RTL layout intact.

**Anti-pattern guards:** no field listing; no `useAppStore.mapLayer`/`selectedFieldId` writes; no `window.confirm`; no invented API methods (`fieldsApi.analyze` does not exist — analysis is create-field + job polling); don't copy `HeroMap`'s synthetic heatmap — the real overlay comes from `ndvi.latest.ndvi_png_url`/`ndmi_png_url`.

---

## Phase 3 — Integration + cleanup

**What to implement:**
1. In `page.tsx`: replace the `HeroMap` dynamic import (lines 11-16) with `LandingFieldAnalyzer` (same `dynamic(..., { ssr: false, loading: … })` shape, same placeholder) and swap `<HeroMap />` (line 391) for `<LandingFieldAnalyzer />`, keeping the `jk-map-in` wrapper. Keep the hero height stable (~400 px) so hero copy alignment doesn't shift.
2. Confirm `HeroMap` has no other consumers: `grep -rn "HeroMap" frontend/src` → only the old import. Then **delete `frontend/src/components/map/HeroMap.tsx`**.
3. Dictionary cleanup in `dictionary.ts`: remove `landingPoweredBy` (EN line 122, UR line 251). Verify with `grep -rn "landingPoweredBy" frontend/src` → no matches.
4. If the old hero copy/stats around the map reference the demo map ("live demo" captions etc.), update them to invite drawing (e.g. "Draw your field below — get a live Sentinel-2 analysis") via new dictionary keys.

**Verification checklist:**
- [ ] `grep -rn "HeroMap" frontend/src` → no matches; file deleted.
- [ ] `npx next lint && npx tsc --noEmit && npx next build` all pass.
- [ ] `npx playwright test` (full e2e suite) passes.

**Anti-pattern guards:** don't delete `FieldsMap.tsx` pieces or refactor its props "while here"; don't remove `landingNavHow`/`landingNavFeatures` keys.

---

## Phase 4 — Final verification

1. **Docs conformance sweep:** re-read `FieldsMap.tsx:21-31` and confirm every prop passed by `LandingFieldAnalyzer` exists in `FieldsMapProps`; confirm no calls to non-existent hooks (`grep -n "fieldsApi\." frontend/src/components/map/LandingFieldAnalyzer.tsx` → only via the sanctioned hooks, ideally zero direct calls).
2. **Anti-pattern greps** (all must return nothing):
   - `grep -rn "useFields()" frontend/src/app/page.tsx frontend/src/components/map/LandingFieldAnalyzer.tsx`
   - `grep -rn "landingPoweredBy\|HeroMap" frontend/src`
   - `grep -n "from \"@/components/map/FieldsMap\"" frontend/src/app/page.tsx` (map must be reached only through the dynamic import inside the analyzer)
3. **Full run:** `npx next build`, `npx playwright test`, then a manual end-to-end pass per Phase 2's checklist in both EN and UR, plus one pass while logged in as a real user (verify their token is NOT replaced — check `localStorage["jk_access_token"]` unchanged after analyzing).
4. **Known trade-off to note in the PR:** every landing analysis creates a real field under the shared guest account (same behavior as "Try without an account"). Optional follow-up (not in scope): delete the demo field on "Draw another field" via `useDeleteField`.
