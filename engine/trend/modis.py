# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
"""MODIS vegetation greenness (NDVI, product MOD13Q1 v6.1, 250 m, 16-day composites) from the
ORNL DAAC MODIS Web Service. No login needed, but each request is slow, so results are cached on
disk and this is only used to precompute the demo examples.

Service docs: https://modis.ornl.gov/data/modis_webservice.html
"""

import hashlib
import json
import statistics
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

BASE = "https://modis.ornl.gov/rst/api/v1"
PRODUCT = "MOD13Q1"
BAND = "250m_16_days_NDVI"
SCALE = 0.0001
FILL = -3000
DATES_PER_REQUEST = 10
CACHE_DIR = Path.home() / ".cache" / "space-apps-2026" / "modis"
HEADERS = {"Accept": "application/json"}


def subset_url(latitude, longitude, start_date, end_date, km):
    return (f"{BASE}/{PRODUCT}/subset?latitude={latitude}&longitude={longitude}&band={BAND}"
            f"&startDate={start_date}&endDate={end_date}&kmAboveBelow={km}&kmLeftRight={km}")


def available_dates(latitude, longitude):
    response = requests.get(f"{BASE}/{PRODUCT}/dates?latitude={latitude}&longitude={longitude}",
                            headers=HEADERS, timeout=120)
    response.raise_for_status()
    return response.json()["dates"]


def fetch_chunk(latitude, longitude, dates, km):
    url = subset_url(latitude, longitude, dates[0]["modis_date"], dates[-1]["modis_date"], km)
    cache_file = CACHE_DIR / f"{hashlib.sha1(url.encode()).hexdigest()}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text())
    for attempt in range(4):
        try:
            response = requests.get(url, headers=HEADERS, timeout=300)
            response.raise_for_status()
            break
        except requests.RequestException:
            if attempt == 3:
                raise
    data = response.json()
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(data))
    return data


def composite_value(pixels):
    """Median NDVI of valid pixels in the window, or None."""
    valid = [p * SCALE for p in pixels if p != FILL and -2000 <= p <= 10000]
    if not valid or 2 * len(valid) < len(pixels):
        return None
    return statistics.median(valid)


def monthly_means(composites):
    """composites: [(calendar_date 'YYYY-MM-DD', value)] -> {(year, month): mean of values}."""
    sums = {}
    for date, value in composites:
        if value is None:
            continue
        key = (int(date[:4]), int(date[5:7]))
        total, count = sums.get(key, (0.0, 0))
        sums[key] = (total + value, count + 1)
    return {key: total / count for key, (total, count) in sums.items()}


def fetch_monthly_ndvi(latitude, longitude, first_year=2000, last_year=2025, km=2, workers=4):
    dates = [d for d in available_dates(latitude, longitude)
             if first_year <= int(d["calendar_date"][:4]) <= last_year]
    chunks = [dates[i:i + DATES_PER_REQUEST] for i in range(0, len(dates), DATES_PER_REQUEST)]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        results = list(pool.map(lambda c: fetch_chunk(latitude, longitude, c, km), chunks))
    composites = [(item["calendar_date"], composite_value(item["data"]))
                  for data in results for item in data["subset"]]
    means = monthly_means(composites)
    series = [((year, month), means.get((year, month)))
              for year in range(first_year, last_year + 1) for month in range(1, 13)]
    first_with_data = next(i for i, (_, v) in enumerate(series) if v is not None)
    series = series[first_with_data:]
    meta = {
        "product": f"{PRODUCT} v6.1 ({BAND})",
        "service": BASE,
        "window_km": 2 * km + 1,
        "example_request": subset_url(latitude, longitude, dates[0]["modis_date"], dates[-1]["modis_date"], km),
        "composites_used": sum(v is not None for _, v in composites),
        "composites_total": len(composites),
    }
    return series, meta
