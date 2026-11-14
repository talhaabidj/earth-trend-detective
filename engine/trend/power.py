"""Download monthly data from NASA POWER (no login needed).

POWER sends a 13th "month" each year with the yearly value, and -999 for missing data.
We drop the first and turn the second into None. Docs: https://power.larc.nasa.gov/docs/services/api/
"""

import math

import requests

POWER_URL = "https://power.larc.nasa.gov/api/temporal/monthly"
MISSING = -999
TIMEOUT_SECONDS = 60


def point_url(variable, lat, lon, first_year, last_year):
    return (f"{POWER_URL}/point?parameters={variable}&community=AG"
            f"&longitude={lon}&latitude={lat}&start={first_year}&end={last_year}&format=JSON")


def area_url(variable, south, north, west, east, first_year, last_year):
    return (f"{POWER_URL}/regional?parameters={variable}&community=AG"
            f"&latitude-min={south}&latitude-max={north}&longitude-min={west}&longitude-max={east}"
            f"&start={first_year}&end={last_year}&format=JSON")


def to_rows(values_by_month):
    """Turn POWER's {"YYYYMM": value} into sorted (year, month, value) rows."""
    rows = []
    for key, value in values_by_month.items():
        year, month = int(key[:4]), int(key[4:])
        if month == 13:
            continue
        if value is None or value <= MISSING:
            value = None
        rows.append((year, month, value))
    return sorted(rows)


def area_average(cells, variable):
    """Average the grid cells of an area. Cells near the poles are smaller, so each one counts
    by the cosine of its latitude."""
    totals = {}
    for cell in cells:
        weight = math.cos(math.radians(cell["geometry"]["coordinates"][1]))
        for year, month, value in to_rows(cell["properties"]["parameter"][variable]):
            total, weights = totals.get((year, month), (0.0, 0.0))
            if value is not None:
                total, weights = total + weight * value, weights + weight
            totals[(year, month)] = (total, weights)
    return [(year, month, total / weights if weights else None)
            for (year, month), (total, weights) in sorted(totals.items())]


def download(url):
    response = requests.get(url, timeout=TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


def get_point(variable, lat, lon, first_year, last_year):
    url = point_url(variable, lat, lon, first_year, last_year)
    data = download(url)
    rows = to_rows(data["properties"]["parameter"][variable])
    return rows, {"url": url, "units": data["parameters"][variable]["units"],
                  "sources": data["header"].get("sources", [])}


def get_area(variable, south, north, west, east, first_year, last_year):
    url = area_url(variable, south, north, west, east, first_year, last_year)
    data = download(url)
    rows = area_average(data["features"], variable)
    return rows, {"url": url, "units": data["parameters"][variable]["units"],
                  "cells": len(data["features"]), "sources": data["header"].get("sources", [])}
