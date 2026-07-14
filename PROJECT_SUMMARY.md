# Jadeed Kashtkar (جدید کاشتکار) — Project Summary

**Precision-agriculture SaaS platform for Pakistani farmers.** A full-stack web app that turns satellite imagery, weather data, and photo-based diagnostics into actionable field intelligence — replacing manual field walks and guesswork with a digital record of crop health, market prices, and farm activity.

## One-line pitch (for a resume bullet)

> Built a full-stack precision-agriculture platform (FastAPI + Next.js) that computes vegetation health from live Sentinel-2 satellite imagery, diagnoses crop disease from photos, and automates weather-based farm alerts — with PostGIS geospatial storage, JWT auth, and a scheduled background-job pipeline.

## What it does

| Module | Description |
|---|---|
| **Field mapping** | Farmers draw field boundaries directly on a satellite basemap (Mapbox GL + `mapbox-gl-draw`); geometry is validated and persisted as real PostGIS polygons. |
| **Crop health (NDVI/NDMI)** | Pulls Sentinel-2 imagery from the Copernicus Data Space Ecosystem (CDSE) via the openEO API, computes vegetation/moisture indices, and renders them as map overlays with historical trend tracking. |
| **Disease scanner** | Farmer uploads a leaf photo → gets a diagnosis (disease name, confidence %, breakdown, mitigation steps). Classification sits behind a swappable `InferenceProvider` interface (ships with a deterministic demo classifier; ONNX model integration already wired for a future trained model). |
| **Weather & alerts** | Open-Meteo forecast integration feeds a rule engine that runs on a schedule and raises farm alerts (frost, heavy rain, etc.). |
| **Digital ledger** | Farmers log inputs/activities (fertilizer, spraying, scans) per field; entries compile into a printable PDF production report. |
| **Mandi rates** | Daily market price reference for crops. |
| **Auth** | JWT-based signup/login with forgot/reset-password flow. |

## Architecture

**Backend — FastAPI (Python 3.12)**
- Layered design: `routes/` → `services/` → `models/`, with Pydantic schemas as the API contract layer.
- **10-table PostgreSQL schema** (via SQLAlchemy + PostGIS/`geoalchemy2`), versioned with Alembic migrations and seeded reference data.
- **14 service modules** covering auth, satellite processing, disease inference, weather, alerts, ledger, and PDF reporting.
- Background job pipeline for long-running NDVI analysis (`BackgroundTasks` + polling job status table) and an APScheduler-driven sweep for alert rules — no external queue infra needed.
- Retry/resilience layer around the CDSE OAuth2 + openEO client to handle transient satellite-API failures gracefully.
- Custom exception hierarchy with centralized FastAPI exception handlers for consistent API error responses.
- Test suite (`pytest`) covering the alert engine, crop-health service, geometry validation, and ledger service.

**Frontend — Next.js 16 (React 19)**
- Route groups for auth (`login`, `signup`, `forgot-password`, `reset-password`) and the authenticated app shell (`dashboard`, `fields`, `health`, `scanner`, `ledger`, `market`, `settings`).
- TanStack Query for server-state/data-fetching, Zustand for client state, a typed API client, and an i18n layer (English/Urdu).
- Mapbox GL for interactive field-drawing and satellite-overlay visualization.
- Tailwind CSS v4 design system; Playwright for end-to-end tests.

**Infra**
- Docker Compose (Postgres/PostGIS + backend) for one-command local/prod startup; migrations run automatically on container start.

## Notable engineering details

- **Pluggable ML inference seam**: the disease scanner's `InferenceProvider` abstract base class means swapping the demo classifier for a real trained model (ONNX export) is a new class + one config flag — no changes to the route or service orchestration layer.
- **Real satellite data, not mocked**: the CDSE/openEO integration performs a live OAuth2 client-credentials handshake and pulls actual Sentinel-2 imagery — validated end-to-end against real satellite data, not stubbed responses.
- **Geospatial correctness**: field boundaries are validated (self-intersection, ring closure, coordinate bounds) before being stored as PostGIS geometry, so downstream NDVI computation always operates on well-formed polygons.
- **Resolved a stateful-auth hydration bug** in the frontend's `AuthProvider` where client-side state could desync from the server session on reload — fixed by correcting hydration order.

## Tech stack

`FastAPI` · `PostgreSQL + PostGIS` · `SQLAlchemy` · `Alembic` · `APScheduler` · `Pydantic` · `Next.js 16` · `React 19` · `TypeScript` · `Tailwind CSS v4` · `Mapbox GL` · `TanStack Query` · `Zustand` · `Docker Compose` · `pytest` · `Playwright`

## Scale (as of this snapshot)

- Backend: ~3,900 lines of Python across routes, services, models, and schemas (10 DB models, 10 route modules, 14 services, 15 Pydantic schemas).
- Frontend: ~4,600 lines of TypeScript/TSX across ~37 files, spanning 7 authenticated app screens plus the full auth flow.
