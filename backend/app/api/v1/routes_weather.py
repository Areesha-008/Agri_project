from fastapi import APIRouter, Query

from app.schemas.weather import ForecastDayResponse
from app.services.weather.open_meteo_client import get_forecast

router = APIRouter(prefix="/weather", tags=["Weather"])


@router.get("", response_model=list[ForecastDayResponse])
def get_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    """
    Public endpoint — proxies Open-Meteo (free, keyless) so the frontend
    never needs its own API key. Cached ~1h per coordinate; see
    open_meteo_client.py.
    """
    forecast = get_forecast(lat, lon)
    return [
        ForecastDayResponse(
            day=d.day,
            date=d.date,
            temp_hi=d.temp_hi,
            temp_lo=d.temp_lo,
            humidity_pct=d.humidity_pct,
            wind_kmh=d.wind_kmh,
            rain=d.rain,
            desc=d.desc,
        )
        for d in forecast
    ]
