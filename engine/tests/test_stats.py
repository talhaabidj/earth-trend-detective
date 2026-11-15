import math
import random

import numpy as np
import pymannkendall
import pytest

from trend import stats
from trend.modis import monthly_averages, picture_value
from trend.power import area_average, to_rows


def make_series(years=30, trend_per_year=0.05, noise=0.5, seed=1):
    """Fake monthly data: a seasonal cycle, a known trend and random noise."""
    random.seed(seed)
    rows = []
    for i in range(years * 12):
        year, month = 1990 + i // 12, i % 12 + 1
        season = 10 * math.sin(2 * math.pi * (month - 1) / 12)
        time = year - 1990 + (month - 0.5) / 12
        rows.append((year, month, season + trend_per_year * time + random.gauss(0, noise)))
    return rows


def values_of(rows):
    return [value for _, _, value in rows]


def test_mann_kendall_matches_pymannkendall_with_ties():
    random.seed(3)
    values = [round(random.gauss(0, 1), 1) for _ in range(40)]  # rounding makes ties
    score, variance = stats.mann_kendall_score(values)
    expected = pymannkendall.original_test(values)
    assert score == pytest.approx(expected.s)
    assert variance == pytest.approx(expected.var_s)
    z = stats.z_score(score, variance)
    assert z == pytest.approx(expected.z)
    assert stats.two_sided_p_from_z(z) == pytest.approx(expected.p)


def test_seasonal_mann_kendall_matches_pymannkendall():
    rows = make_series()
    ours = stats.seasonal_mann_kendall(rows)
    expected = pymannkendall.seasonal_test(values_of(rows), period=12)
    assert ours["score"] == pytest.approx(expected.s)
    assert ours["variance"] == pytest.approx(expected.var_s)
    assert ours["p"] == pytest.approx(expected.p)


def test_seasonal_sen_slope_matches_pymannkendall():
    rows = make_series()
    mk = stats.seasonal_mann_kendall(rows)
    sen = stats.seasonal_sen_slope(rows, mk["variance"])
    expected = pymannkendall.seasonal_sens_slope(np.array(values_of(rows)), period=12)
    assert sen["slope"] == pytest.approx(expected.slope)  # per year, since one step = one year
    assert sen["low"] < sen["slope"] < sen["high"]


def test_finds_a_known_trend():
    result, _, _ = stats.analyse(make_series(trend_per_year=0.05, noise=0.5))
    assert result["sen_slope"] == pytest.approx(0.05, abs=0.01)
    assert result["sen_low"] < 0.05 < result["sen_high"]
    assert result["line_low"] < 0.05 < result["line_high"]
    assert result["verdict"] == "clear"


def test_finds_no_trend_in_pure_noise():
    result, _, _ = stats.analyse(make_series(trend_per_year=0, noise=1, seed=7))
    assert result["mk_p"] > 0.05
    assert result["verdict"] in ("not_yet", "none")


def test_refuses_a_short_record():
    result, _, _ = stats.analyse(make_series(years=6))
    assert result["verdict"] == "too_short"
    assert "short_record" in result["warnings"]


def test_missing_months_stay_missing():
    rows = make_series()
    rows[5] = (rows[5][0], rows[5][1], None)
    rows[100] = (rows[100][0], rows[100][1], math.nan)
    result, _, anomaly_values = stats.analyse(rows)
    assert result["valid_months"] == len(rows) - 2
    assert math.isnan(anomaly_values[5]) and math.isnan(anomaly_values[100])


def test_years_needed_grows_with_noise_and_memory():
    base = stats.years_needed(1.0, 0.05, 0.0)
    assert stats.years_needed(2.0, 0.05, 0.0) > base
    assert stats.years_needed(1.0, 0.05, 0.6) > base
    assert stats.years_needed(1.0, 0.0, 0.0) == math.inf


def test_rounded_data_still_gets_a_years_estimate():
    rows = [(y, m, round(v / 10, 1)) for y, m, v in make_series(trend_per_year=0.004, noise=0.02, seed=5)]
    result, _, _ = stats.analyse(rows)
    if result["sen_slope"] == 0:
        assert "median_slope_zero" in result["warnings"]
    assert math.isfinite(result["years_needed"])


def test_mostly_zero_data_is_never_a_clear_verdict():
    # Zero in most months, with a few rising winter values (like frost days in a warm place).
    rows = [(y, m, float(y - 1990) if m == 1 else 0.0) for y in range(1990, 2020) for m in range(1, 13)]
    result, _, _ = stats.analyse(rows)
    assert "mostly_zero" in result["warnings"]
    assert result["verdict"] != "clear"


def test_power_rows_drop_month_13_and_missing_values():
    raw = {"200001": 1.0, "200002": -999.0, "200013": 5.0, "200003": 2.0}
    assert to_rows(raw) == [(2000, 1, 1.0), (2000, 2, None), (2000, 3, 2.0)]


def test_area_average_counts_cells_by_cosine_of_latitude():
    cells = [
        {"geometry": {"coordinates": [0, 0, 0]}, "properties": {"parameter": {"T2M": {"200001": 10.0}}}},
        {"geometry": {"coordinates": [0, 60, 0]}, "properties": {"parameter": {"T2M": {"200001": 20.0}}}},
    ]
    assert area_average(cells, "T2M") == [(2000, 1, pytest.approx((10 * 1 + 20 * 0.5) / 1.5))]


def test_modis_pictures_become_monthly_averages():
    assert picture_value([5000, 6000, -3000]) == pytest.approx(0.55)
    assert picture_value([-3000, -3000, 5000]) is None
    averages = monthly_averages([("2001-01-01", 0.2), ("2001-01-17", 0.4), ("2001-02-02", None)])
    assert averages == {(2001, 1): pytest.approx(0.3)}
