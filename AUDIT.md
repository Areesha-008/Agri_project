# AUDIT — Existing backend vs. design_handoff requirements

Date: 2026-07-10. Scope: `backend/` (FastAPI) against `design_handoff/README.md` + `design_handoff/CLAUDE_CODE_INSTRUCTIONS.md`.

## Already built and working

| Area | Status | Notes |
|---|---|---|
| Postgres + PostGIS | ✅ working | `geoalchemy2`, `Field` model has SRID-4326 polygon column |
| Auth (real JWT) | ✅ working, **but conflicts with spec** | `POST /auth/signup`, `POST /auth/login`, bcrypt hashing, JWT bearer deps. Spec asks for a *dev-mode stub*, not real auth. See Gap #1. |
| Field CRUD | ✅ working | `POST /fields/save`, `GET /fields`, `GET /fields/{id}` — all JWT-protected |
| NDVI/CDSE pipeline | ✅ working, **synchronous** | `POST /ndvi/analyze` (public, no auth) calls CDSE/openEO live, computes NDVI (B04/B08, SCL cloud mask), renders PNG, returns stats. No job queue — request blocks until CDSE responds. Spec wants "field saved → background job → poll". See Gap #4. |
| Exception handling / logging / CORS | ✅ working | Clean, consistent patterns already in place |
| Alembic | 🏗️ scaffolded, unused | `alembic/env.py` configured correctly, but `alembic/versions/` has no migrations yet — schema was likely created ad hoc or via `create_all` |
| `.env.example` | 🏗️ present but empty | Needs every var documented (Section 9 of instructions) |

## Completely absent (needed by spec)

- **NDMI** — pipeline only computes NDVI today; NDMI (B08/B11) needs adding to `ndvi_processor.py`.
- **Field-triggered analysis flow** — today the frontend would call `/ndvi/analyze` directly and then `/fields/save` with frontend-computed stats. Spec wants: save field → backend triggers job → poll status → historical readings. Needs a redesign of the fields/ndvi relationship (trigger + status endpoints).
- **Disease scanner** — no ML code, no model weights, no `/scans` endpoint, no ledger link.
- **Weather & alerts** — no Open-Meteo client, no alert engine, no scheduled job runner.
- **Digital ledger** — no `LedgerEntry` model/routes at all.
- **Reports / PDF** — no aggregate report endpoint, no PDF generator (WeasyPrint etc.).
- **Mandi rates** — no `MandiRate` model/seed/routes.
- **Settings** — no per-user settings model/routes.
- **Background jobs** — no Celery/RQ/APScheduler; nothing to run the NDVI job or scheduled alert checks.
- **Frontend** — `/frontend` doesn't exist yet; nothing has been scaffolded.
- **Docker / deploy** — no `docker-compose.yml`, no `DEPLOY.md`.

## Key structural conflict with the instructions

The instructions assume no auth exists ("do NOT implement real auth... dev-mode session... login/signup screens as non-functional shells"). The repo already has a **working, real JWT auth system** (signup, login, bcrypt, protected routes) wired through the existing `Field` model (fields are owned per-user via FK). Ripping that out for a hardcoded demo session would mean either:
- (a) throwing away working auth code and the user ownership model, or
- (b) keeping real auth and just adding a "continue as guest" convenience path instead of a fake session.

This needs a decision before scaffolding the frontend's `AuthProvider`, since it changes what that interface looks like. Raised as Gap #1 below.

See `GAPS.md` for the full list of blocking gaps and options.