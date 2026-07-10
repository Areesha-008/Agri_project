# Handoff: Jadeed Kashtkar (جدید کاشتکار) — Satellite Farming Platform

## Overview
Jadeed Kashtkar is a precision-agriculture web app for Pakistani farmers, built by a biotechnology & genome engineering organization. Farmers draw field boundaries on a satellite map; the platform computes NDVI/NDMI from Sentinel-2 imagery (via CDSE/openEO), tracks crop health and projected yield, diagnoses leaf disease from photos, and shows agromet weather plus daily mandi (market) prices. A digital ledger records farm inputs and compiles printable production reports.

This package covers: a marketing **landing page**, the full **web app** (auth + 7 screens, responsive), and **mobile mockups** of 5 key screens.

## About the Design Files
The files in `designs/` are **design references created in HTML** — interactive prototypes showing intended look and behavior, **not production code to copy directly**. Your task is to **recreate these designs in the target codebase's environment** (the team's backend is FastAPI + PostGIS; frontend framework is not yet chosen — React/Next.js recommended) using established patterns and libraries. Open each `.dc.html` file in a browser to explore it (keep `support.js` in the same folder — it's the prototype runtime).

- `Jadeed Kashtkar Landing.dc.html` — marketing page (responsive ≤760px)
- `Jadeed Kashtkar App.dc.html` — full app: login, signup, dashboard, fields/map, crop health, disease scanner, market & weather, ledger, settings (responsive ≤760px)
- `Jadeed Kashtkar Mobile.dc.html` — 5 phone-frame mockups defining the intended mobile layouts (`android-frame.jsx` is only the presentation bezel)

## Fidelity
**High-fidelity.** Colors, typography, spacing, copy, and interactions are final. Recreate pixel-perfectly using your framework's idioms. The satellite map mock (static Esri tiles + SVG polygons) must be replaced by a real map library (Leaflet or MapLibre GL) in production.

## Design Tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| forest-900 | `#1B4332` | Primary brand, sidebar, buttons, headings accents |
| forest-700 | `#2D6A4F` | Hover on primary, links, success text |
| forest-500 | `#40916C` | Active dots, gauges, secondary accents |
| mint-300 | `#95D5B2` | Accent on dark green, sidebar icons, secondary CTA bg |
| mint-100 | `#EAF3EC` | Tinted card bg, tags (border `#CDE3D3` / `#A8CDB4`) |
| cream-bg | `#F6F4ED` | App/page background |
| cream-card | `#FDFCF9` | Panels, nav bg |
| cream-inset | `#F1EEE3` | Inset chips, segmented controls |
| border | `#E7E3D6` | Card borders (inputs: `#E2DECD`) |
| ink-900 | `#1e2b23` | Primary text |
| ink-600 | `#4a5a4f` | Secondary text |
| ink-500 | `#6b7a6f` | Tertiary text |
| ink-400 | `#8a927f` / `#9aa290` | Muted labels, timestamps |
| alert-red | `#D95D45` | Alert icons (text `#8c3423`, body `#a06147`, bg `#FCEFE9`, border `#F2D5C8`) |
| alert-amber | `#E9B44C` | Weather warnings (text `#B07D2B`, bg `#FBF3E1`, border `#F0E3C2`) |
| info-blue | `#4E8DBF` | Irrigation category (tag bg `#E7F0F7`, text `#3A719B`) |
| down-red | `#C1512F` | Negative price change |
| NDVI ramp | `#8B4513 → #D2B48C → #F0E68C → #9ACD32 → #228B22 → #006400` | brown→green vegetation scale |
| NDMI ramp | `#08519C → #4292C6 → #9ECAE1 → #FEE391 → #FEC44F` | wet→dry moisture scale |

### Typography
- **Inter** (Google Fonts) 400/500/600/700/800 — all Latin text
- **Noto Nastaliq Urdu** 400/600 — all Urdu text (needs `line-height ≥ 1.7`, it's a tall script)
- Scale: page titles 19px/700 (app) · 32–46px/800 (landing, letter-spacing −0.02em) · card titles 13–14px/700 · body 12–13px · labels/timestamps 10–11.5px · stat numbers 15–24px/800
- Buttons: 12.5–14.5px/700

### Spacing & shape
- Base grid: 14px gaps between app cards; 16–22px card padding; page padding 20–22px
- Radii: cards 16px (landing 18–22px), buttons 9–12px, chips/pills 8–9px or 999px, map insets 11px
- Shadows: cards `0 1px 2px rgba(27,67,50,.05)`; dropdowns/modals `0 10px 30px rgba(27,67,50,.16)`; FABs `0 6px 18px rgba(27,67,50,.4)`
- Touch targets ≥ 44px on mobile

## Screens / Views

### 1. Landing page (`Jadeed Kashtkar Landing.dc.html`)
- **Nav** (sticky, blur backdrop): logo + bilingual wordmark, anchor links (Features/How it works/Mission), EN/اردو toggle, Sign in, "Get started" primary button. Mobile: links + Sign in hidden.
- **Hero**: 2-col grid (1.05fr/1fr). Left: lab credibility badge (pulsing dot), 46px headline, subcopy, primary CTA + anchor link, 3 stat counters (10 m / 5 days / 0 PKR) above a top border. Right: **interactive map card** (400px, radius 22) — real satellite imagery, NDVI-gradient field polygon with white vertex handles, Leaflet-style zoom control (top-left), NDVI/NDMI/Satellite layer pills (top-right), legend (bottom-left), attribution (bottom-right). **Drag-to-pan**: pointer drag translates the tile+polygon layer, clamped to loaded tiles; cursor grab→grabbing. Two floating cards: stats (NDVI mean/area/health, slides in from right, 0.7s delay) and rust alert (slides in from left 0.45s, icon pulses via expanding box-shadow ring, 2.2s loop).
- **Trust strip**: "Powered by" + Copernicus Sentinel-2 · CDSE/openEO · PostGIS · genome-backed models.
- **Features bento** (4-col grid, 172px rows, 16px gap): [A] 2×2 live mini-map with dashed drawing boundary + gradient scrim caption; [B] 1×2 NDVI/NDMI gradient swatches with toggle pills; [C] 1×1 health gauge ring (conic-gradient, 74%); [D] 1×1 scanner mini-mock (94.2% confidence bar); [E] 2×1 weather chips + pulsing "RUST 78%" pill; [F] 2×1 mandi price rows. Below: full-width dark-green ledger banner with CTA.
- **How it works**: 3 step cards. **Mission**: centered statement + 3 goal stats. **CTA banner** + footer.
- **Scroll reveal**: every section header, bento card, step card, mission block, and CTA starts `opacity:0; translateY(26px)` and transitions in (0.65s, cubic-bezier(.2,.8,.3,1), stagger = index%4 × 90ms) when ≥15% enters viewport (IntersectionObserver, once per element).
- Mobile (≤760px): single column everywhere; hero map 300px; h1 34px; floating cards pulled inside viewport.

### 2. App (`Jadeed Kashtkar App.dc.html`)
**Auth**: Login (email+password card, "Try without an account" guest entry that lands on My Fields) and Signup (name, mobile 03xx-xxxxxxx, email, password ≥8 chars). Centered 400px cards on cream.

**Shell**: 224px dark-green sidebar (logo, 7 nav items with active state `rgba(149,213,178,.18)` bg, Sentinel sync status card, Settings, Sign out) + 60px top bar (field switcher dropdown, EN/اردو toggle, settings gear, notifications bell with badge + dropdown of alert cards, avatar). **Mobile (≤760px)**: sidebar hidden → 64px bottom tab bar (Home/Fields/Scan/Market/Ledger, flat tabs, active = `#1B4332`); avatar hidden; Settings via gear.

**Dashboard**: greeting + date, dismissible rust alert banner, 3-col grid (1.5fr/1fr/1fr → 1 col mobile): NDVI map card (per-field, mean/min/max/area stat chips), crop health conic gauge + yield projection, weather (5-day chips, monsoon days amber), mandi mini-table, recent ledger (3 entries). Cards deep-link to their pages.

**My Fields**: 290px tools panel (Draw button → drawing mode → analyzing spinner → results card → save) + full-bleed map. Map: SVG polygons per field (selected = thicker white stroke, higher opacity), fill switches with NDVI/NDMI/Satellite layer toggle, click-to-place boundary points when drawing (≥3 to finish), legend + selected-field stats overlays. Analysis simulates: polygon area (shoelace) → hectares, randomized NDVI stats after 1.7s. Mobile: map on top, panel below (38% max-height).

**Crop Health**: health gauge + yield card (progress bar, maund/acre + t/ha), NDVI season trend bar chart (Nov→Jul), all-fields grid (4-up → 2-up mobile) with per-field gauges and status lines, lab recommendations (3 tinted tiles).

**Disease Scanner**: 3 states. *Idle*: dashed drop zone + "try sample" button. *Uploading*: spinner + phase text + progress bar ("Matching against 14,200 genome-referenced pathogen samples"). *Result*: photo (user upload via FileReader, or striped placeholder), red diagnosis banner (Leaf rust — Puccinia triticina, 94.2% confidence), classification breakdown bars, 3 numbered mitigation steps, "Log to ledger" (creates ledger entry + navigates).

**Market & Weather**: pest/blight warning banner (rust 78% + whitefly 54% chips), 7-day forecast cards (rainy days amber-tinted), mandi table (Faisalabad/Lahore/Multan segmented control multiplies prices ×1 / ×1.02 / ×0.975) with commodity + Urdu name, price PKR/40kg, change %, 7-day sparkline bars. Mobile: sparkline column hidden.

**Digital Ledger**: log-action form (type select / quantity / note → prepends timeline entry), timeline with colored category dots + tags (Fertilizer green, Irrigation blue, Spray red, Scan amber, Operation gray), report-builder side panel (totals: area, fields, avg health, urea/DAP bags = acres×1.6 / ×1.0) → **report modal** (branded header, stat tiles, field summary table, fertilizer requirement, `window.print()` for PDF). Mobile: stacked.

**Settings**: 2×2 card grid (→1 col mobile): Profile (avatar, contact rows), Preferences (language / yield-unit / default-mandi segmented controls — all wired to live state), Alerts & notifications (4 iOS-style toggles: 40×22px pill, 18px knob, `translateX(18px)` when on, 0.2s transition), Data & account (sync status, download-data → report modal, change password, tinted sign-out button).

### 3. Mobile mockups (`Jadeed Kashtkar Mobile.dc.html`)
Five 412×892 screens defining the phone experience: Dashboard, My Fields (full-bleed map + bottom sheet + "Draw field" FAB), Scanner result, Market & Weather (horizontally swipeable forecast cards), Ledger (summary strip + timeline + "Log action" FAB). Shared 64px bottom tab bar, active tab `#1B4332`.

## Interactions & Behavior
- All hover states: primary buttons `#1B4332 → #2D6A4F`; cards get `border-color:#C9DECE` or `#A8CDB4`; list rows `#F1EEE3`.
- Language toggle switches all chrome/nav strings EN↔UR (translation map in the prototype's logic — reuse it as the starting i18n dictionary; Urdu needs RTL-aware review).
- Dropdowns (field switcher, notifications) are mutually exclusive; close on navigation.
- Loading states: NDVI analysis (spinner card, 1.7s), scanner (staged progress). Keep these patterns for real async calls.
- Animations: landing scroll-reveal + pulse/slide keyframes as specced above; toggle knobs 0.2s; respect `prefers-reduced-motion` in production.
- Responsive breakpoint: 760px (single breakpoint by design).

## State Management
Single store (or per-route slices) with: `view` (login/signup/app), `page`, `lang`, `fieldIdx`, `fields[]`, map `layer`, drawing state (`drawMode`, `drawPoints[]`, `analyzing`, `analysis`), scanner state machine (`idle/uploading/result`, `scanPct`, `scanImg`), `mandi` selection, `entries[]` (ledger), `settings` (pest/weather/price/sms booleans, units), UI flags (`notifOpen`, `fieldMenuOpen`, `reportOpen`).

### Data contracts (replace mocks with API)
```ts
Field {
  id, name: string; crop: 'Wheat'|'Rice'|'Sugarcane'|'Cotton'|...;
  ha: number; boundary: GeoJSON Polygon;
  ndvi: { mean, min, max: number };        // GET /fields/{id}/ndvi
  health: number /*0-100*/; yieldM, yieldT: number;
  imageDate: string; cloudPct: number;      // Sentinel-2 scene metadata
}
LedgerEntry { id, title, detail, category, timestamp, fieldId }
MandiRate { commodity, urduName, pricePkrPer40kg, changePct, history7d: number[] }
Forecast { day, tempHi, tempLo, humidityPct, windKmh, rain: boolean, desc }
ScanResult { disease, latinName, confidencePct, breakdown: {label,pct}[], mitigations: string[] }
```
- Polygon draw → `POST /fields` with GeoJSON → backend job (openEO) → poll/websocket for NDVI result.
- Alerts (rust risk %) computed server-side from humidity/temperature windows; deliver via websocket/poll + SMS fallback (see Settings toggle).

## Assets
- **Fonts**: Google Fonts — Inter, Noto Nastaliq Urdu.
- **Satellite imagery**: prototype hot-links Esri World Imagery tiles (`server.arcgisonline.com/.../World_Imagery/MapServer/tile/{z}/{y}/{x}`, zoom 15, Faisalabad farmland ~x 23022–23025, y 13372–13374). Production must use a properly licensed basemap (Esri, Mapbox, or Sentinel-2 true color via your CDSE pipeline) with attribution.
- **Icons**: all inline SVG, 15×15 viewBox, 1.5–1.6 stroke, drawn in the prototypes — copy paths directly. Logo = two-leaf mark in rounded square.
- No raster assets. Leaf photos are user-uploaded at runtime.

## Files
```
designs/
  Jadeed Kashtkar Landing.dc.html   — landing page (all sections, animations, responsive CSS)
  Jadeed Kashtkar App.dc.html       — full app; template = markup, <script data-dc-script> = state/logic + EN/UR strings
  Jadeed Kashtkar Mobile.dc.html    — mobile layout references
  android-frame.jsx                 — presentation-only phone bezel for the mobile file
  support.js                        — prototype runtime (needed to open the .dc.html files; not for production)
```
