# CLAUDE_CODE_INSTRUCTIONS.md — Jadeed Kashtkar Frontend Build & Backend Integration

You are Claude Code, working inside the Jadeed Kashtkar backend repository. This folder (`design_handoff/`) contains the complete UI specification. Your job: build the production frontend, integrate it with the existing FastAPI backend, and bring the project to a deployment-ready state.

**Read `README.md` in this folder first** — it defines every screen, design token, interaction, and the data contracts. Treat the `.dc.html` files in `designs/` as visual references only (open them in a browser); do not ship or import their code.

---

## 0. Ground rules

1. **Audit before writing.** Start by mapping the existing backend: routers, models, services, DB schema/migrations, and any openEO/CDSE code. Produce a short written audit (`AUDIT.md`) listing what exists vs. what each module below needs, before implementing anything.
2. **Gap protocol — important.** Whenever something a module needs is **missing from the repo** (a service, a credential, a data source, a model file, a table), do NOT silently invent, hardcode, or skip it. Instead:
   - Stop work on that module and clearly tell the user: *what* is missing, *why* it's needed, and *2–3 concrete options* to resolve it (with your recommendation and effort estimate).
   - Where a credential/account is needed, give exact sign-up steps and which `.env` variable to set.
   - Offer a temporary, clearly-labeled stub behind an interface so the rest of the app keeps moving, and record the gap in `GAPS.md` with its resolution plan.
   - Continue with the other modules — never let one gap block the whole build.
3. **Out of scope for now (user decision pending):**
   - **Authentication/authorization** — do NOT implement real auth. Create a minimal dev-mode session (single hardcoded demo user server-side, no passwords) behind an `AuthProvider` interface on the frontend and a FastAPI dependency on the backend, so real auth can be dropped in later without refactoring. Keep the login/signup screens from the design as non-functional shells that enter the demo session.
   - **Mandi rates** — do NOT build a scraper or integration. Implement the API shape from the data contract (`MandiRate`) backed by a seed table with the mock values from the design, clearly marked `# TODO: real data source pending`. Frontend consumes the endpoint normally so swapping the source later is invisible to the UI.
4. **Design fidelity.** Recreate the designs pixel-perfectly per README tokens. Keep the prototype's loading/error/empty-state patterns. Breakpoint: 760px, mobile layouts per the mobile mockups. Respect `prefers-reduced-motion`.

## 1. Frontend scaffold
- Next.js (App Router) + TypeScript in `/frontend`. Tailwind is fine — encode the README's tokens as the theme (colors, radii, shadows, spacing).
- Fonts: Inter + Noto Nastaliq Urdu via `next/font` (Urdu line-height ≥ 1.7).
- i18n: `en`/`ur` dictionaries — seed from the translation map inside `designs/Jadeed Kashtkar App.dc.html` (`T = {en:…, ur:…}`), extend to cover ALL strings, with RTL handling for Urdu.
- State: TanStack Query for server state + a light client store (Zustand) for UI state (selected field, layer, drawing points, language, settings).
- Pages: landing, app shell (dashboard, fields, health, scanner, market/weather, ledger, settings) per README.

## 2. Map & field drawing (My Fields)
- MapLibre GL (or Leaflet) with a properly licensed basemap. **Gap likely:** basemap API key → ask the user (MapTiler/Mapbox), env `NEXT_PUBLIC_MAP_TILES_KEY`.
- Polygon draw (mapbox-gl-draw or leaflet-draw): ≥3 points, validate + close ring, show live area.
- `POST /fields` with GeoJSON polygon → PostGIS storage; area computed server-side (`ST_Area` on geography, return hectares). List/select/delete fields.
- NDVI/NDMI raster overlays per field rendered from the analysis results (image overlay or tile layer, whichever the existing pipeline supports — check the repo first).

## 3. NDVI / satellite pipeline
- Reuse the repo's openEO/CDSE code if present; else follow gap protocol (needs CDSE account → `CDSE_CLIENT_ID`/`SECRET`).
- Flow: field saved → background job (reuse repo's task runner; if none, propose FastAPI BackgroundTasks vs Celery/RQ and ask) → fetch cloud-filtered Sentinel-2 L2A over the polygon → compute NDVI + NDMI stats (mean/min/max) and raster → store reading with scene date + cloud %.
- Endpoints: trigger analysis, poll job status (frontend shows the "Analyzing via Sentinel-2…" state from the design), fetch latest + historical readings (powers the Crop Health trend chart).

## 4. Crop health & yield
- Health score + yield projection service: if the repo has formulas/models, use them; otherwise implement the transparent baseline in the README (NDVI-driven score, district-baseline yield in maund/acre AND t/ha — respect the units setting) and flag it in `GAPS.md` for the agronomy team to refine.

## 5. Disease scanner
- Frontend: three-state flow (idle drop-zone / staged progress / result) exactly per design; camera capture on mobile.
- Backend: `POST /scans` (multipart image) → inference → `ScanResult` contract; persist scans; "Log to ledger" creates a ledger entry.
- **Gap expected:** the trained model. If the repo contains model weights/inference code, wire it. If not, follow gap protocol: present options (lab's model when ready · hosted vision API stopgap · clearly-fake demo classifier) and implement behind an `InferenceProvider` interface so swapping is trivial.

## 6. Weather & alerts
- Weather: Open-Meteo (free, keyless) proxied through FastAPI (`/weather?lat=&lon=`), cached ~1h, mapped to the `Forecast` contract; per-field location from polygon centroid.
- Alert engine: scheduled job evaluating rule-based risks from the design (e.g. stripe rust: RH >70% + 26–31°C over 3 days) → alert records per field. Endpoints to list/dismiss. Frontend: bell dropdown + dashboard banner. SMS fallback is auth/provider-dependent — stub behind a `Notifier` interface, note in `GAPS.md`.

## 7. Digital ledger & production report
- Ledger CRUD per `LedgerEntry` contract (categories: Fertilizer/Irrigation/Spray/Operation/Scan), newest-first timeline.
- Report: aggregate endpoint (total ha, field summaries, avg health, urea/DAP/SOP requirements per README formulas) + server-side PDF (WeasyPrint or equivalent) matching the report modal's layout; frontend downloads it.

## 8. Settings
- Persist per-user settings (language, yield units, default mandi, 4 alert toggles) via a settings endpoint; all controls wired per design. Alert toggles must actually gate the alert engine's delivery.

## 9. Quality & deployment
- Type-safe API client generated from the FastAPI OpenAPI schema.
- Tests: backend unit tests for area calc, health/yield, alert rules, report math; a few frontend smoke tests (routing, field draw flow with mocked API).
- `docker-compose.yml`: FastAPI + Postgres/PostGIS + frontend (+ worker if a task queue was chosen); Alembic migrations; `.env.example` listing EVERY variable you introduced; production notes (reverse proxy, HTTPS) in `DEPLOY.md`.
- Finish with a status report: what's done, what's stubbed (auth, mandi, anything in `GAPS.md`), and the exact next actions for the user.

## Suggested order
Audit → scaffold + tokens + shell → fields/map + PostGIS → NDVI pipeline → dashboard → health → weather/alerts → ledger/report → scanner → settings → i18n pass → tests → docker/deploy.
