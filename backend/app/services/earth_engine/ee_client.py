"""
Google Earth Engine client initialization.

Uses a service account (not user OAuth) so the backend can query Sentinel-2
imagery independently, without any user ever logging into Google.

Initialization happens once per process (guarded by a module-level flag),
not per-request — authenticating with GEE and establishing a session is
relatively expensive, and NDVI requests can be frequent.
"""

import logging

import ee

from app.core.config import settings
from app.exceptions.custom_exceptions import EarthEngineError

logger = logging.getLogger("app")

_initialized = False


def initialize_earth_engine() -> None:
    """
    Initialize the Earth Engine session using a service account.

    Safe to call multiple times — only initializes once per process.
    Call this once at FastAPI startup (see app/main.py).
    """
    global _initialized

    if _initialized:
        return

    try:
        credentials = ee.ServiceAccountCredentials(
            settings.GEE_SERVICE_ACCOUNT_EMAIL,
            settings.GEE_SERVICE_ACCOUNT_KEY_PATH,
        )
        ee.Initialize(credentials, project=settings.GEE_PROJECT_ID)
        _initialized = True
        logger.info("Earth Engine initialized successfully with service account.")
    except Exception as e:
        logger.error(f"Failed to initialize Earth Engine: {e}", exc_info=True)
        raise EarthEngineError(f"Earth Engine initialization failed: {e}")


def ensure_initialized() -> None:
    """
    Defensive check used by service functions that call the GEE API.
    If startup initialization was somehow skipped or failed silently,
    this catches it before a confusing GEE error surfaces mid-request.
    """
    if not _initialized:
        initialize_earth_engine()