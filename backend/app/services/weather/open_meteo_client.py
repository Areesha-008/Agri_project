"""
Open-Meteo client — free, keyless weather API (no account/gap needed).

Maps daily forecast data onto the design's `Forecast` contract:
    Forecast { day, tempHi, tempLo, humidityPct, windKmh, rain: boolean, desc }

Cached in-process per (lat, lon) rounded to ~100m, TTL from
settings.WEATHER_CACHE_TTL_SECONDS (default 1h) — a plain dict is enough
since this is a single-process FastAPI app with no shared cache
infrastructure; if the app is ever scaled to multiple workers, swap this
for Redis without touching callers (they only see `get_forecast`).
"""

import logging
import time
from dataclasses import dataclass
from datetime import date, datetime

import requests

from app.core.config import settings
from app.exceptions.custom_exceptions import WeatherServiceError

logger = logging.getLogger("app")

# WMO weather codes (Open-Meteo's `weathercode`) mapped to short descriptions
# and whether they count as "rain" for the design's amber-tinted day chips.
_WEATHER_CODE_DESC = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Dense freezing drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail",
}
_RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}
_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


@dataclass
class ForecastDay:
    day: str
    date: date
    temp_hi: int
    temp_lo: int
    humidity_pct: int
    wind_kmh: int
    rain: bool
    desc: str


_cache: dict[tuple[float, float], tuple[float, list[ForecastDay]]] = {}


def get_forecast(lat: float, lon: float) -> list[ForecastDay]:
    cache_key = (round(lat, 3), round(lon, 3))
    now = time.time()

    cached = _cache.get(cache_key)
    if cached is not None and now - cached[0] < settings.WEATHER_CACHE_TTL_SECONDS:
        return cached[1]

    try:
        response = requests.get(
            settings.OPEN_METEO_BASE_URL,
            params={
                "latitude": lat,
                "longitude": lon,
                "daily": (
                    "temperature_2m_max,temperature_2m_min,relative_humidity_2m_mean,"
                    "wind_speed_10m_max,precipitation_sum,weathercode"
                ),
                "timezone": "auto",
                "forecast_days": 7,
            },
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as e:
        logger.error(f"Open-Meteo request failed for ({lat}, {lon}): {e}")
        raise WeatherServiceError(f"Could not fetch weather forecast: {e}")

    daily = response.json().get("daily")
    if not daily:
        raise WeatherServiceError("Open-Meteo returned no daily forecast data")

    forecast = []
    for i, date_str in enumerate(daily["time"]):
        day_date = datetime.strptime(date_str, "%Y-%m-%d").date()
        code = daily["weathercode"][i]
        forecast.append(
            ForecastDay(
                day=_DAY_LABELS[day_date.weekday()],
                date=day_date,
                temp_hi=round(daily["temperature_2m_max"][i]),
                temp_lo=round(daily["temperature_2m_min"][i]),
                humidity_pct=round(daily["relative_humidity_2m_mean"][i]),
                wind_kmh=round(daily["wind_speed_10m_max"][i]),
                rain=code in _RAIN_CODES,
                desc=_WEATHER_CODE_DESC.get(code, "—"),
            )
        )

    _cache[cache_key] = (now, forecast)
    return forecast
