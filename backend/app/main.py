import os

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.v1 import api_router
from app.core.config import settings
from app.core.logging import setup_logging
from app.exceptions import register_exception_handlers
from app.services.alert_engine import run_alert_sweep
from app.services.satellite.cdse_client import initialize_cdse_connection

setup_logging()

app = FastAPI(
    title=settings.APP_NAME,
    debug=settings.DEBUG,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

app.include_router(api_router, prefix=settings.API_V1_PREFIX)

# Serves generated NDVI PNG images (see app/services/satellite/visualization.py).
# CDSE/openEO returns raw raster data, not a ready-made tile URL like GEE did,
# so the backend renders its own PNG and serves it from here. Files referenced
# in API responses as `image_url` live under this mount.
os.makedirs("static/ndvi_images", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# In-process scheduler for the alert-rule sweep (see services/alert_engine.py).
# No separate worker/broker — matches GAPS.md Gap 4's "no new infra" resolution.
scheduler = BackgroundScheduler()


@app.on_event("startup")
def on_startup():
    initialize_cdse_connection()
    scheduler.add_job(
        run_alert_sweep,
        "interval",
        hours=settings.ALERT_SWEEP_INTERVAL_HOURS,
        id="alert_sweep",
    )
    scheduler.start()


@app.on_event("shutdown")
def on_shutdown():
    scheduler.shutdown(wait=False)


@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.APP_NAME, "env": settings.APP_ENV}