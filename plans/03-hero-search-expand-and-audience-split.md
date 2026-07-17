# Plan 03 — Hero location search + expand overlay, and "For Farmers / For Breeders" split

**Goal (3 user requirements):**
1. Add a location search bar to the hero map so a visitor can search any location and draw a field there.
2. Add an expand affordance on the hero map — clicking it opens the map enlarged in an overlay.
3. Restructure "Everything we offer" into two categories: **For Farmers** (existing 5 cards + new **Drone Surveying** + **Drone Spraying**) and **For Breeders** (new **High Throughput Phenotyping** + **Genomic Selection**).

**Deliverable requested for this cycle:** 3 PNG design mockups (via `ui-ux-pro-max`) of the restructured page for the user to pick a direction from, before any application code changes.

> ⚠️ `frontend/AGENTS.md`: this Next.js has breaking changes vs. training data — read `frontend/node_modules/next/dist/docs/` before writing code in later phases.
> ⚠️ Line numbers below are as of commit `c044aae`. Re-locate by anchor text/comments in later phases, not raw numbers.

---

## Phase 0 — Documentation discovery (COMPLETE — consolidated findings)

### ui-ux-pro-max guidance actually used
Ran `--design-system` first; its generic output (blue/amber "Data-Dense Dashboard") was **rejected** — this product already has an established, working forest-green agri brand (`--color-forest-900: #1b4332`, `--color-mint-300: #95d5b2`, `--color-cream-bg: #f6f4ed`, etc., `frontend/src/app/globals.css:5-34`) that a generic dashboard palette would clash with. Only structural/UX findings were kept:
- `--domain product "SaaS multiple personas agriculture biotech"`: **Agriculture/Farm Tech** → *Organic Biophilic + Flat Design*, *Feature-Rich Showcase + Trust*, palette focus *Earth Green + Brown + Sky Blue* — matches the **existing** brand almost exactly → **Farmers category keeps current visual treatment, no restyle**.
- Same query, **Biotech/Life Sciences** → *Glassmorphism + Clean Science*, *Storytelling-Driven + Research*, palette focus *Sterile White + DNA Blue + Life Green* → grounds a **deliberately distinct but restrained accent** (cool blue tint) for the **Breeders** category so the two audiences read as different without a jarring re-brand.
- `--domain landing "dual audience segments toggle categorized feature grid"`: confirms *Bento Grid Showcase* and *Feature-Rich Showcase* are validated patterns for this exact page (already in use) — no CSV precedent specifically for a two-persona split, so the 3 mockups below are reasoned syntheses of validated primitives, not invented.
- Quick Reference (loaded from `SKILL.md`, always in context): `escape-routes` (CRITICAL a11y — modals need a close path), `blur-purpose` (blur signals dismissal, not decoration), `modal-motion` (animate from trigger), `touch-target-size` (44×44 min), `color-not-only` (don't rely on color alone to distinguish categories — use labels/icons too), `fade-crossfade` (content-swap transitions).
- `--domain ux "search input autocomplete loading debounce"`: `Autocomplete` (show predictions as typed, not full-Enter-required), `Input Affordance` (visible border/background, not borderless), `No Results` (show guidance, not a blank state).

### Geocoder API (verified via GitHub `mapbox/mapbox-gl-geocoder` API.md — not assumed)
Package: **`@mapbox/mapbox-gl-geocoder`** (+ `@types/mapbox__mapbox-gl-geocoder` for TS). Not currently a dependency (`frontend/package.json` has `mapbox-gl` + `@mapbox/mapbox-gl-draw` only — confirmed via `grep -rli geocod frontend` → zero hits).
- Constructor: `new MapboxGeocoder({ accessToken, mapboxgl, marker: false, flyTo: true, zoom, language, bbox, placeholder, proximity, autocomplete: true, fuzzyMatch: true })`.
- Attach: `map.addControl(geocoder)` — **identical existing pattern** to `map.addControl(new mapboxgl.NavigationControl({...}), "top-left")` at `frontend/src/components/map/FieldsMap.tsx:63`.
- Events via `.on(name, cb)`: `"clear"` (no payload), `"loading"` → `{ query }`, `"results"` → `{ results }`, `"result"` → `{ result }` (has `.center: [lon, lat]` and `.bbox`), `"error"` → `{ error }`.
- `marker: false` is required — a pin marker would conflict with the draw workflow (the point is to *navigate* there, then draw a polygon, not drop a pin).

### Existing overlay/modal precedent (copy this, don't invent a new pattern)
`frontend/src/app/(app)/ledger/page.tsx:165-172`:
```
{reportOpen && (
  <div className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-6" onClick={() => setReportOpen(false)}>
    <div onClick={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-[520px] max-w-full flex-col gap-3.5 overflow-auto rounded-2xl bg-white p-7 shadow-[0_24px_60px_rgba(0,0,0,.3)]">
      ...
    </div>
  </div>
)}
```
Plain conditional-render div, no library, backdrop-click-to-close via `onClick` + inner `stopPropagation`. **Gap found**: no Escape-key handler in this precedent. Per ui-ux-pro-max's CRITICAL `escape-routes` rule, the new map-expand overlay should add one — a well-justified small improvement, not scope creep.

### z-index scale already in use (follow it, don't invent new values)
`z-50` — sticky nav (`page.tsx:204`). `z-[60]` — TopBar dropdowns (`components/layout/TopBar.tsx:36,80`, app-shell only, not on landing page). `z-[100]` — the ledger fullscreen modal. → **the map-expand overlay should use `z-[100]`**, consistent with the existing "modal" tier.

### Reusable UI primitives (`frontend/src/components/ui/`)
`Button.tsx`, `Card.tsx`, `HealthGauge.tsx`, `Input.tsx`, `Logo.tsx`, `Reveal.tsx`, `Toggle.tsx`.
- `Toggle.tsx` is a **boolean on/off switch** (settings-style, no labels) — **not** a fit for a named Farmers/Breeders switcher.
- The **actual right copy-source** for a segmented switch is `LangToggle` at `frontend/src/app/page.tsx:14-32` — a two-button pill (`EN | اردو`) with the exact "flex overflow-hidden rounded-lg border" pattern needed for a "For Farmers | For Breeders" toggle (Design Option A below).
- The current bento cards do **not** use the shared `Card.tsx` — they use a page-local `CardSheen` wrapper (`page.tsx:159-167`, cursor-tracking hover sheen). New cards (Drone Surveying, Drone Spraying, Phenotyping, Genomic Selection) should follow `CardSheen`, not `Card.tsx`, for visual consistency with the rest of the section.

### Current "Everything we offer" state (fresh read, `frontend/src/app/page.tsx:418-588`)
5 cards in a `grid-cols-1 lg:grid-cols-4 lg:auto-rows-[172px]` bento (`page.tsx:432`): NdviCard (1×2), Crop health (1×1), Disease scanner (1×1), Weather (2×1), Mandi prices (2×1) — all i18n'd (`landingCardHealthTitle` etc., `dictionary.ts`). Icons are hand-drawn inline SVG, `viewBox="0 0 15 15"`, stroke-based (~1.4–1.5 width), no emoji — new cards' icons must match this style (ui-ux-pro-max CRITICAL: `no-emoji-icons`).

### Current hero state (`LandingFieldAnalyzer.tsx`, fully re-read — unchanged since last session's hardening work)
400px-tall rounded container; `FieldsMap` dynamic-imported `ssr:false`; bottom-left floating control card (idle/drawing/naming/analyzing/timeout/failed/results states); top-right layer toggle only appears once `showResults`. The search bar and expand button both need to coexist with this existing floating-card real estate without overlapping it — **search bar → top-left** (Mapbox's own geocoder default position, mirrors `NavigationControl`'s existing top-left slot in `FieldsMap.tsx:63`, so the two controls should be visually stacked, not colliding), **expand button → top-right**, above/beside where the layer toggle appears later.

### Anti-patterns / constraints
- ❌ No new modal/dialog library — copy the existing plain-div pattern from `ledger/page.tsx`.
- ❌ No native `<dialog>` element — would diverge from the codebase's established (if imperfect) overlay convention; improve it in-place (add Escape) instead of replacing it with a different primitive.
- ❌ Don't add the geocoder to `FieldsMap.tsx` unconditionally — `/fields` and `/dashboard` didn't ask for it. Gate it behind an opt-in prop (e.g. `showGeocoder?: boolean`), following the existing opt-in-boolean-prop convention already used for `drawing`/`clearSignal`.
- ❌ Don't touch `/fields` or `/dashboard` pages in Phases 2–3 — hero-only asks.
- ❌ Don't reuse `Toggle.tsx` for the audience switcher — wrong widget (boolean, unlabeled). Copy `LangToggle` instead.
- ❌ No emoji icons for the 4 new cards — hand-drawn SVG matching existing bento icon style.
- ❌ Don't invent a new z-index tier — reuse `z-[100]`.
- ❌ Don't let the generic `--design-system` blue/amber output leak into the mockups — brand colors are fixed (`globals.css:5-34`); only structural guidance from ui-ux-pro-max applies here.

### Verified design tokens for mockups (real values, not approximated)
Colors: `forest-900 #1b4332`, `forest-700 #2d6a4f`, `forest-500 #40916c`, `mint-300 #95d5b2`, `mint-100 #eaf3ec`, `cream-bg #f6f4ed`, `cream-card #fdfcf9`, `cream-inset #f1eee3`, `border #e7e3d6`, `ink-900 #1e2b23`, `ink-500 #6b7a6f`, `ink-400 #8a927f`, `info-blue #4e8dbf` / `info-blue-bg #e7f0f7` / `info-blue-text #3a719b` (candidate accent for the Breeders "science" tint — already exists in the palette, no new color needed). Fonts: `--font-sans: Inter`, `--font-display: Besley` (headings, EN only; Urdu uses Noto Nastaliq Urdu via `lang="ur"`).

---

## Phase 1 — Generate 3 design mockups (PNG) — EXECUTING NOW

**What to build:** 3 self-contained static HTML files (not wired into the Next.js app — pure visual mockups), each showing the hero (with search bar + expand button, which look the same across all 3 — those two features are low-ambiguity, standard patterns) and the restructured features section in one of 3 distinct layout directions. Styled with the verified tokens above, not invented colors.

**Design A — Segmented Toggle** (copy `LangToggle` pill pattern from `page.tsx:14-32`): one "For Farmers | For Breeders" pill switch beside the section header; only one audience's grid shows at a time (default: Farmers); Breeders grid uses the `info-blue` accent tint on icons/borders per the Biotech-style finding.

**Design B — Two Stacked Sections** (always both visible): "For Farmers" eyebrow + full 7-card bento grid in the current earth-green style; below it, "For Breeders" eyebrow + a 2-card row with the `info-blue` accent treatment, sized as a wider feature-pair rather than cramming 2 cards into a 4-col grid built for 7.

**Design C — Unified Grid + Audience Pills**: one continuous 9-card bento grid (closest to current visual weight), a filter chip row above ("All · For Farmers · For Breeders"), and a small audience-badge pill in each card's corner. Least structural change, most subtle categorization.

**Documentation references:** `page.tsx:418-588` (current bento structure to extend), `page.tsx:14-32` (LangToggle, copy for Design A), `page.tsx:159-167` (CardSheen, copy for all new cards' wrapper), `globals.css:5-34,69-70` (tokens), `ledger/page.tsx:165-172` (unused in this phase, needed later for Phase 3).

**Verification checklist:**
- [ ] All 3 HTML files render with zero external network requests (self-contained, per Artifact/offline-safe habits already used this session).
- [ ] Colors match `globals.css` values exactly — no invented hex codes.
- [ ] No emoji icons anywhere in the mockups.
- [ ] Each PNG is full-page (hero through the bottom of the features section) at a desktop width (1440px, matching prior session's screenshot convention).

**Anti-pattern guards:** don't wire these into the real Next.js app; don't touch `frontend/src/**` in this phase; don't pick a "winner" — present all 3 neutrally for the user to choose.

---

## Phase 2 — Location search bar (map, opt-in)

**What to implement:**
1. `npm install @mapbox/mapbox-gl-geocoder @types/mapbox__mapbox-gl-geocoder` (new deps — legitimate here, no existing capability covers geocoding).
2. `FieldsMap.tsx`: add `showGeocoder?: boolean` to `FieldsMapProps` (default `false`/undefined — `/fields` and `/dashboard` unaffected). Inside the map-init effect (near `map.addControl(new mapboxgl.NavigationControl(...))`, `FieldsMap.tsx:63`), conditionally construct `new MapboxGeocoder({ accessToken: MAPBOX_TOKEN, mapboxgl, marker: false, flyTo: true, placeholder: <i18n string> })` and `map.addControl(geocoder, "top-left")` when `showGeocoder` is true. Import `@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css` alongside the existing `mapbox-gl.css`/`mapbox-gl-draw.css` imports (`FieldsMap.tsx:5-6`).
3. `LandingFieldAnalyzer.tsx`: pass `showGeocoder` (true only in `idle`/`drawing` modes — hide it once a field is being analyzed/shown, matching how the layer toggle already only appears in `showResults`).
4. Add a `placeholder` i18n key (EN + UR) for the geocoder input — same dictionary pattern as all `landingDraw*` keys already added.

**Verification checklist:**
- [ ] `grep -n "showGeocoder" frontend/src/app/\(app\)/fields/page.tsx frontend/src/app/\(app\)/dashboard/page.tsx` → no matches (prop not passed, feature off by default elsewhere).
- [ ] Manual: type a Pakistani city/town name in the hero search box, confirm autocomplete suggestions appear (per ui-ux-pro-max `Autocomplete` rule) and selecting one flies the map there; then confirm drawing still works normally afterward.
- [ ] Urdu pass: geocoder placeholder renders in Urdu; RTL doesn't break the control's position (Mapbox controls are LTR-positioned by CSS convention — verify visually, may need a manual `left`/`right` override under `dir="rtl"`).

**Anti-pattern guards:** `marker: false` always (no pin-drop conflicting with draw mode); don't make this the default for all `FieldsMap` consumers.

---

## Phase 3 — Expand-to-overlay for the hero map

**What to implement:**
1. `LandingFieldAnalyzer.tsx`: add local `const [expanded, setExpanded] = useState(false)`.
2. Add an icon-button (SVG expand/maximize glyph, `aria-label` per ui-ux-pro-max `aria-labels` CRITICAL rule) positioned top-right of the map container (opposite corner from the geocoder).
3. Copy the overlay pattern from `ledger/page.tsx:165-172` verbatim in structure: `{expanded && (<div className="fixed inset-0 z-[100] ..." onClick={() => setExpanded(false)}><div onClick={stopPropagation} className="...">` — but sized to something like `w-[90vw] h-[85vh] max-w-[1400px]` instead of the ledger's fixed `520px` (this is a map, not a report card), and render the **same** `<FieldsMap>` instance's props inside (same `mapFields`/`overlay`/`drawing` state — the expanded view is the same live map, larger, not a second independent map instance).
4. **Add Escape-key close** (the gap identified in Phase 0): a `useEffect` that adds a `keydown` listener for `"Escape"` while `expanded` is true, calling `setExpanded(false)`, cleaned up on unmount/close — justified by ui-ux-pro-max's CRITICAL `escape-routes` rule.
5. Add EN+UR i18n keys for the expand button's `aria-label`/tooltip.

**Verification checklist:**
- [ ] `grep -n "fixed inset-0 z-\[100\]" frontend/src/components/map/LandingFieldAnalyzer.tsx` → present.
- [ ] Manual: click expand → map enlarges in overlay, draw/search/analyze still work inside it; click backdrop → closes; press Escape → closes; click the inner panel itself → does NOT close (stopPropagation working).
- [ ] No duplicate `FieldsMap`/Mapbox instance created for the overlay (would double-charge tile requests and desync draw state) — confirm via one shared component tree, not two `<FieldsMap>` mounts.

**Anti-pattern guards:** don't mount a second independent map; don't skip the Escape handler; don't introduce a new z-index value.

---

## Phase 4 — "For Farmers" / "For Breeders" restructuring (FINALIZED: Design D — tinted partitions + scroll arrow)

Design selected and refined across two mockup rounds (`plans/design-mockups-03/design-d-final.png`). Replaces the entire old bento grid (`NdviCard` + 5 wide cards) with two "partition" containers, each holding a horizontally-scrollable row of compact cards (icon + heading + one-line description only — no wide layouts, no inline demo widgets).

**Content (final):**
- **For Farmers** (6 cards, was 7 — NDVI/NDMI overlay card folded into Crop health): Crop health & yield (desc now covers NDVI/NDMI + moisture: *"NDVI/NDMI vegetation & moisture maps · 74% healthy"*), Leaf disease scanner, Weather & pest warnings, Real-time mandi prices, Drone surveying, Drone spraying.
- **For Breeders** (2 cards): High Throughput Phenotyping, Genomic Selection.
- Section title changes from "One platform, from soil to sale" → **"Where the field meets the genome"**; subcopy → **"Everyday tools for growers, research-grade tools for breeders — built on one shared satellite and genomic data pipeline."**

**Color correction (from mockup feedback):** the Breeders partition initially used the existing `info-blue` tokens and looked visually disconnected from the rest of the palette. Final treatment keeps Breeders entirely inside the green/cream family, differentiated from Farmers by *depth*, not hue: Farmers = light mint wash (`linear-gradient(180deg, #eef5f0, #f3f7f0)`, border `#d9e8dd`, tag solid `forest-700 #2d6a4f`); Breeders = a deeper sage wash (`linear-gradient(180deg, #e7efe4, #eef3ea)`, border `#cfe0d1`, tag solid `forest-900 #1b4332`), card icon backgrounds `#dcebe1` with `forest-900` stroke icons. This also satisfies ui-ux-pro-max's `color-not-only` rule better than the original — the two audiences are now distinguished by tag color/label/heading, not by asking a single hue swap to carry the whole distinction.

**What to implement:**
1. Delete the old `NdviCard` function (`page.tsx:256-309`) and the entire 5-card bento grid + its wrapping `<div className="grid ...">` (`page.tsx:432-567`, everything between the section header `Reveal` and the ledger-banner `Reveal`). The ledger banner (`page.tsx:569-587`, "Digital farm ledger & PDF reports") is **not** part of this restructuring and stays as-is, positioned after the two new partitions.
2. New component `FeatureRow` (co-located in `page.tsx` or a new `frontend/src/components/ui/FeatureRow.tsx` — prefer the latter since it's a reusable, self-contained interactive unit): props `{ variant: "farmers" | "breeders"; tag: string; heading: string; count: string; cards: { icon: ReactNode; title: string; desc: string }[] }`.
   - Renders the tinted rounded partition (`rounded-[26px]`), header row (tag pill + `<h3>` + count, matching `page.tsx`'s existing heading typography conventions), and a `overflow-x-auto` flex row of fixed-width (`w-[208px] h-[168px]`) cards — plain CSS scroll, no carousel library (native `overflow-x: auto` + `scrollBy` is sufficient, matches the project's minimal-dependency pattern already established for the modal/geocoder choices in Phases 2-3).
   - Arrow button: `<button onClick={() => rowRef.current?.scrollBy({ left: 320, behavior: "smooth" })}>`. Use a `ref` + a `scroll` event listener to compute whether `scrollWidth > clientWidth + scrollLeft` and only render the arrow button while more content remains off-screen to the right (matches `disabled-states`/`state-clarity` — never show a control that does nothing). The Breeders row (2 cards, no overflow at desktop width) naturally never shows the arrow.
   - Card icons: reuse the exact hand-drawn SVG icon style/paths already established in the old bento cards (`page.tsx`'s disease/weather/mandi icons) for Leaf disease scanner, Weather, Mandi; new SVG icons needed for Crop health (existing conic-gradient gauge swatch, shrunk to 24px), Drone surveying, Drone spraying, High Throughput Phenotyping, Genomic Selection — simple stroke-based `viewBox="0 0 15 15"` glyphs matching the established icon language (see the mockup HTML in `plans/design-mockups-03/` for exact paths to copy).
3. Dictionary changes in `dictionary.ts` (EN+UR) — **update in place** (no "compact" key duplication):
   - `landingFeaturesTitle` → "Where the field meets the genome"
   - `landingFeaturesSubcopy` → "Everyday tools for growers, research-grade tools for breeders — built on one shared satellite and genomic data pipeline."
   - `landingCardWeatherDesc` → shorten to "7-day agromet forecast + outbreak risk." (was too long for the 2-line-clamp compact card)
   - New: `landingCardHealthCompactDesc`, `landingCardMandiDesc`, `landingCardDroneSurveyTitle`/`Desc`, `landingCardDroneSprayTitle`/`Desc`, `landingCardPhenotypingTitle`/`Desc`, `landingCardGenomicTitle`/`Desc`, `landingAudienceFarmersTag`/`Heading`/`Count`, `landingAudienceBreedersTag`/`Heading`/`Count`, `landingFeatureRowNextAria` (arrow button `aria-label`).
   - Delete (now-orphaned once `NdviCard` and the old cards are removed): `landingNdviCardBadgeNdvi`, `landingNdviCardBadgeNdmi`, `landingNdviCardTitle`, `landingNdviCardDesc`, `landingCardHealthBadge`, `landingCardHealthProjected`, `landingCardHealthYield`, `landingCardScannerDisease`.
   - Keep unchanged: `landingCardHealthTitle`, `landingCardScannerTitle`, `landingCardScannerDesc`, `landingCardMandiTitle`.
4. Two-line description clamp: `.ccard .d` needs `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;` (Tailwind arbitrary or a small utility class) so the enriched Crop-health description wraps cleanly instead of overflowing the fixed card height.

**Verification checklist:**
- [ ] `grep -n "NdviCard" frontend/src/app/page.tsx` → no matches (component fully removed).
- [ ] `grep -rn "info-blue\|#3a719b\|#4e8dbf\|#e7f0f7" frontend/src/components/ui/FeatureRow.tsx frontend/src/app/page.tsx` → no matches for the Breeders section specifically (blue tokens gone from this feature).
- [ ] `grep -rn "🚁\|🌾\|🧬" frontend/src/app/page.tsx frontend/src/components/ui/FeatureRow.tsx` → no matches (no emoji icons).
- [ ] Manual: Farmers row shows 5 cards + partial 6th, arrow button visible and scrolls smoothly to reveal the 6th card, arrow disappears once fully scrolled; Breeders row shows both cards with no arrow (no overflow).
- [ ] Both languages render correctly; RTL flips scroll direction sensibly (verify — `overflow-x: auto` under `dir="rtl"` scrolls right-to-left natively in most browsers, confirm the arrow button's scroll direction/sign still points at unseen content).
- [ ] Ledger banner section still renders correctly immediately after the two partitions, untouched.

**Anti-pattern guards:** no external carousel library (Embla, Swiper, etc.) — native scroll is sufficient for 6 and 2 items; don't reintroduce `info-blue` anywhere in the Breeders treatment; don't remove the ledger banner; don't add scroll-snap complexity beyond what's needed (plain smooth `scrollBy` is enough, no snap-point library).

---

## Phase 5 — Final verification

1. `npx tsc --noEmit`, `npm run lint`, `npx next build`, `npx playwright test` all clean.
2. Manual pass in both languages: hero search → fly-to → draw → analyze (full flow from prior session's hardening still intact), expand/collapse map, Farmers/Breeders section in the chosen layout.
3. Responsive check at 375px/768px/1024px/1440px (ui-ux-pro-max `breakpoint-consistency`) — the expand overlay and geocoder control especially need a mobile-viable treatment (Mapbox's default geocoder box can be wide; may need `w-full` override on small screens).
4. Confirm no regressions to `/fields`/`/dashboard` (geocoder/expand are landing-hero-only).
