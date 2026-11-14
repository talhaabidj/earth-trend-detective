"""Download MODIS vegetation greenness (NDVI) from the ORNL DAAC MODIS Web Service (no login).

Product: MOD13Q1 v6.1, 250 m pixels, one picture every 16 days, from 2000.
Each request is slow (20-40 seconds), so answers are saved on disk and this is only used to
prepare the demo examples. Service docs: https://modis.ornl.gov/data/modis_webservice.html
"""

import hashlib
import json
import statistics
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

SERVICE_URL = "https://modis.ornl.gov/rst/api/v1"
PRODUCT = "MOD13Q1"
BAND = "250m_16_days_NDVI"
SCALE = 0.0001
MISSING = -3000
DATES_PER_REQUEST = 10
CACHE_FOLDER = Path.home() / ".cache" / "space-apps-2026" / "modis"
JSON_HEADERS = {"Accept": "application/json"}


def subset_url(lat, lon, first_date, last_date, km):
    return (f"{SERVICE_URL}/{PRODUCT}/subset?latitude={lat}&longitude={lon}&band={BAND}"
            f"&startDate={first_date}&endDate={last_date}&kmAboveBelow={km}&kmLeftRight={km}")


def picture_dates(lat, lon):
    url = f"{SERVICE_URL}/{PRODUCT}/dates?latitude={lat}&longitude={lon}"
    response = requests.get(url, headers=JSON_HEADERS, timeout=120)
    response.raise_for_status()
    return response.json()["dates"]


def download_with_cache(url, tries=4):
    cache_file = CACHE_FOLDER / (hashlib.sha1(url.encode()).hexdigest() + ".json")
    if cache_file.exists():
        return json.loads(cache_file.read_text())
    for attempt in range(tries):
        try:
            response = requests.get(url, headers=JSON_HEADERS, timeout=300)
            response.raise_for_status()
            break
        except requests.RequestException:
            if attempt == tries - 1:
                raise
    CACHE_FOLDER.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(response.text)
    return response.json()


def picture_value(pixels):
    """Median NDVI of the good pixels around the point, or None if fewer than half are good."""
    good = [p * SCALE for p in pixels if p != MISSING and -2000 <= p <= 10000]
    if not good or 2 * len(good) < len(pixels):
        return None
    return statistics.median(good)


def monthly_averages(pictures):
    """pictures: [("YYYY-MM-DD", value)]. Returns {(year, month): average of that month's values}."""
    groups = {}
    for date, value in pictures:
        if value is not None:
            groups.setdefault((int(date[:4]), int(date[5:7])), []).append(value)
    return {key: sum(values) / len(values) for key, values in groups.items()}


def get_monthly_ndvi(lat, lon, first_year=2000, last_year=2025, km=2, parallel_requests=4):
    dates = [d for d in picture_dates(lat, lon) if first_year <= int(d["calendar_date"][:4]) <= last_year]
    batches = [dates[i:i + DATES_PER_REQUEST] for i in range(0, len(dates), DATES_PER_REQUEST)]
    urls = [subset_url(lat, lon, batch[0]["modis_date"], batch[-1]["modis_date"], km) for batch in batches]
    with ThreadPoolExecutor(max_workers=parallel_requests) as pool:
        answers = list(pool.map(download_with_cache, urls))

    pictures = [(item["calendar_date"], picture_value(item["data"])) for answer in answers for item in answer["subset"]]
    averages = monthly_averages(pictures)
    rows = [(year, month, averages.get((year, month)))
            for year in range(first_year, last_year + 1) for month in range(1, 13)]
    first_month_with_data = next(i for i, row in enumerate(rows) if row[2] is not None)
    rows = rows[first_month_with_data:]
    info = {
        "product": f"{PRODUCT} v6.1 ({BAND})",
        "service": SERVICE_URL,
        "window_km": 2 * km + 1,
        "example_url": urls[0],
        "good_pictures": sum(value is not None for _, value in pictures),
        "all_pictures": len(pictures),
    }
    return rows, info
