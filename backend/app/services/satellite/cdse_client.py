"""
Copernicus Data Space Ecosystem (CDSE) client initialization.

Uses OAuth2 Client Credentials (not user login) so the backend can query
Sentinel-2 imagery independently, without any user ever logging into CDSE.
This replaces the old Earth Engine service-account flow.

Initialization happens once per process (guarded by a module-level flag),
not per-request — authenticating and establishing an openEO connection is
relatively expensive, and NDVI requests can be frequent.
"""

import logging

import openeo

from app.core.config import settings
from app.exceptions.custom_exceptions import SatelliteDataError

logger = logging.getLogger("app")

_connection: openeo.Connection | None = None


def initialize_cdse_connection() -> None:
    """
    Initialize the openEO connection to CDSE using OAuth2 Client Credentials.

    Safe to call multiple times — only initializes once per process.
    Call this once at FastAPI startup (see app/main.py).
    """
    global _connection

    if _connection is not None:
        return

    try:
        connection = openeo.connect(settings.CDSE_OPENEO_URL)
        connection.authenticate_oidc_client_credentials(
            client_id=settings.CDSE_CLIENT_ID,
            client_secret=settings.CDSE_CLIENT_SECRET,
        )
        _connection = connection
        logger.info("CDSE openEO connection initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize CDSE connection: {e}", exc_info=True)
        raise SatelliteDataError(f"CDSE initialization failed: {e}")


def ensure_connection() -> openeo.Connection:
    """
    Defensive check used by service functions that call the CDSE/openEO API.
    If startup initialization was somehow skipped or failed silently,
    this catches it before a confusing openEO error surfaces mid-request.

    Returns the active openEO connection for use in query/processing code.
    """
    if _connection is None:
        initialize_cdse_connection()
    return _connection