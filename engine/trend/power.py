# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
"""NASA POWER monthly data (MERRA-2 and CERES based), no login needed.

POWER returns a 13th "month" per year that is the annual value, and uses -999 for missing data.
Both are removed here. Docs: https://power.larc.nasa.gov/docs/services/api/
"""

import math

import requests

POWER_BASE = "https://power.larc.nasa.gov/api/temporal/monthly"
FILL_VALUE = -999.0
TIMEOUT_SECONDS = 60


def point_url(parameter, latitude, longitude, start_year, end_year):
    return (
        f"{POWER_BASE}/point?parameters={parameter}&community=AG"
        f"&longitude={longitude}&latitude={latitude}&start={start_year}&end={end_year}&format=JSON"
    )


def region_url(parameter, south, north, west, east, start_year, end_year):
    return (
        f"{POWER_BASE}/regional?parameters={parameter}&community=AG"
        f"&latitude-min={south}&latitude-max={north}&longitude-min={west}&longitude-max={east}"
        f"&start={start_year}&end={end_year}&format=JSON"
    )


def parse_monthly(values_by_key):
    """{'YYYYMM': value} -> sorted list of ((year, month), value or None), dropping month 13."""
    series = []
    for key, value in values_by_key.items():
        year, month = int(key[:4]), int(key[4:])
        if month == 13:
            continue
        clean = None if value is None or value <= FILL_VALUE + 0.5 else float(value)
        series.append(((year, month), clean))
    series.sort()
    return series


def area_weighted_mean(features, parameter):
    """Average grid cells of a regional response, weighted by cos(latitude)."""
    sums, weights = {}, {}
    for feature in features:
        latitude = feature["geometry"]["coordinates"][1]
        weight = math.cos(math.radians(latitude))
        for time, value in parse_monthly(feature["properties"]["parameter"][parameter]):
            if value is None:
                continue
            sums[time] = sums.get(time, 0.0) + weight * value
            weights[time] = weights.get(time, 0.0) + weight
    all_times = sorted({t for f in features for t, _ in parse_monthly(f["properties"]["parameter"][parameter])})
    return [(t, sums[t] / weights[t] if t in weights else None) for t in all_times]


def fetch_point(parameter, latitude, longitude, start_year, end_year):
    url = point_url(parameter, latitude, longitude, start_year, end_year)
    response = requests.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    series = parse_monthly(data["properties"]["parameter"][parameter])
    meta = data["parameters"][parameter]
    return series, {"url": url, "units": meta["units"], "longname": meta["longname"],
                    "sources": data.get("header", {}).get("sources", [])}


def fetch_region(parameter, south, north, west, east, start_year, end_year):
    url = region_url(parameter, south, north, west, east, start_year, end_year)
    response = requests.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    data = response.json()
    series = area_weighted_mean(data["features"], parameter)
    meta = data["parameters"][parameter]
    return series, {"url": url, "units": meta["units"], "longname": meta["longname"],
                    "grid_cells": len(data["features"]),
                    "sources": data.get("header", {}).get("sources", [])}
