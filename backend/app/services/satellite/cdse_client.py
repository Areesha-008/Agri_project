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
import requests
from urllib3.util.retry import Retry

from app.core.config import settings
from app.exceptions.custom_exceptions import SatelliteDataError

logger = logging.getLogger("app")

_connection: openeo.Connection | None = None


def _build_resilient_session() -> requests.Session:
    """
    CDSE's openEO backend intermittently resets connections mid-request
    (confirmed on their community forum as backend-side instability, not
    something wrong on our end) — every NDVI/NDMI computation makes several
    HTTP round-trips to it (collection metadata + two synchronous /result
    downloads), and openeo.connect() otherwise hands back a plain
    requests.Session with zero retries, so any one of those round-trips
    hitting a blip fails the whole field draw. Retrying is safe here: every
    call this session makes is a read/compute-only query, nothing creates
    server-side state.
    """
    session = requests.Session()
    retry = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[502, 503, 504],
        allowed_methods=None,  # retry GET and POST alike (POST /result has no side effects here)
    )
    adapter = requests.adapters.HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session


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
        connection = openeo.connect(settings.CDSE_OPENEO_URL, session=_build_resilient_session())
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