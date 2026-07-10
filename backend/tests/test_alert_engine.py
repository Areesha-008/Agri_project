from datetime import date

import pytest

from app.services.alert_engine import (
    RUST_MIN_CONSECUTIVE_DAYS,
    _stripe_rust_qualifying_streak,
    _stripe_rust_risk_pct,
)
from app.services.weather.open_meteo_client import ForecastDay


def _day(day="Mon", humidity=75, temp_lo=27, temp_hi=30, rain=False) -> ForecastDay:
    return ForecastDay(
        day=day,
        date=date(2026, 7, 10),
        temp_hi=temp_hi,
        temp_lo=temp_lo,
        humidity_pct=humidity,
        wind_kmh=10,
        rain=rain,
        desc="Partly cloudy",
    )


def test_qualifying_streak_all_favorable():
    forecast = [_day() for _ in range(5)]
    streak = _stripe_rust_qualifying_streak(forecast)
    assert len(streak) == 5


def test_qualifying_streak_stops_at_first_unfavorable_day():
    forecast = [_day(), _day(), _day(humidity=50), _day()]
    streak = _stripe_rust_qualifying_streak(forecast)
    # Only the leading run counts — the 4th favorable day never resumes it.
    assert len(streak) == 2


def test_qualifying_streak_requires_humidity_above_threshold():
    forecast = [_day(humidity=70)]  # exactly at threshold, not "above" it
    assert _stripe_rust_qualifying_streak(forecast) == []


def test_qualifying_streak_requires_temp_window_overlap():
    forecast = [_day(temp_lo=32, temp_hi=35)]  # too hot, no overlap with 26-31C
    assert _stripe_rust_qualifying_streak(forecast) == []


def test_qualifying_streak_empty_forecast():
    assert _stripe_rust_qualifying_streak([]) == []


def test_risk_pct_increases_with_humidity():
    low_humidity_streak = [_day(humidity=71) for _ in range(RUST_MIN_CONSECUTIVE_DAYS)]
    high_humidity_streak = [_day(humidity=95) for _ in range(RUST_MIN_CONSECUTIVE_DAYS)]

    assert _stripe_rust_risk_pct(high_humidity_streak) > _stripe_rust_risk_pct(low_humidity_streak)


def test_risk_pct_increases_with_streak_length():
    short_streak = [_day(humidity=80) for _ in range(RUST_MIN_CONSECUTIVE_DAYS)]
    long_streak = [_day(humidity=80) for _ in range(RUST_MIN_CONSECUTIVE_DAYS + 3)]

    assert _stripe_rust_risk_pct(long_streak) > _stripe_rust_risk_pct(short_streak)


def test_risk_pct_clamped_to_range():
    extreme_streak = [_day(humidity=100) for _ in range(20)]
    risk = _stripe_rust_risk_pct(extreme_streak)
    assert 0.0 <= risk <= 97.0
