from datetime import date, timedelta

import pytest

from app.services.fertilizer_recommendation_service import (
    HEAVY_RAIN_THRESHOLD_MM,
    _select_target_node,
    classify_evidence,
    resolve_irrigation_type,
    resolve_soil_tier,
    weather_gate,
)
from app.services.weather.open_meteo_client import ForecastDay


# --- resolve_irrigation_type -------------------------------------------------

def test_resolve_irrigation_type_field_setting_wins_over_district():
    # Field explicitly marked irrigated even though its district is a known
    # rainfed zone — the field's own setting should win.
    irrigation_type, source, rainfall_class = resolve_irrigation_type("Chakwal", "irrigated")
    assert (irrigation_type, source, rainfall_class) == ("irrigated", "field_setting", None)


def test_resolve_irrigation_type_infers_rainfed_from_known_district():
    irrigation_type, source, rainfall_class = resolve_irrigation_type("Chakwal", None)
    assert (irrigation_type, source, rainfall_class) == ("rainfed", "district_default", "medium_rainfall")


def test_resolve_irrigation_type_falls_back_to_irrigated_for_unknown_district():
    irrigation_type, source, rainfall_class = resolve_irrigation_type("Faisalabad", None)
    assert (irrigation_type, source, rainfall_class) == ("irrigated", "fallback_irrigated", None)


def test_resolve_irrigation_type_rainfed_override_with_unclassified_district():
    # User says "rainfed" but the district isn't in any of SFRI's named
    # rainfed lists — must still resolve a rainfall_class, not None, or
    # _select_target_node would fall through to the irrigated tiers.
    irrigation_type, source, rainfall_class = resolve_irrigation_type("Multan", "rainfed")
    assert (irrigation_type, source, rainfall_class) == ("rainfed", "field_setting", "low_rainfall")


# --- resolve_soil_tier --------------------------------------------------------

def test_resolve_soil_tier_honors_valid_override():
    tiered = {"weak": {}, "medium": {}, "fertile": {}}
    assert resolve_soil_tier(tiered, "fertile") == ("fertile", "user_override")


def test_resolve_soil_tier_defaults_to_medium_absent_override():
    tiered = {"weak": {}, "medium": {}, "fertile": {}}
    assert resolve_soil_tier(tiered, None) == ("medium", "assumed_medium_default")


def test_resolve_soil_tier_ignores_invalid_override():
    tiered = {"weak": {}, "medium": {}, "fertile": {}}
    assert resolve_soil_tier(tiered, "bogus") == ("medium", "assumed_medium_default")


# --- _select_target_node ------------------------------------------------------

def test_select_target_node_wheat_rainfed_ignores_soil_tier():
    from app.data.sfri_fertilizer_data import SFRI_DATA

    node, soil_tier, source = _select_target_node(
        "Wheat", SFRI_DATA["Wheat"], irrigation_type="rainfed", rainfall_class="low_rainfall",
        soil_tier_override="fertile", variety=None,
    )
    assert node["N_kg_acre"] == 23
    assert soil_tier == "not_applicable"
    assert source == "not_applicable"


def test_select_target_node_wheat_irrigated_uses_soil_tier():
    from app.data.sfri_fertilizer_data import SFRI_DATA

    node, soil_tier, source = _select_target_node(
        "Wheat", SFRI_DATA["Wheat"], irrigation_type="irrigated", rainfall_class=None,
        soil_tier_override="weak", variety=None,
    )
    assert node["N_kg_acre"] == 58
    assert soil_tier == "weak"
    assert source == "user_override"


def test_select_target_node_maize_rainfed_medium_falls_back_to_high_rainfall():
    # Maize's rainfed table only has low/high buckets — a "medium_rainfall"
    # class (e.g. from Chakwal) must fall back rather than KeyError.
    from app.data.sfri_fertilizer_data import SFRI_DATA

    node, _, _ = _select_target_node(
        "Maize", SFRI_DATA["Maize"], irrigation_type="rainfed", rainfall_class="medium_rainfall",
        soil_tier_override=None, variety=None,
    )
    assert node == SFRI_DATA["Maize"]["rainfed"]["high_rainfall"]


def test_select_target_node_cotton_variety_selects_conventional():
    from app.data.sfri_fertilizer_data import SFRI_DATA

    node, soil_tier, _ = _select_target_node(
        "Cotton", SFRI_DATA["Cotton"], irrigation_type="irrigated", rainfall_class=None,
        soil_tier_override="medium", variety="conventional",
    )
    assert node == SFRI_DATA["Cotton"]["conventional"]["medium"]


def test_select_target_node_chickpea_ignores_soil_tier_and_variety():
    from app.data.sfri_fertilizer_data import SFRI_DATA

    node, soil_tier, source = _select_target_node(
        "Chickpea", SFRI_DATA["Chickpea"], irrigation_type="irrigated", rainfall_class=None,
        soil_tier_override="weak", variety="anything",
    )
    assert node == SFRI_DATA["Chickpea"]["recommendation"]
    assert (soil_tier, source) == ("not_applicable", "not_applicable")


# --- classify_evidence ---------------------------------------------------------

def test_classify_evidence_insufficient_when_no_readings():
    result = classify_evidence("Wheat", None, None, None, None)
    assert result.label == "insufficient_observation"


def test_classify_evidence_waterlogged_takes_priority():
    # NDWI above waterlog threshold AND NDRE below n-stress threshold —
    # waterlogged must win (diagnose the water issue before nutrients).
    result = classify_evidence("Wheat", ndre_mean=0.1, ndmi_mean=0.0, ndwi_mean=0.9, cci_mean=None)
    assert result.label == "waterlogged"


def test_classify_evidence_possible_n_stress():
    result = classify_evidence("Wheat", ndre_mean=0.1, ndmi_mean=0.5, ndwi_mean=0.0, cci_mean=None)
    assert result.label == "possible_n_stress"


def test_classify_evidence_possible_water_stress():
    result = classify_evidence("Wheat", ndre_mean=0.5, ndmi_mean=-0.5, ndwi_mean=None, cci_mean=None)
    assert result.label == "possible_water_stress"


def test_classify_evidence_adequate_for_nominal_values():
    result = classify_evidence("Wheat", ndre_mean=0.5, ndmi_mean=0.2, ndwi_mean=0.1, cci_mean=0.5)
    assert result.label == "adequate"


def test_classify_evidence_unknown_crop_is_insufficient():
    result = classify_evidence("Potato", ndre_mean=0.5, ndmi_mean=0.5, ndwi_mean=0.5, cci_mean=0.5)
    assert result.label == "insufficient_observation"


# --- weather_gate ---------------------------------------------------------------

def _forecast_day(days_from_today: int, precipitation_mm: float) -> ForecastDay:
    day_date = date.today() + timedelta(days=days_from_today)
    return ForecastDay(
        day="Mon", date=day_date, temp_hi=30, temp_lo=20, humidity_pct=50, wind_kmh=10,
        rain=precipitation_mm > 0, desc="", precipitation_mm=precipitation_mm,
    )


def test_weather_gate_defers_on_heavy_rain_within_3_days():
    forecast = [_forecast_day(0, 1.0), _forecast_day(1, HEAVY_RAIN_THRESHOLD_MM + 5), _forecast_day(2, 0.0)]
    deferred, reason = weather_gate(forecast)
    assert deferred is True
    assert reason


def test_weather_gate_ignores_heavy_rain_beyond_3_days():
    forecast = [_forecast_day(0, 0.0), _forecast_day(1, 0.0), _forecast_day(2, 0.0), _forecast_day(5, 100.0)]
    deferred, reason = weather_gate(forecast)
    assert deferred is False
    assert reason == ""


def test_weather_gate_calm_forecast_does_not_defer():
    forecast = [_forecast_day(0, 1.0), _forecast_day(1, 2.0), _forecast_day(2, 0.0)]
    deferred, reason = weather_gate(forecast)
    assert deferred is False


def test_weather_gate_ignores_past_days():
    # past_days entries (before today) must never trigger the gate, even
    # with heavy rain — only forward days matter for deferring application.
    forecast = [_forecast_day(-1, 100.0), _forecast_day(0, 0.0)]
    deferred, _ = weather_gate(forecast)
    assert deferred is False
