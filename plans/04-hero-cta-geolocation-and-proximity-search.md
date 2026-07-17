# Plan 04 — Hero CTA rename, geolocation auto-center, proximity-biased search, Draw-to-expand

**Goal (4 user requirements):**
1. Rename the hero primary CTA from "Analyze your first field free" → **"Create your free account"**.
2. Clicking **"Draw your field"** on the hero map should **smoothly expand the map to the overlay** (same as pressing the expand icon), with a fade + scale-in animation.
3. On load, **ask for the visitor's location and auto-center** the map there, Google-Maps-style (graceful fallback to the current default if denied).
4. Fix location search so **nearby places surface first**. Today the geocoder searches the whole globe with no bias, so local towns/villages get buried. **Decision (confirmed with user): no hard country filter — keep global coverage but rank by proximity to the visitor.**

> ⚠️ `frontend/AGENTS.md`: this Next.js has breaking changes vs. training data — read `frontend/node_modules/next/dist/docs/` before writing code. (All changes here are in `"use client"` components touching React state / Mapbox / CSS — no server-component or data-fetching surface — so the risk is low, but honor the repo convention.)
> ⚠️ Line numbers below are as of the current working tree (post-`c044aae`, with the plan-03 geocoder/expand work already merged into the files). **Re-locate by anchor text/comment, not raw line number**, when executing.

---

## Phase 0 — Documentation discovery (COMPLETE — consolidated findings)

### What already exists (do NOT rebuild)
The geocoder search bar (item-4 surface) and the expand-to-overlay (item-2 surface) were **already built** in plan 03 and are live in the tree:
- `FieldsMap.tsx:5-8` imports `@mapbox/mapbox-gl-geocoder` + its CSS; `:54` `geocoderRef`; `:122-158` the opt-in geocoder effect gated by `showGeocoder`. **The geocoder is constructed with NO proximity/countries options (`:126-133`) — that is exactly why search "looks across the globe".**
- `LandingFieldAnalyzer.tsx:58` `const [expanded, setExpanded] = useState(false)`; `:92-99` an Escape-key close handler; `:182-197` the container that swaps between an inline `h-[400px]` box and a `fixed inset-0 z-[100]` overlay; `:225-239` the expand/collapse icon button. **The expand is an instant className swap — no transition (the "not smooth" the user noticed).**
- `FieldsMap.tsx:97-98` a `ResizeObserver` already calls `map.resize()` on container box changes, so the map canvas repaints correctly when the overlay opens. **No new resize wiring needed.**

### Verified APIs (read from the INSTALLED type defs — not assumed, not from newer online docs)
**Geocoder — `@mapbox/mapbox-gl-geocoder@5.1.2`**, `node_modules/@types/mapbox__mapbox-gl-geocoder/index.d.ts`:
- `proximity?: LngLatLiteral | "ip"` (`:60`) — bias ranking toward a point, **or the string `"ip"`** for a zero-permission rough-location bias.
- `trackProximity?: boolean` (`:65`) — "geocoder proximity will automatically update based on the map view". So once the map recenters on the user, search bias follows for free.
- `setProximity(proximity, disableTrackProximity?)` (`:292`) — `disableTrackProximity` **defaults to `true`**; pass **`false`** to keep tracking active after an explicit set.
- Also available but **not used** per the user's "global" choice: `countries?: string` (`:98`), `bbox?: Bbox` (`:85`). `types?: string` (`:94`) and `language?: string` (`:114`) are optional refinements noted below.
- `autocomplete` and `fuzzyMatch` default to `true` in this library — no need to set them.

**GeolocateControl — `mapbox-gl@3.26.0`**, `node_modules/mapbox-gl/dist/mapbox-gl.d.ts`:
- `GeolocateControlOptions` (`:25730`): `positionOptions`, `trackUserLocation` (default `false`), `showUserLocation` (default `true`), `showButton` (default `true`).
- `trigger(): void` (`:9328`) — programmatically start geolocation (the auto-prompt).
- `"geolocate"` event → **`GeolocationPosition`** (`:25744`) — the standard browser type; read `.coords.longitude` / `.coords.latitude`.
- Docs example (`:25783-25799`) confirms the `new mapboxgl.GeolocateControl({...})` → `map.addControl(...)` → `geolocate.trigger()` pattern.

### Existing conventions to COPY (don't invent)
- **Opt-in prop pattern** for hero-only map features: `showGeocoder?: boolean` on `FieldsMapProps` (`FieldsMap.tsx:33-35`), passed only by the landing hero, absent on `/fields` & `/dashboard`. The new geolocation is added the **same way** (`autoLocate?: boolean`).
- **Animation convention** (`globals.css`): every keyframe (`jkFadeUp :113`, `jkMapEntrance :190`) uses easing `cubic-bezier(0.2, 0.8, 0.3, 1)`; `.jk-map-in` (`:200-208`) is the map's own entrance. A `@media (prefers-reduced-motion: reduce)` block exists at `:221` and **must** be extended for any new animation.
- **Control placement**: `map.addControl(nav, "top-left")` (`FieldsMap.tsx:73`); the geocoder is re-inserted into the same `top-left` corner (`:140-143`). The GeolocateControl goes in the same corner.
- **i18n**: two-block dictionary, `en:` at `dictionary.ts:8`, `ur:` at `:206`; every user-facing string has a key in both. `landingCtaPrimary` lives at `:116` (en) / `:305` (ur).

### Anti-patterns / constraints
- ❌ Do **not** add `countries`/`bbox` to the geocoder — the user explicitly chose global coverage with proximity ranking, not a country lockdown.
- ❌ Do **not** pass `autoLocate` / geolocation to `/fields` or `/dashboard` — hero-only, following the `showGeocoder` precedent.
- ❌ Do **not** mount a second map for the overlay or remount `FieldsMap` on expand — it's one persistent instance (the container just resizes). Adding GeolocateControl once at init is therefore correct and persists across expand/collapse.
- ❌ Do **not** CSS-transition `position: relative ↔ fixed` or the width/height (unanimatable / janky) — animate the inner panel's `opacity` + `transform: scale()` only (transform-only = no layout thrash, won't fight the map canvas).
- ❌ Do **not** skip the `prefers-reduced-motion` guard for the new keyframe.
- ❌ Do **not** hide the GeolocateControl button (`showButton` stays default-true) — it's the fallback when a browser blocks the auto-`trigger()` prompt.

---

## Phase 1 — Hero CTA rename (item 1)

**What to implement** — dictionary strings only; the CTA already links to `/signup` (`page.tsx:363-368`), which is semantically correct for "Create your free account", so **no `page.tsx` change**.
- `dictionary.ts:116` (en): `landingCtaPrimary: "Analyze your first field free"` → `landingCtaPrimary: "Create your free account"`.
- `dictionary.ts:305` (ur): `landingCtaPrimary: "اپنا پہلا کھیت مفت تجزیہ کریں"` → `landingCtaPrimary: "اپنا مفت اکاؤنٹ بنائیں"` (= "Create your free account").

**Note:** a separate `createYourAccount: "Create your account"` key already exists (`:26`/`:222`, used by the nav sign-up button). The hero CTA intentionally reads "Create your **free** account" (keeps the "free" value-prop the old copy carried) — distinct from the plain nav label, no conflict.

**Documentation references:** `page.tsx:363-368` (CTA link, unchanged), `dictionary.ts:116,305` (the two strings to edit).

**Verification checklist:**
- [ ] `grep -rn "Analyze your first field" frontend/src` → no matches.
- [ ] `grep -n "landingCtaPrimary" frontend/src/lib/i18n/dictionary.ts` → both en/ur show the new copy.
- [ ] `landingCtaSecondary` and the `href="/signup"` are untouched.
- [ ] No e2e breakage — already confirmed no test asserts the old string.

**Anti-pattern guards:** don't reuse the existing `createYourAccount` key (different button); don't change the link target; don't drop the Urdu translation.

---

## Phase 2 — Location awareness: auto-center + proximity-biased search (items 3 + 4)

These are one coupled feature — geolocation recenters the map on the visitor, and that recenter (plus the `geolocate` event) becomes the search bias.

**What to implement — all in `FieldsMap.tsx`:**

**A. Proximity-bias the geocoder (item 4).** In the geocoder constructor (`:126-133`), add:
```ts
const geocoder = new MapboxGeocoder({
  accessToken: MAPBOX_TOKEN,
  mapboxgl: mapboxgl as unknown as MapboxGeocoder.GeocoderOptions["mapboxgl"],
  marker: false,
  placeholder: geocoderPlaceholder,
  proximity: "ip",       // immediate rough-location bias, no permission needed
  trackProximity: true,  // as the map recenters (geolocation) or pans, bias follows — nearby results rank first
  // NO `countries` — global coverage, proximity ranking only (per user choice)
});
```
*(Optional refinement, note only: pass a `geocoderLanguage?: string` prop from the hero = current UI lang → `language:` for localized result labels. Not required for the core fix.)*

**B. GeolocateControl auto-center (item 3).**
1. Add `autoLocate?: boolean` to `FieldsMapProps` (next to `showGeocoder`, `:33-35`) and to the destructure (`:48-49`). Add `const geolocateRef = useRef<mapboxgl.GeolocateControl | null>(null);` beside `geocoderRef` (`:54`).
2. Inside the **once**-init effect, right after the nav control is added (`:72-74`), when `autoLocate`:
```ts
if (autoLocate) {
  const geolocate = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true, timeout: 8000 },
    trackUserLocation: false,
    showUserLocation: true,
  });
  map.addControl(geolocate, "top-left");
  geolocateRef.current = geolocate;
  // Feed the located point into the geocoder so search biases to the visitor.
  // `false` = keep trackProximity active (don't let this one-shot set disable it).
  geolocate.on("geolocate", (pos: GeolocationPosition) => {
    geocoderRef.current?.setProximity(
      { longitude: pos.coords.longitude, latitude: pos.coords.latitude },
      false,
    );
  });
  // Google-Maps-style: auto-prompt + fly on first load. `load` hasn't fired yet
  // here (we're in the synchronous init), so attaching the listener is correct.
  map.on("load", () => geolocate.trigger());
}
```
3. `LandingFieldAnalyzer.tsx`: pass `autoLocate` (constant `true`) on the `<FieldsMap>` (`:198-210`), alongside the existing `showGeocoder` / `geocoderPlaceholder` props.

**Graceful failure / edge cases (call out, don't over-engineer):**
- Denied / errored geolocation → the map simply stays at `DEFAULT_CENTER` (Faisalabad, `:15`). GeolocateControl renders its own denied state; nothing to add.
- Auto-`trigger()` requires a **secure context** (HTTPS or localhost). Some browsers gate the prompt behind a user gesture; if the auto-trigger is blocked, the **visible GeolocateControl button is the fallback** (hence `showButton` left default-true).
- The geocoder mounts in a *separate* effect (gated by `showGeocoder`); the `geolocate` handler null-checks `geocoderRef.current?`, and `proximity:"ip"` + `trackProximity:true` cover the window before it mounts. No ordering bug.

**Documentation references:** `FieldsMap.tsx:126-133` (geocoder ctor), `:72-74` (nav-control add site / init effect), `:33-35,48-49,54` (props/refs), `LandingFieldAnalyzer.tsx:198-210` (`<FieldsMap>` usage). Types: geocoder `index.d.ts:60,65,292`; mapbox-gl `mapbox-gl.d.ts:9328,25730,25744`.

**Verification checklist:**
- [ ] `grep -n "proximity" frontend/src/components/map/FieldsMap.tsx` → `proximity: "ip"` + `trackProximity: true` present; **no** `countries`/`bbox`.
- [ ] `grep -n "GeolocateControl\|autoLocate" frontend/src/components/map/FieldsMap.tsx` → present and gated by `autoLocate`.
- [ ] `grep -rn "autoLocate" frontend/src/app/\(app\)/fields/page.tsx frontend/src/app/\(app\)/dashboard/page.tsx` → no matches (hero-only).
- [ ] Manual: load hero → browser location prompt appears → **Allow** flies the map to the visitor's area; **Block** leaves it at Faisalabad with no console error and a clickable locate button.
- [ ] Manual: after allowing, type a nearby town/village → it now appears near the top of suggestions (proximity ranking); selecting one flies there and drawing still works.
- [ ] `npx tsc --noEmit` clean (the `GeolocationPosition` param + `setProximity` signature type-check against the installed defs).

**Anti-pattern guards:** `marker: false` stays; no `countries`; `autoLocate` never passed to `/fields`/`/dashboard`; don't set `trackUserLocation: true` (continuous recentre fights manual panning — a one-shot center is what "like Google Maps on load" means here).

---

## Phase 3 — Draw-to-expand with fade + scale animation (item 2)

**What to implement:**

**A. Wire the Draw button to open the overlay** — `LandingFieldAnalyzer.tsx`:
- `startDrawing()` (`:101-105`): add `setExpanded(true);` so "Draw your field" (`landingDrawCta`, the button at `:246`) enters drawing mode **and** expands. More canvas to draw on — good UX.
- `reset()` (`:107-134`): add `setExpanded(false);` so Cancel / "draw again" returns to the inline hero. (Design decision: stay expanded through naming → analyzing → results; the user closes via the collapse icon / Escape / backdrop, all already wired. Only `reset` auto-collapses.)

**B. Fade + scale-in animation (the "smooth" part).**
1. `globals.css` — add near `jkMapEntrance` (`:190`), same easing:
```css
@keyframes jkOverlayIn {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}
.jk-overlay-in { animation: jkOverlayIn 0.28s cubic-bezier(0.2, 0.8, 0.3, 1) both; }

@keyframes jkBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.jk-backdrop-in { animation: jkBackdropIn 0.2s ease both; }
```
2. Extend the existing `@media (prefers-reduced-motion: reduce)` block (`:221`) to add `.jk-overlay-in, .jk-backdrop-in { animation: none; }` (mandatory a11y; matches how the block already neutralizes the other keyframes).
3. `LandingFieldAnalyzer.tsx` — in the `expanded` branch only (`:182-197`): add `jk-backdrop-in` to the `fixed inset-0` backdrop div (`:185`) and `jk-overlay-in` to the inner panel div (`:193`). Non-expanded branch unchanged.

**Why transform-only:** `transform: scale()` is a visual transform, not a layout change — it won't retrigger the map's `ResizeObserver` mid-animation. The class swap from `h-[400px]` → `h-[85vh] w-[90vw]` is the real box change that fires `map.resize()` once (existing behavior); the scale just animates on top. The canvas may look slightly soft for ~0.28s and snaps crisp at rest — standard and acceptable.

**Scope note (exit animation):** on close the overlay unmounts instantly, matching the existing ledger-modal precedent (no exit animation). The user's ask was specifically about the *expand* (open) being smooth. A close animation would need an unmount-delay state machine — **out of scope** unless requested.

**Documentation references:** `LandingFieldAnalyzer.tsx:101-105` (startDrawing), `:107-134` (reset), `:182-197` (overlay container), `:225-239` (expand icon, unchanged); `globals.css:190-208` (model keyframe), `:221` (reduced-motion block).

**Verification checklist:**
- [ ] `grep -n "setExpanded(true)" frontend/src/components/map/LandingFieldAnalyzer.tsx` → appears in `startDrawing`; `grep -n "setExpanded(false)" ...` → appears in `reset`.
- [ ] `grep -n "jkOverlayIn\|jk-overlay-in" frontend/src/app/globals.css` → present, and inside the `prefers-reduced-motion` block too.
- [ ] Manual: click **"Draw your field"** → overlay **fades + scales** open, draw mode active inside; finish polygon → naming card shows in the expanded view; **Cancel** collapses to inline; **Escape** / **backdrop click** / **collapse icon** all still close.
- [ ] Manual (reduced motion on): overlay opens with no animation, no layout jump.
- [ ] Map canvas fills the expanded overlay correctly (ResizeObserver fired) — no grey/half-rendered tiles.

**Anti-pattern guards:** transform/opacity only (no width/height/position transition); keep the reduced-motion guard; don't add an exit-animation state machine; don't remove the existing Escape/backdrop close paths.

---

## Phase 4 — Final verification

1. `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx playwright test` — all clean. (Lint command per `agri_local_env_quirks` memory if the bare command misbehaves.)
2. Manual pass, **both languages** (`EN` + `اردو` via the `LangToggle`):
   - Hero CTA reads "Create your free account" / "اپنا مفت اکاؤنٹ بنائیں" and links to `/signup`.
   - Load → location prompt → Allow centers on the visitor; Block stays at Faisalabad cleanly.
   - Nearby-place search surfaces local results first; fly-to + draw + analyze flow (from prior hardening) still intact end-to-end.
   - "Draw your field" fade+scale-expands; expand icon / Escape / backdrop / Cancel behave.
3. Responsive at 375 / 768 / 1024 / 1440 px — the geocoder input, GeolocateControl button, and the expand overlay all usable on mobile (Mapbox's geocoder box can be wide; verify it doesn't overflow the small-screen hero).
4. Regression: `/fields` and `/dashboard` unchanged — no geocoder, no locate control, no auto-prompt (grep confirms neither `showGeocoder` nor `autoLocate` is passed there).

---

## Summary of files touched
| File | Change | Phase |
|---|---|---|
| `frontend/src/lib/i18n/dictionary.ts` | `landingCtaPrimary` en+ur → "Create your free account" | 1 |
| `frontend/src/components/map/FieldsMap.tsx` | geocoder `proximity`/`trackProximity`; `autoLocate` prop + GeolocateControl + `geolocate`→`setProximity` | 2 |
| `frontend/src/components/map/LandingFieldAnalyzer.tsx` | pass `autoLocate`; `setExpanded` in `startDrawing`/`reset`; `jk-overlay-in`/`jk-backdrop-in` classes | 2, 3 |
| `frontend/src/app/globals.css` | `jkOverlayIn`/`jkBackdropIn` keyframes + reduced-motion guard | 3 |

No new dependencies (both Mapbox packages already installed). No backend changes.

---

## Followups (implemented 2026-07-17, second pass)

**User feedback:** search still weak; locate button should sit beneath the expand button (top-right); overlay opening still not smooth.

1. **Search (diagnosed with live API comparisons):** proximity ranking was already working — the real issues were (a) near-identical cross-border Punjab names ("Jaranwala" → Jaipur India at #2) and (b) small localities (bastis/chaks) missing from Mapbox's dataset entirely. Fixes: `countries: "pk"` (delete one line to revert to global), plus an `externalGeocoder` (verified in installed types, `index.d.ts:125`) wired to Photon/OSM (`photonSupplement()` in `FieldsMap.tsx`) — settlement-type results only, PK-filtered, biased to map center, fail-silent. Verified: "Basti Malook" → بستی ملوک، پنجاب (absent from Mapbox), zero India/Nepal results, `country=pk` + `proximity` on the wire.
2. **Locate button placement:** `showButton: false` on GeolocateControl (hides via `display:none` — element stays in DOM) + new `locateSignal?: number` counter prop (clearSignal pattern) + custom crosshair button in the hero's top-right cluster, stacked under the expand button with identical styling. New i18n key `landingLocateAria` (en/ur).
3. **Overlay smoothness:** root cause was layout, not easing — going `position: fixed` removed the map's box from the hero column, visibly reflowing the page behind the translucent backdrop. Fixed with a permanent `h-[400px]` placeholder wrapper (`display: contents` middle div when collapsed); animation tuned to 0.32s / scale(0.93), backdrop 0.25s. Verified: hero `h1` bounding box identical before/during expansion.

All followups verified: tsc/lint clean, e2e 6/6, 19/19 browser-driven checks.
