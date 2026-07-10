from fastapi import APIRouter

from app.api.v1.routes_alerts import router as alerts_router
from app.api.v1.routes_auth import router as auth_router
from app.api.v1.routes_crop_health import router as crop_health_router
from app.api.v1.routes_fields import router as fields_router
from app.api.v1.routes_ledger import router as ledger_router
from app.api.v1.routes_mandi_rates import router as mandi_rates_router
from app.api.v1.routes_ndvi import router as ndvi_router
from app.api.v1.routes_scans import router as scans_router
from app.api.v1.routes_settings import router as settings_router
from app.api.v1.routes_weather import router as weather_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(ndvi_router)
api_router.include_router(fields_router)
api_router.include_router(crop_health_router)
api_router.include_router(settings_router)
api_router.include_router(mandi_rates_router)
api_router.include_router(weather_router)
api_router.include_router(alerts_router)
api_router.include_router(ledger_router)
api_router.include_router(scans_router)
