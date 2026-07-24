from datetime import date, timedelta

import pytest

from app.exceptions.custom_exceptions import InvalidDateRangeError
from app.services.satellite.ndvi_processor import (
    MAX_SEARCH_WINDOW_DAYS,
    MIN_SEARCH_WINDOW_DAYS,
    validate_search_window,
)


def test_both_none_is_valid():
    validate_search_window(None, None)  # no exception — falls back to the global default


def test_only_start_date_given_raises():
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(date.today() - timedelta(days=30), None)


def test_only_end_date_given_raises():
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(None, date.today())


def test_end_before_start_raises():
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(date.today(), date.today() - timedelta(days=1))


def test_end_equals_start_raises():
    today = date.today()
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(today, today)


def test_window_too_short_raises():
    end = date.today()
    start = end - timedelta(days=MIN_SEARCH_WINDOW_DAYS - 1)
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(start, end)


def test_window_too_long_raises():
    end = date.today()
    start = end - timedelta(days=MAX_SEARCH_WINDOW_DAYS + 1)
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(start, end)


def test_valid_30_day_range_passes():
    end = date.today()
    start = end - timedelta(days=30)
    validate_search_window(start, end)  # no exception


def test_end_date_in_future_raises():
    # +1 day is tolerated (client-local "today" can be a day ahead of UTC),
    # so this must clear that skew allowance to actually be "in the future".
    end = date.today() + timedelta(days=2)
    start = end - timedelta(days=30)
    with pytest.raises(InvalidDateRangeError):
        validate_search_window(start, end)
