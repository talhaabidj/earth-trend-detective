# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
"""Trend statistics for monthly Earth science series.

Methods: seasonal Mann-Kendall test (Hirsch, Slack & Smith 1982), seasonal Sen slope with a
confidence interval (Sen 1968; Gilbert 1987), least-squares slope on anomalies with an
autocorrelation-adjusted sample size (Santer et al. 2000), and the years of data needed to detect
a trend (Weatherhead et al. 1998). The browser copy in web/js/stats.js must give the same numbers;
tests/test_js_parity.py checks that.
"""

from dataclasses import dataclass, asdict
from math import erf, sqrt

import numpy as np
from scipy import stats as scipy_stats

MONTHS_PER_YEAR = 12
Z_95 = 1.959963984540054
MIN_YEARS_FOR_TEST = 10
MIN_COVERAGE = 0.7


def normal_two_sided_p(z):
    return 2.0 * (1.0 - 0.5 * (1.0 + erf(abs(z) / sqrt(2.0))))


def mann_kendall_s_and_var(values):
    """S statistic and its variance (with tie correction) for one sequence, NaNs dropped."""
    x = np.asarray([v for v in values if v is not None and not np.isnan(v)], dtype=float)
    n = len(x)
    if n < 2:
        return 0.0, 0.0, n
    diffs = np.sign(x[None, :] - x[:, None])
    s = float(np.triu(diffs, k=1).sum())
    _, tie_counts = np.unique(x, return_counts=True)
    tie_term = float(np.sum(tie_counts * (tie_counts - 1) * (2 * tie_counts + 5)))
    var = (n * (n - 1) * (2 * n + 5) - tie_term) / 18.0
    return s, var, n


def z_from_s(s, var):
    if var <= 0:
        return 0.0
    if s > 0:
        return (s - 1) / sqrt(var)
    if s < 0:
        return (s + 1) / sqrt(var)
    return 0.0


def split_by_month(times, values):
    """Group (year, value) pairs by calendar month. times are (year, month) tuples."""
    groups = {m: [] for m in range(1, 13)}
    for (year, month), value in zip(times, values):
        if value is not None and not np.isnan(value):
            groups[month].append((year, float(value)))
    return groups


def seasonal_mann_kendall(times, values):
    total_s = 0.0
    total_var = 0.0
    for month_values in split_by_month(times, values).values():
        month_values.sort()
        s, var, _ = mann_kendall_s_and_var([v for _, v in month_values])
        total_s += s
        total_var += var
    z = z_from_s(total_s, total_var)
    return {"s": total_s, "var_s": total_var, "z": z, "p": normal_two_sided_p(z)}


def seasonal_sen_slope(times, values, var_s):
    """Median of within-month pairwise slopes, in units per year, with a 95% interval."""
    slopes = []
    for month_values in split_by_month(times, values).values():
        month_values.sort()
        for i in range(len(month_values)):
            year_i, value_i = month_values[i]
            for j in range(i + 1, len(month_values)):
                year_j, value_j = month_values[j]
                if year_j != year_i:
                    slopes.append((value_j - value_i) / (year_j - year_i))
    if not slopes:
        return {"slope": float("nan"), "low": float("nan"), "high": float("nan")}
    slopes = np.sort(np.asarray(slopes))
    count = len(slopes)
    c_alpha = Z_95 * sqrt(var_s) if var_s > 0 else 0.0
    lower_rank = int(round((count - c_alpha) / 2.0))
    upper_rank = int(round((count + c_alpha) / 2.0)) + 1
    lower_rank = min(max(lower_rank, 1), count)
    upper_rank = min(max(upper_rank, 1), count)
    return {
        "slope": float(np.median(slopes)),
        "low": float(slopes[lower_rank - 1]),
        "high": float(slopes[upper_rank - 1]),
    }


def monthly_climatology(times, values):
    climatology = {}
    for month, month_values in split_by_month(times, values).items():
        climatology[month] = float(np.mean([v for _, v in month_values])) if month_values else float("nan")
    return climatology


def anomalies(times, values, climatology):
    result = []
    for (_, month), value in zip(times, values):
        if value is None or np.isnan(value):
            result.append(float("nan"))
        else:
            result.append(float(value) - climatology[month])
    return result


def lag1_autocorrelation(residuals):
    r = np.asarray(residuals, dtype=float)
    pairs = [(a, b) for a, b in zip(r[:-1], r[1:]) if not (np.isnan(a) or np.isnan(b))]
    if len(pairs) < 3:
        return 0.0
    a = np.array([p[0] for p in pairs])
    b = np.array([p[1] for p in pairs])
    mean = np.nanmean(r)
    denominator = np.nansum((r - mean) ** 2)
    if denominator == 0:
        return 0.0
    return float(np.sum((a - mean) * (b - mean)) / denominator)


def ols_with_autocorrelation(decimal_years, anomaly_values):
    """Least-squares slope (units per year) with effective n = n(1 - r1)/(1 + r1)."""
    t = np.asarray(decimal_years, dtype=float)
    y = np.asarray(anomaly_values, dtype=float)
    keep = ~np.isnan(y)
    t, y = t[keep], y[keep]
    n = len(y)
    t_mean = t.mean()
    sxx = np.sum((t - t_mean) ** 2)
    slope = float(np.sum((t - t_mean) * (y - y.mean())) / sxx)
    intercept = float(y.mean() - slope * t_mean)
    residuals_full = np.full(len(keep), np.nan)
    residuals_full[keep] = y - (intercept + slope * t)
    r1 = lag1_autocorrelation(residuals_full)
    r1_used = min(max(r1, 0.0), 0.99)
    n_eff = n * (1 - r1_used) / (1 + r1_used)
    residual_sd = float(np.sqrt(np.sum((y - (intercept + slope * t)) ** 2) / (n - 2)))
    if n_eff > 3:
        standard_error = residual_sd / np.sqrt(sxx) * np.sqrt((n - 2) / (n_eff - 2))
        t_stat = slope / standard_error
        p = float(2 * scipy_stats.t.sf(abs(t_stat), df=n_eff - 2))
        t_crit = float(scipy_stats.t.ppf(0.975, df=n_eff - 2))
        low, high = slope - t_crit * standard_error, slope + t_crit * standard_error
    else:
        standard_error, p, low, high = float("nan"), float("nan"), float("nan"), float("nan")
    return {
        "slope": slope,
        "intercept": intercept,
        "low": float(low),
        "high": float(high),
        "p": p,
        "r1": r1,
        "n": int(n),
        "n_eff": float(n_eff),
        "residual_sd": residual_sd,
    }


def years_to_detect(noise_sd, trend_per_year, phi):
    """Weatherhead et al. (1998), eq. 3: years of monthly data for a 90% chance of detecting
    the trend at the 5% level, given monthly noise sd and lag-1 autocorrelation phi."""
    if trend_per_year == 0 or np.isnan(trend_per_year):
        return float("inf")
    phi = min(max(phi, 0.0), 0.99)
    return float(((3.3 * noise_sd / abs(trend_per_year)) * sqrt((1 + phi) / (1 - phi))) ** (2.0 / 3.0))


@dataclass
class TrendResult:
    n_months: int
    n_valid: int
    first_year: int
    last_year: int
    record_years: float
    coverage: float
    mk_s: float
    mk_z: float
    mk_p: float
    sen_slope_per_year: float
    sen_low_per_year: float
    sen_high_per_year: float
    ols_slope_per_year: float
    ols_low_per_year: float
    ols_high_per_year: float
    ols_p: float
    lag1_autocorrelation: float
    effective_n: float
    noise_sd: float
    years_needed: float
    extra_years_needed: float
    verdict: str
    flags: list

    def to_dict(self):
        return asdict(self)


def decide_verdict(mk_p, ols_p, record_years, coverage, extra_years_needed):
    """One of: rising/falling (clear), mixed, not_yet, none, too_short."""
    if record_years < MIN_YEARS_FOR_TEST or coverage < MIN_COVERAGE:
        return "too_short"
    mk_significant = mk_p < 0.05
    ols_significant = not np.isnan(ols_p) and ols_p < 0.05
    if mk_significant and ols_significant:
        return "clear"
    if mk_significant or ols_significant:
        return "mixed"
    if extra_years_needed <= 50:
        return "not_yet"
    return "none"


def analyse(times, values):
    """Full analysis of a monthly series. times: list of (year, month); values: floats or None."""
    clean = [float("nan") if v is None else float(v) for v in values]
    n_months = len(clean)
    valid = [v for v in clean if not np.isnan(v)]
    first_year, last_year = times[0][0], times[-1][0]
    record_years = n_months / MONTHS_PER_YEAR
    coverage = len(valid) / n_months if n_months else 0.0

    mk = seasonal_mann_kendall(times, clean)
    sen = seasonal_sen_slope(times, clean, mk["var_s"])
    climatology = monthly_climatology(times, clean)
    anomaly_values = anomalies(times, clean, climatology)
    decimal_years = [year + (month - 0.5) / 12.0 for year, month in times]
    ols = ols_with_autocorrelation(decimal_years, anomaly_values)

    # Weatherhead et al. is a regression method, and the Sen slope is often exactly 0 for
    # rounded or zero-heavy data, so the least-squares slope is used here.
    needed = years_to_detect(ols["residual_sd"], ols["slope"], ols["r1"])
    extra = max(0.0, needed - record_years)

    flags = []
    if record_years < MIN_YEARS_FOR_TEST:
        flags.append("short_record")
    if coverage < MIN_COVERAGE:
        flags.append("low_coverage")
    if ols["r1"] > 0.5:
        flags.append("strong_autocorrelation")
    if sen["slope"] == 0 and ols["slope"] != 0:
        flags.append("median_slope_zero")

    verdict = decide_verdict(mk["p"], ols["p"], record_years, coverage, extra)
    return TrendResult(
        n_months=n_months,
        n_valid=len(valid),
        first_year=first_year,
        last_year=last_year,
        record_years=record_years,
        coverage=coverage,
        mk_s=mk["s"],
        mk_z=mk["z"],
        mk_p=mk["p"],
        sen_slope_per_year=sen["slope"],
        sen_low_per_year=sen["low"],
        sen_high_per_year=sen["high"],
        ols_slope_per_year=ols["slope"],
        ols_low_per_year=ols["low"],
        ols_high_per_year=ols["high"],
        ols_p=ols["p"],
        lag1_autocorrelation=ols["r1"],
        effective_n=ols["n_eff"],
        noise_sd=ols["residual_sd"],
        years_needed=needed,
        extra_years_needed=extra,
        verdict=verdict,
        flags=flags,
    ), climatology, anomaly_values
