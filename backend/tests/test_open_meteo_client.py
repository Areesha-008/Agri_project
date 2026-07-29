from datetime import date, timedelta

from app.services.weather import open_meteo_client as client


class _FakeResponse:
    def __init__(self, json_data):
        self._json_data = json_data

    def raise_for_status(self):
        pass

    def json(self):
        return self._json_data


def _fake_daily_payload(n_days: int, start_date: str = "2026-08-01") -> dict:
    start = date.fromisoformat(start_date)
    dates = [(start + timedelta(days=i)).isoformat() for i in range(n_days)]
    return {
        "daily": {
            "time": dates,
            "temperature_2m_max": [30.0] * n_days,
            "temperature_2m_min": [20.0] * n_days,
            "relative_humidity_2m_mean": [50.0] * n_days,
            "wind_speed_10m_max": [10.0] * n_days,
            "precipitation_sum": [5.5] * n_days,
            "weathercode": [1] * n_days,
        }
    }


def test_get_forecast_populates_precipitation_mm(monkeypatch):
    client._cache.clear()
    captured = {}

    def fake_get(url, params, timeout):
        captured["params"] = params
        return _FakeResponse(_fake_daily_payload(n_days=7))

    monkeypatch.setattr(client.requests, "get", fake_get)

    forecast = client.get_forecast(31.5, 74.3)
    assert all(day.precipitation_mm == 5.5 for day in forecast)
    assert "past_days" not in captured["params"]


def test_get_forecast_passes_past_days_when_requested(monkeypatch):
    client._cache.clear()
    captured = {}

    def fake_get(url, params, timeout):
        captured["params"] = params
        return _FakeResponse(_fake_daily_payload(n_days=14))

    monkeypatch.setattr(client.requests, "get", fake_get)

    client.get_forecast(31.5, 74.3, past_days=7)
    assert captured["params"]["past_days"] == 7


def test_get_forecast_omits_past_days_param_when_zero(monkeypatch):
    client._cache.clear()
    captured = {}

    def fake_get(url, params, timeout):
        captured["params"] = params
        return _FakeResponse(_fake_daily_payload(n_days=7))

    monkeypatch.setattr(client.requests, "get", fake_get)

    client.get_forecast(31.5, 74.3, past_days=0)
    assert "past_days" not in captured["params"]


def test_get_forecast_cache_key_differentiates_past_days(monkeypatch):
    client._cache.clear()
    call_count = {"n": 0}

    def fake_get(url, params, timeout):
        call_count["n"] += 1
        n_days = 14 if "past_days" in params else 7
        return _FakeResponse(_fake_daily_payload(n_days=n_days))

    monkeypatch.setattr(client.requests, "get", fake_get)

    client.get_forecast(10.0, 20.0, past_days=0)
    client.get_forecast(10.0, 20.0, past_days=7)
    # Second call must hit the API again, not be served from the first
    # call's cache entry — they're different requests.
    assert call_count["n"] == 2


def test_get_forecast_second_identical_call_is_cached(monkeypatch):
    client._cache.clear()
    call_count = {"n": 0}

    def fake_get(url, params, timeout):
        call_count["n"] += 1
        return _FakeResponse(_fake_daily_payload(n_days=7))

    monkeypatch.setattr(client.requests, "get", fake_get)

    client.get_forecast(15.0, 25.0, past_days=0)
    client.get_forecast(15.0, 25.0, past_days=0)
    assert call_count["n"] == 1
