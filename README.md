# Jadeed Kashtkar (جدید کاشتکار)

Precision-agriculture web platform for Pakistani farmers. Farmers draw field
boundaries on a satellite map; the platform computes NDVI/NDMI from
Sentinel-2 imagery, tracks crop health, diagnoses leaf disease from photos,
and surfaces weather alerts and daily mandi (market) prices — with a digital
ledger to record farm inputs and compile printable production reports.

## Features

| Module | Description |
|---|---|
| **Fields** | Draw field boundaries on a satellite map (Mapbox GL); stored as PostGIS geometry. |
| **Crop health (NDVI/NDMI)** | Sentinel-2 vegetation/moisture indices via Copernicus Data Space Ecosystem (CDSE/openEO), rendered as PNG overlays with historical readings. |
| **Disease scanner** | Upload a leaf photo, get back a diagnosis with confidence breakdown and mitigations. Pluggable `InferenceProvider` — ships with a deterministic demo classifier, swappable for a fine-tuned EfficientNet model exported to ONNX. |
| **Weather & alerts** | Open-Meteo forecast integration with a scheduled rule engine for farm alerts. |
| **Digital ledger** | Log farm inputs/activities per field; compile into printable PDF production reports. |
| **Mandi rates** | Daily market price reference. |
| **Auth** | JWT-based signup/login with password reset. |

## Tech stack

- **Backend:** FastAPI, PostgreSQL + PostGIS (`geoalchemy2`), SQLAlchemy, Alembic, APScheduler
- **Frontend:** Next.js 16 (React 19), Tailwind CSS, Mapbox GL, Zustand, TanStack Query
- **Infra:** Docker Compose (Postgres + backend)

## Project structure

```
backend/    FastAPI app, Alembic migrations, ML inference providers
frontend/   Next.js app (auth, dashboard, fields, health, scanner, ledger, market, settings)
docker-compose.yml
```

## Getting started

### Docker Compose (recommended)

```bash
cp backend/.env.example backend/.env   # fill in JWT_SECRET_KEY, CDSE credentials
docker compose up --build
```

Starts Postgres/PostGIS and the backend (migrates on container start, serves
on `:8000`). See [DEPLOY.md](DEPLOY.md) for production notes.

### Local development

**Backend** — requires PostgreSQL 16 + PostGIS, Python 3.12:

```bash
createdb jadeed_kashtkar_db
psql jadeed_kashtkar_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"

cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET_KEY, CDSE_CLIENT_ID/SECRET

alembic upgrade head
uvicorn app.main:app --reload
```

`GET /health` should return `{"status": "ok"}`. Interactive API docs at `/docs`.

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Full setup details, WeasyPrint system dependencies, and production
deployment notes are in [DEPLOY.md](DEPLOY.md).

## Documentation

- [DEPLOY.md](DEPLOY.md) — local setup, Docker Compose, production deployment
- [DISEASE_SCANNER.md](DISEASE_SCANNER.md) — disease scanner architecture and `InferenceProvider` seam
- [GAPS.md](GAPS.md) — known gaps against the original design spec and how each was resolved

## Testing

```bash
cd backend
pytest tests/ -v
```

```bash
cd frontend
npm run test:e2e
```
