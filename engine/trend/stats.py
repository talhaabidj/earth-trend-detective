"""Trend tests for monthly data.

A series is a list of (year, month, value) rows. A missing value is None.

We run two tests and only say "yes, there is a trend" when both agree:
1. Seasonal Mann-Kendall test, with the Sen slope as the rate (Hirsch, Slack and Smith 1982).
2. A straight-line fit to the anomalies that allows for month-to-month memory (Santer et al. 2000).

web/js/stats.js does the same in the browser. tests/test_js_parity.py checks they agree.
"""

import math

from scipy import stats as scipy_stats

Z_FOR_95_PERCENT = 1.959963984540054
MIN_YEARS = 10
MIN_SHARE_VALID = 0.7
MAX_MORE_YEARS_FOR_NOT_YET = 50


def is_missing(value):
    return value is None or math.isnan(value)


def two_sided_p_from_z(z):
    return 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))


# --- Test 1: seasonal Mann-Kendall ---------------------------------------------------------

def mann_kendall_score(values):
    """Count of rises minus falls over all pairs, and its variance (with the tie correction)."""
    values = [v for v in values if not is_missing(v)]
    count = len(values)
    score = 0
    for i in range(count):
        for j in range(i + 1, count):
            if values[j] > values[i]:
                score += 1
            elif values[j] < values[i]:
                score -= 1

    tie_sizes = {}
    for v in values:
        tie_sizes[v] = tie_sizes.get(v, 0) + 1
    tie_part = sum(t * (t - 1) * (2 * t + 5) for t in tie_sizes.values())
    variance = (count * (count - 1) * (2 * count + 5) - tie_part) / 18
    return score, variance


def z_score(score, variance):
    if variance <= 0 or score == 0:
        return 0.0
    if score > 0:
        return (score - 1) / math.sqrt(variance)
    return (score + 1) / math.sqrt(variance)


def rows_by_month(rows):
    """Group the rows into 12 lists of (year, value), one per calendar month, missing values left out."""
    months = {month: [] for month in range(1, 13)}
    for year, month, value in rows:
        if not is_missing(value):
            months[month].append((year, value))
    for month_rows in months.values():
        month_rows.sort()
    return months


def seasonal_mann_kendall(rows):
    total_score = 0
    total_variance = 0
    for month_rows in rows_by_month(rows).values():
        score, variance = mann_kendall_score([value for _, value in month_rows])
        total_score += score
        total_variance += variance
    z = z_score(total_score, total_variance)
    return {"score": total_score, "variance": total_variance, "z": z, "p": two_sided_p_from_z(z)}


def seasonal_sen_slope(rows, mk_variance):
    """Median slope (units per year) over all pairs of the same calendar month, with a 95% range."""
    slopes = []
    for month_rows in rows_by_month(rows).values():
        for i in range(len(month_rows)):
            for j in range(i + 1, len(month_rows)):
                (year_a, value_a), (year_b, value_b) = month_rows[i], month_rows[j]
                slopes.append((value_b - value_a) / (year_b - year_a))
    if not slopes:
        return {"slope": math.nan, "low": math.nan, "high": math.nan}

    slopes.sort()
    count = len(slopes)
    # Gilbert (1987): the 95% range is read from the sorted slopes at these ranks.
    spread = Z_FOR_95_PERCENT * math.sqrt(mk_variance) if mk_variance > 0 else 0
    low_rank = min(max(round((count - spread) / 2), 1), count)
    high_rank = min(max(round((count + spread) / 2) + 1, 1), count)
    return {"slope": median(slopes), "low": slopes[low_rank - 1], "high": slopes[high_rank - 1]}


def median(sorted_values):
    middle = len(sorted_values) // 2
    if len(sorted_values) % 2:
        return sorted_values[middle]
    return (sorted_values[middle - 1] + sorted_values[middle]) / 2


# --- Seasons and anomalies ------------------------------------------------------------------

def usual_month_values(rows):
    """Average value for each calendar month (the seasonal cycle). Key 1 is January."""
    usual = {}
    for month, month_rows in rows_by_month(rows).items():
        values = [value for _, value in month_rows]
        usual[month] = sum(values) / len(values) if values else math.nan
    return usual


def anomalies(rows, usual):
    """Each month's value minus the usual value for that month. Missing stays missing (nan)."""
    return [math.nan if is_missing(value) else value - usual[month] for _, month, value in rows]


# --- Test 2: straight line with an autocorrelation correction --------------------------------

def lag1_autocorrelation(values):
    """How much each month's value is like the month before (0 = not at all, 1 = the same)."""
    valid = [v for v in values if not math.isnan(v)]
    pairs = [(a, b) for a, b in zip(values, values[1:]) if not (math.isnan(a) or math.isnan(b))]
    if len(pairs) < 3:
        return 0.0
    mean = sum(valid) / len(valid)
    spread = sum((v - mean) ** 2 for v in valid)
    if spread == 0:
        return 0.0
    return sum((a - mean) * (b - mean) for a, b in pairs) / spread


def line_fit(times, values):
    """Least-squares straight line through the valid points. Returns slope, intercept and sums."""
    points = [(t, v) for t, v in zip(times, values) if not math.isnan(v)]
    count = len(points)
    mean_t = sum(t for t, _ in points) / count
    mean_v = sum(v for _, v in points) / count
    spread_t = sum((t - mean_t) ** 2 for t, _ in points)
    slope = sum((t - mean_t) * (v - mean_v) for t, v in points) / spread_t
    intercept = mean_v - slope * mean_t
    return slope, intercept, points, spread_t


def line_test(times, anomaly_values):
    """Straight-line trend (units per year) tested with fewer 'effective' months when the data
    has month-to-month memory: effective = months x (1 - r) / (1 + r)."""
    if sum(not math.isnan(v) for v in anomaly_values) < 3:
        nan = math.nan
        return {"slope": nan, "intercept": nan, "low": nan, "high": nan, "p": nan,
                "autocorrelation": 0.0, "effective_months": 0.0, "noise_sd": nan}
    slope, intercept, points, spread_t = line_fit(times, anomaly_values)
    count = len(points)
    leftovers = [math.nan if math.isnan(v) else v - (intercept + slope * t) for t, v in zip(times, anomaly_values)]
    r = lag1_autocorrelation(leftovers)
    r_used = min(max(r, 0.0), 0.99)
    effective_months = count * (1 - r_used) / (1 + r_used)
    noise_sd = math.sqrt(sum((v - (intercept + slope * t)) ** 2 for t, v in points) / (count - 2))

    p, low, high = math.nan, math.nan, math.nan
    if effective_months > 3 and noise_sd > 0:
        degrees = effective_months - 2
        standard_error = noise_sd / math.sqrt(spread_t) * math.sqrt((count - 2) / degrees)
        p = float(2 * scipy_stats.t.sf(abs(slope / standard_error), degrees))
        t_95 = float(scipy_stats.t.ppf(0.975, degrees))
        low, high = slope - t_95 * standard_error, slope + t_95 * standard_error

    return {
        "slope": slope, "intercept": intercept, "low": low, "high": high, "p": p,
        "autocorrelation": r, "effective_months": effective_months, "noise_sd": noise_sd,
    }


# --- How many more years? -------------------------------------------------------------------

def years_needed(noise_sd, slope_per_year, autocorrelation):
    """Weatherhead et al. (1998): years of monthly data for a 90% chance of a significant
    result (5% level) if the trend keeps going at this rate."""
    if slope_per_year == 0 or math.isnan(slope_per_year):
        return math.inf
    r = min(max(autocorrelation, 0.0), 0.99)
    years = ((3.3 * noise_sd / abs(slope_per_year)) * math.sqrt((1 + r) / (1 - r))) ** (2 / 3)
    # Beyond 10,000 years the slope is zero for all practical purposes.
    return years if years <= 10000 else math.inf


# --- Putting it together --------------------------------------------------------------------

def pick_verdict(mk_p, line_p, years_of_data, share_valid, more_years):
    if years_of_data < MIN_YEARS or share_valid < MIN_SHARE_VALID:
        return "too_short"
    mk_says_yes = mk_p < 0.05
    line_says_yes = not math.isnan(line_p) and line_p < 0.05
    if mk_says_yes and line_says_yes:
        return "clear"
    if mk_says_yes or line_says_yes:
        return "mixed"
    if more_years <= MAX_MORE_YEARS_FOR_NOT_YET:
        return "not_yet"
    return "none"


def special_result(rows, valid_months, share_valid, verdict):
    """The result when no test can be run. Every statistic is NaN."""
    nan = math.nan
    return {
        "months": len(rows), "valid_months": valid_months,
        "first_year": rows[0][0], "last_year": rows[-1][0],
        "years_of_data": len(rows) / 12, "share_valid": share_valid,
        "mk_score": nan, "mk_z": nan, "mk_p": nan,
        "sen_slope": nan, "sen_low": nan, "sen_high": nan,
        "line_slope": nan, "line_low": nan, "line_high": nan, "line_p": nan,
        "autocorrelation": nan, "effective_months": nan, "noise_sd": nan,
        "years_needed": nan, "more_years_needed": nan,
        "verdict": verdict, "warnings": [],
    }


def analyse(rows):
    """Run both tests on (year, month, value) rows. Returns (result, usual month values, anomalies)."""
    rows = [(year, month, math.nan if value is None else float(value)) for year, month, value in rows]
    months = len(rows)
    valid_months = sum(not math.isnan(value) for _, _, value in rows)
    years_of_data = months / 12
    share_valid = valid_months / months if months else 0.0

    usual = usual_month_values(rows)
    anomaly_values = anomalies(rows, usual)
    valid_values = [value for _, _, value in rows if not math.isnan(value)]

    # Two cases where a trend test makes no sense: no data at all, or a value that never changes
    # (for example soil wetness over the ocean is always 1).
    special = None
    if not valid_values:
        special = "no_data"
    elif max(valid_values) == min(valid_values):
        special = "constant"
    if special:
        return special_result(rows, valid_months, share_valid, special), usual, anomaly_values

    mk = seasonal_mann_kendall(rows)
    sen = seasonal_sen_slope(rows, mk["variance"])
    times = [year + (month - 0.5) / 12 for year, month, _ in rows]
    line = line_test(times, anomaly_values)

    # The straight-line slope is used here: the Weatherhead method is built on it, and the Sen
    # slope is often exactly 0 for rounded data.
    needed = years_needed(line["noise_sd"], line["slope"], line["autocorrelation"])
    more_years = max(0.0, needed - years_of_data)

    warnings = []
    if years_of_data < MIN_YEARS:
        warnings.append("short_record")
    if share_valid < MIN_SHARE_VALID:
        warnings.append("many_missing")
    if line["autocorrelation"] > 0.5:
        warnings.append("strong_memory")
    if sen["slope"] == 0 and line["slope"] != 0:
        warnings.append("median_slope_zero")
    if 2 * sum(value == 0 for value in valid_values) > len(valid_values):
        warnings.append("mostly_zero")

    result = {
        "months": months,
        "valid_months": valid_months,
        "first_year": rows[0][0],
        "last_year": rows[-1][0],
        "years_of_data": years_of_data,
        "share_valid": share_valid,
        "mk_score": mk["score"],
        "mk_z": mk["z"],
        "mk_p": mk["p"],
        "sen_slope": sen["slope"],
        "sen_low": sen["low"],
        "sen_high": sen["high"],
        "line_slope": line["slope"],
        "line_low": line["low"],
        "line_high": line["high"],
        "line_p": line["p"],
        "autocorrelation": line["autocorrelation"],
        "effective_months": line["effective_months"],
        "noise_sd": line["noise_sd"],
        "years_needed": needed,
        "more_years_needed": more_years,
        "verdict": pick_verdict(mk["p"], line["p"], years_of_data, share_valid, more_years),
        "warnings": warnings,
    }
    # With mostly zeros the tests rest on a few months, so the answer is at best "maybe".
    if "mostly_zero" in warnings and result["verdict"] == "clear":
        result["verdict"] = "mixed"
    return result, usual, anomaly_values
