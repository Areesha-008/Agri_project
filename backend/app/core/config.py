"""
Centralized application configuration.

All environment-dependent values (secrets, credentials, connection strings,
feature flags) are declared here as a single Pydantic Settings class.

Why this exists:
- Every other module imports `settings` from here instead of reading
  os.environ directly. One source of truth, one place to audit.
- Pydantic validates types and required fields at startup. If something is
  missing or malformed, the app fails fast on boot instead of failing deep
  inside a request handler later.
- Local development uses a `.env` file; production uses real environment
  variables injected by the deployment platform. Same class, no code change.
"""

from functools import lru_cache
from typing import List

from pydantic import Field, PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # ------------------------------------------------------------------
    # General app
    # ------------------------------------------------------------------
    APP_NAME: str = "Precision Agriculture Platform"
    APP_ENV: str = Field(default="development")  # development | staging | production
    DEBUG: bool = Field(default=False)
    API_V1_PREFIX: str = "/api/v1"

    # Public base URL of this backend, used to build absolute links to
    # generated static assets (e.g. NDVI PNG images) returned in API
    # responses. e.g. http://localhost:8000 in dev, https://api.yourapp.com
    # in production.
    APP_BASE_URL: str = Field(default="http://localhost:8000")

    # Public base URL of the frontend, used to build password-reset links.
    FRONTEND_URL: str = Field(default="http://localhost:3000")

    # CORS: the React frontend origin(s). Comma-separated in .env.
    #
    # This is intentionally typed as `str`, not `List[str]`: pydantic-settings
    # tries to JSON-decode any env var bound to a List[...] field *before*
    # field validators run, so a plain comma-separated value (not a JSON
    # array) raises a SettingsError at startup rather than reaching the
    # validator below. Splitting via the `cors_origins_list` property instead
    # sidesteps that entirely.
    CORS_ORIGINS: str = Field(default="http://localhost:3000")

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]

    # ------------------------------------------------------------------
    # Database (PostgreSQL + PostGIS)
    # ------------------------------------------------------------------
    DATABASE_URL: PostgresDsn = Field(
        ...,
        description="e.g. postgresql://user:password@localhost:5432/precision_ag",
    )

    # ------------------------------------------------------------------
    # JWT Authentication
    # ------------------------------------------------------------------
    JWT_SECRET_KEY: str = Field(..., min_length=32)
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60)

    # ------------------------------------------------------------------
    # Copernicus Data Space Ecosystem (CDSE) — OAuth2 Client Credentials
    # ------------------------------------------------------------------
    CDSE_CLIENT_ID: str = Field(..., description="OAuth client ID from CDSE dashboard")
    CDSE_CLIENT_SECRET: str = Field(..., description="OAuth client secret from CDSE dashboard")
    CDSE_OPENEO_URL: str = Field(
        default="openeo.dataspace.copernicus.eu",
        description="openEO backend endpoint for CDSE",
    )

    # ------------------------------------------------------------------
    # NDVI / Sentinel-2 processing defaults
    # ------------------------------------------------------------------
    SENTINEL2_COLLECTION: str = Field(default="SENTINEL2_L2A")
    MAX_CLOUD_COVER_PERCENT: float = Field(default=20.0)
    NDVI_SEARCH_WINDOW_DAYS: int = Field(
        default=30, description="Rolling date window to average cloud-free scenes over"
    )

    # ------------------------------------------------------------------
    # Weather (Open-Meteo — free, keyless) & alert engine
    # ------------------------------------------------------------------
    OPEN_METEO_BASE_URL: str = Field(default="https://api.open-meteo.com/v1/forecast")
    WEATHER_CACHE_TTL_SECONDS: int = Field(default=3600)
    ALERT_SWEEP_INTERVAL_HOURS: int = Field(default=1)

    # ------------------------------------------------------------------
    # Disease scanner
    # ------------------------------------------------------------------
    INFERENCE_PROVIDER: str = Field(
        default="demo", description="Which InferenceProvider implementation to use"
    )
    SCAN_IMAGES_DIR: str = Field(default="static/scan_images")

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------
    LOG_LEVEL: str = Field(default="INFO")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    """
    Cached settings accessor.

    lru_cache ensures the .env file / environment is only parsed once per
    process, and every import of `settings` below reuses the same instance.
    """
    return Settings()


settings = get_settings()