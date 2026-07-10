# GAPS — things missing from the repo that block a module, with resolution options

Status legend: 🔴 blocking (need a decision before building that module) · 🟡 stubbed, deferred by design (per instructions) · 🟢 resolved

---

## 🟢 Gap 1 — Real auth already exists, conflicts with the "dev-mode stub" instruction
**Where:** `backend/app/api/v1/routes_auth.py`, `app/dependencies/auth.py`, `app/models/user.py`
**Resolution:** Keep the existing real JWT auth as-is. Add a "Try without an account" guest path that auto-registers/logs-in a fixed demo user server-side. Frontend `AuthProvider` calls the real login/signup endpoints; login/signup screens stay fully functional.

---

## 🟢 Gap 2 — Basemap tiles API key
**Where:** Section 2 (My Fields map)
**Resolution:** Mapbox + `mapbox-gl-draw`. User provided a Mapbox key, set as `NEXT_PUBLIC_MAP_TILES_KEY` in `frontend/.env.local` (gitignored).

---

## 🟢 Gap 3 — CDSE credentials for local/dev testing
**Where:** `backend/app/core/config.py` (`CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`), `.env.example`
**Resolution:** Credentials provided and written to `backend/.env` (gitignored). Verified working — CDSE openEO OAuth2 client-credentials handshake succeeds on app startup and NDVI/NDMI analysis runs end-to-end against real Sentinel-2 data.

---

## 🟢 Gap 4 — Background job runner for NDVI analysis (and later, scheduled alerts)
**Where:** `backend/app/services/satellite/ndvi_processor.py` (currently synchronous), Section 6 alert engine (needs a scheduler)
**Resolution:** FastAPI `BackgroundTasks` + a `jobs` table (status: pending/running/done/failed) for polling. No new infra. Add `apscheduler` in-process for the periodic alert-rule sweep.

---

## 🟢 Gap 5 — Disease scanner model
**Where:** Section 5, `backend/app/services/` (no ML code exists)
**Resolution:** Clearly-labeled fake demo classifier behind `InferenceProvider`. Deterministic per image hash, returns the design's sample result set, response marked `demo_mode: true`. Swap in a real model/API later with no refactor.

---

## 🟡 Gap 6 — SMS notifier (deferred by design, not blocking)
**Where:** Section 6, Settings SMS toggle
**Resolution:** Stub behind a `Notifier` interface (in-app/email/no-op implementations only for now); SMS provider decision deferred per instructions — no user input needed yet.

## 🟡 Gap 7 — Mandi rates (deferred by design, not blocking)
**Where:** Section 0.3, ground rule — explicitly says do not build a scraper/integration.
**Resolution:** Seed table with the mock values from the design, `# TODO: real data source pending`. No user input needed.