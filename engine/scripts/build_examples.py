"""Build the step-by-step examples shown on the website (web/data/stories.json).

Each panel says which verdict the story expects. If the data gives a different verdict, the build
stops, so the story text can never disagree with the numbers.

Run from the engine folder: python -m scripts.build_examples
"""

import json
import math
from datetime import datetime, timezone
from pathlib import Path

from trend import stats
from trend.modis import get_monthly_ndvi
from trend.power import get_point

OUTPUT_FILE = Path(__file__).resolve().parents[2] / "web" / "data" / "stories.json"
LAST_YEAR = 2025

PLACES = {
    "Jacobabad": (28.28, 68.44),
    "Lahore": (31.55, 74.34),
    "Phoenix": (33.45, -112.07),
    "Hunza": (36.32, 74.65),
    "Thar desert": (25.0, 70.0),
}

STORIES = [
    {
        "id": "jacobabad-heat",
        "title": "Is Jacobabad getting hotter?",
        "teaser": "One of the hottest cities on Earth. The answer depends on what you measure.",
        "steps": [
            {
                "text": "Jacobabad in Sindh, Pakistan, is one of the hottest cities on Earth. Start with the obvious "
                        "question: is the average temperature going up? Look at the verdict and at the yearly dots.",
                "panels": [("Jacobabad", "T2M", "none")],
            },
            {
                "text": "The average mixes day and night. Split them: daytime highs on the left, night-time lows on "
                        "the right. The nights are clearly getting warmer while the days are not. Warm nights matter "
                        "for health, because bodies cannot cool down.",
                "panels": [("Jacobabad", "T2M_MAX", "none"), ("Jacobabad", "T2M_MIN", "clear")],
            },
        ],
    },
    {
        "id": "lahore-phoenix",
        "title": "Same question, opposite answers",
        "teaser": "Lahore and Phoenix are both hot, dry-season cities. Their trends go opposite ways.",
        "steps": [
            {
                "text": "Is the air getting more humid? In Lahore (left) humidity is clearly rising. In Phoenix, USA "
                        "(right) it is clearly falling. The same variable can trend in opposite directions in two "
                        "places, so a trend found in one place cannot be assumed everywhere.",
                "panels": [("Lahore", "RH2M", "clear"), ("Phoenix", "RH2M", "clear")],
            },
            {
                "text": "Daytime highs show the same split: falling in Lahore, rising fast in Phoenix. We do not claim "
                        "a cause here. The tool finds the change; explaining it is the next step for a detective.",
                "panels": [("Lahore", "T2M_MAX", "clear"), ("Phoenix", "T2M_MAX", "clear")],
            },
        ],
    },
    {
        "id": "hunza-not-yet",
        "title": "Too soon to tell: Hunza",
        "teaser": "A trend that is not significant yet, and how many more years it would take.",
        "steps": [
            {
                "text": "Hunza is in the Karakoram mountains of northern Pakistan. Are daytime highs rising? The rate "
                        "is positive, but still small next to the normal ups and downs, so it is not significant yet. "
                        "The tool estimates how many more years of data would settle it.",
                "panels": [("Hunza", "T2M_MAX", "not_yet")],
            },
            {
                "text": "The average temperature, which includes the nights, is clearly rising. Not significant yet "
                        "does not mean nothing is happening; it means this one measure needs a longer record.",
                "panels": [("Hunza", "T2M", "clear")],
            },
        ],
    },
    {
        "id": "greener-from-space",
        "title": "Greener from space",
        "teaser": "The MODIS satellite sees the land around Lahore and in the Thar desert getting greener.",
        "steps": [
            {
                "text": "NDVI measures how green the land looks from NASA's Terra satellite (MODIS instrument). Since "
                        "2000, both the area around Lahore (left) and a spot in the Thar desert (right) have become "
                        "clearly greener.",
                "panels": [("Lahore", "NDVI", "clear"), ("Thar desert", "NDVI", "clear")],
            },
            {
                "text": "A second, independent NASA source agrees for the Thar desert: surface soil wetness from the "
                        "MERRA-2 model is rising too. Two different datasets pointing the same way makes the "
                        "finding stronger.",
                "panels": [("Thar desert", "GWETTOP", "clear")],
            },
        ],
    },
]

FIRST_YEAR = {"ALLSKY_SFC_SW_DWN": 2001, "CLOUD_AMT": 2001}


def get_rows(place, variable):
    lat, lon = PLACES[place]
    if variable == "NDVI":
        rows, info = get_monthly_ndvi(lat, lon, last_year=LAST_YEAR)
        return rows, info["example_url"], info
    rows, info = get_point(variable, lat, lon, FIRST_YEAR.get(variable, 1981), LAST_YEAR)
    return rows, info["url"], info


def without_nan(value):
    """JSON has no NaN or infinity, so those become null."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def build_panel(place, variable, expected_verdict):
    rows, source_url, info = get_rows(place, variable)
    result, _, _ = stats.analyse(rows)
    if result["verdict"] != expected_verdict:
        raise SystemExit(f"{place} {variable}: the story expects '{expected_verdict}' but the data says "
                         f"'{result['verdict']}'. Change the story, not the data.")
    lat, lon = PLACES[place]
    print(f"{place:12} {variable:8} {result['verdict']:8} {10 * result['sen_slope']:+.4f} per decade")
    return {
        "name": place,
        "lat": lat,
        "lon": lon,
        "variable": variable,
        "label": f"{place} ({lat:.2f}°, {lon:.2f}°)",
        "source_url": source_url,
        "source_info": info,
        "cells": 1,
        "rows": [{"year": y, "month": m, "value": None if v is None else round(v, 5)} for y, m, v in rows],
        "python_result": {key: without_nan(value) for key, value in result.items()},
    }


def main():
    stories = []
    for story in STORIES:
        steps = [{"text": step["text"], "panels": [build_panel(*panel) for panel in step["panels"]]}
                 for step in story["steps"]]
        stories.append({"id": story["id"], "title": story["title"], "teaser": story["teaser"], "steps": steps})

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps({
        "made": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "made_by": "engine/scripts/build_examples.py",
        "note": "Values rounded to 5 decimals. python_result is the Python engine's answer, kept for checking.",
        "stories": stories,
    }, separators=(",", ":")))
    print(f"Wrote {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
