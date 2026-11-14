# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
import math

import numpy as np
import pymannkendall
import pytest

from trend import stats
from trend.power import parse_monthly, area_weighted_mean


def monthly_times(first_year, years):
    return [(first_year + i // 12, i % 12 + 1) for i in range(years * 12)]


def synthetic_series(years=30, trend_per_year=0.05, noise_sd=0.5, seed=1):
    rng = np.random.default_rng(seed)
    times = monthly_times(1990, years)
    seasonal = [10 * math.sin(2 * math.pi * (m - 1) / 12) for _, m in times]
    values = [s + trend_per_year * (y - 1990 + (m - 0.5) / 12) + rng.normal(0, noise_sd)
              for s, (y, m) in zip(seasonal, times)]
    return times, values


def test_mann_kendall_s_matches_pymannkendall():
    rng = np.random.default_rng(3)
    x = list(np.round(rng.normal(size=40), 1))  # rounding creates ties
    s, var, _ = stats.mann_kendall_s_and_var(x)
    reference = pymannkendall.original_test(x)
    assert s == pytest.approx(reference.s)
    assert var == pytest.approx(reference.var_s)
    z = stats.z_from_s(s, var)
    assert z == pytest.approx(reference.z)
    assert stats.normal_two_sided_p(z) == pytest.approx(reference.p)


def test_seasonal_mann_kendall_matches_pymannkendall():
    times, values = synthetic_series()
    ours = stats.seasonal_mann_kendall(times, values)
    reference = pymannkendall.seasonal_test(values, period=12)
    assert ours["s"] == pytest.approx(reference.s)
    assert ours["var_s"] == pytest.approx(reference.var_s)
    assert ours["p"] == pytest.approx(reference.p)


def test_seasonal_sen_slope_matches_pymannkendall():
    times, values = synthetic_series()
    mk = stats.seasonal_mann_kendall(times, values)
    sen = stats.seasonal_sen_slope(times, values, mk["var_s"])
    reference = pymannkendall.seasonal_sens_slope(np.asarray(values), period=12)
    # pymannkendall reports the slope per season step (one year here).
    assert sen["slope"] == pytest.approx(reference.slope)
    assert sen["low"] < sen["slope"] < sen["high"]


def test_recovers_known_trend():
    times, values = synthetic_series(trend_per_year=0.05, noise_sd=0.5)
    result, _, _ = stats.analyse(times, values)
    assert result.sen_slope_per_year == pytest.approx(0.05, abs=0.01)
    assert result.sen_low_per_year < 0.05 < result.sen_high_per_year
    assert result.ols_low_per_year < 0.05 < result.ols_high_per_year
    assert result.verdict == "clear"


def test_no_trend_in_pure_noise():
    times, values = synthetic_series(trend_per_year=0.0, noise_sd=1.0, seed=7)
    result, _, _ = stats.analyse(times, values)
    assert result.mk_p > 0.05
    assert result.verdict in ("not_yet", "none")


def test_short_record_is_flagged():
    times, values = synthetic_series(years=6)
    result, _, _ = stats.analyse(times, values)
    assert result.verdict == "too_short"
    assert "short_record" in result.flags


def test_gaps_are_skipped_not_filled():
    times, values = synthetic_series()
    values[5] = None
    values[100] = float("nan")
    result, _, anomaly_values = stats.analyse(times, values)
    assert result.n_valid == len(values) - 2
    assert math.isnan(anomaly_values[5]) and math.isnan(anomaly_values[100])


def test_years_to_detect_grows_with_noise_and_autocorrelation():
    base = stats.years_to_detect(1.0, 0.05, 0.0)
    assert stats.years_to_detect(2.0, 0.05, 0.0) > base
    assert stats.years_to_detect(1.0, 0.05, 0.6) > base
    assert stats.years_to_detect(1.0, 0.0, 0.0) == math.inf


def test_power_parser_drops_month_13_and_fill_values():
    raw = {"200001": 1.0, "200002": -999.0, "200013": 5.0, "200003": 2.0}
    assert parse_monthly(raw) == [((2000, 1), 1.0), ((2000, 2), None), ((2000, 3), 2.0)]


def test_area_weighted_mean_uses_cosine_latitude():
    features = [
        {"geometry": {"coordinates": [0, 0, 0]}, "properties": {"parameter": {"T2M": {"200001": 10.0}}}},
        {"geometry": {"coordinates": [0, 60, 0]}, "properties": {"parameter": {"T2M": {"200001": 20.0}}}},
    ]
    (_, value), = area_weighted_mean(features, "T2M")
    assert value == pytest.approx((10 * 1 + 20 * 0.5) / 1.5)


def test_rounded_data_flags_zero_median_slope_but_keeps_years_estimate():
    times, values = synthetic_series(trend_per_year=0.004, noise_sd=0.02, seed=5)
    rounded = [round(v / 10, 1) for v in values]  # coarse rounding creates many ties
    result, _, _ = stats.analyse(times, rounded)
    if result.sen_slope_per_year == 0:
        assert "median_slope_zero" in result.flags
    assert math.isfinite(result.years_needed)


def test_modis_composites_to_monthly_means():
    from trend.modis import composite_value, monthly_means
    assert composite_value([5000, 6000, -3000]) == pytest.approx(0.55)
    assert composite_value([-3000, -3000, 5000]) is None
    means = monthly_means([("2001-01-01", 0.2), ("2001-01-17", 0.4), ("2001-02-02", None)])
    assert means == {(2001, 1): pytest.approx(0.3)}
