# Deployment & local setup

## Local development (no Docker)

Prerequisites: PostgreSQL 16 with PostGIS, Python 3.12.

1. **Database**
   ```bash
   createdb jadeed_kashtkar_db
   psql jadeed_kashtkar_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
   ```

2. **WeasyPrint system dependencies** (production report PDFs — native libs,
   not installable via pip alone):
   ```bash
   brew install pango gdk-pixbuf   # macOS
   # Debian/Ubuntu: apt-get install libpango-1.0-0 libpangocairo-1.0-0 \
   #   libcairo2 libgdk-pixbuf-2.0-0 libffi-dev shared-mime-info
   ```

3. **Python env**
   ```bash
   cd backend
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements-dev.txt   # includes requirements.txt + pytest
   ```

4. **Configure**
   ```bash
   cp .env.example .env
   # fill in DATABASE_URL, JWT_SECRET_KEY, CDSE_CLIENT_ID/SECRET (see .env.example
   # for where to get each — CDSE signup is free, see GAPS.md Gap 3)
   ```

5. **Migrate + run**
   ```bash
   alembic upgrade head
   uvicorn app.main:app --reload
   ```
   `GET /health` should return `{"status": "ok", ...}`. `/docs` has the
   interactive OpenAPI UI.

6. **Tests**
   ```bash
   pytest tests/ -v
   ```

## Docker Compose

From the repo root:
```bash
cp backend/.env.example backend/.env   # fill in JWT_SECRET_KEY, CDSE credentials
docker compose up --build
```
This starts `db` (postgis/postgis:16-3.4) and `backend` (migrates on
container start, then serves on :8000). The `frontend` service is
commented out in `docker-compose.yml` until `/frontend` is scaffolded
(see GAPS.md) — uncomment it once `frontend/Dockerfile` exists.

No separate worker/queue container: background jobs (NDVI analysis, alert
sweeps) run in-process via FastAPI `BackgroundTasks` + APScheduler (see
GAPS.md Gap 4) — one process, no broker to deploy.

## Production notes

- **Reverse proxy / HTTPS**: put the backend behind nginx/Caddy/a managed
  load balancer terminating TLS; forward to the `backend` container's
  :8000. Set `APP_BASE_URL` to the public HTTPS URL — it's baked into
  every generated static asset link (NDVI/NDMI PNGs, scan photos) in API
  responses, so getting it wrong breaks image URLs for clients.
- **CORS_ORIGINS**: set to the deployed frontend's exact origin(s)
  (comma-separated), not `*`.
- **JWT_SECRET_KEY**: generate a fresh one for production — never reuse the
  dev value. `python3 -c "import secrets; print(secrets.token_urlsafe(48))"`
- **Static files**: `static/ndvi_images` and `static/scan_images` grow
  unbounded (one file per analysis/scan). Either mount a persistent volume
  (as docker-compose.yml does) sized for growth, or move to object storage
  (S3/GCS) behind the same `image_url` shape if volume becomes a problem —
  no other module needs to change.
- **Migrations**: run `alembic upgrade head` as part of the deploy step
  (the Docker image's CMD already does this before starting uvicorn).
- **Scheduler**: APScheduler's alert sweep (`ALERT_SWEEP_INTERVAL_HOURS`)
  runs inside the same process as the web server. If you ever scale the
  backend to multiple replicas, only run the scheduler in one of them
  (e.g. gate `scheduler.start()` in `main.py` behind an env var set on a
  single "leader" instance) to avoid duplicate alert sweeps.
- **Secrets**: `.env` is gitignored; inject real values via your
  platform's secret manager (not baked into the image) in production.
