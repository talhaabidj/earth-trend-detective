"""The weather station "second opinion": reading the station files and the browser's comparison."""

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from scripts.build_stations import long_enough, read_monthly_values

SCRIPT = Path(__file__).resolve().parents[2] / "tools" / "second_opinion_cli.mjs"
NODE = shutil.which("node")

LAHORE = {"id": "A", "name": "Lahore City", "lat": 31.55, "lon": 74.333, "months": 526,
          "rate": 0.29, "low": 0.21, "high": 0.36, "verdict": "clear"}
AMRITSAR = {"id": "B", "name": "Amritsar", "lat": 31.71, "lon": 74.797, "months": 500,
            "rate": 0.05, "low": -0.02, "high": 0.12, "verdict": "none"}


def test_station_line_is_read_in_degrees_with_gaps():
    values = [1234, -9999, -567] + [2000] * 9
    line = "PK000041640" + "1981" + "TAVG" + "".join(f"{value:5d}   " for value in values)
    station_id, year, months = read_monthly_values(line)
    assert (station_id, year) == ("PK000041640", 1981)
    assert months[:3] == [12.34, None, -5.67]


def test_only_long_and_still_running_records_are_kept():
    full = {(year, month): 20.0 for year in range(1981, 2026) for month in range(1, 13)}
    stopped_in_2010 = {key: value for key, value in full.items() if key[0] <= 2010}
    half_missing = {key: value for key, value in full.items() if key[1] <= 6}
    assert long_enough(full)
    assert not long_enough(stopped_in_2010)
    assert not long_enough(half_missing)


def second_opinion(lat, lon, model_verdict, model_rate, stations=(LAHORE, AMRITSAR)):
    question = {"stations": list(stations), "lat": lat, "lon": lon, "modelVerdict": model_verdict, "modelRate": model_rate}
    output = subprocess.run([NODE, str(SCRIPT)], input=json.dumps(question), capture_output=True, text=True, check=True)
    return json.loads(output.stdout)


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_the_nearest_station_within_reach_is_used():
    assert second_opinion(31.55, 74.34, "clear", 0.2)["name"] == "Lahore City"
    assert second_opinion(31.70, 74.80, "clear", 0.2)["name"] == "Amritsar"
    assert second_opinion(36.32, 74.65, "clear", 0.2) is None  # Hunza: nothing within 60 km


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("model_verdict,model_rate,expected", [
    ("clear", 0.3, "agree"),       # both clearly rising
    ("clear", -0.3, "disagree"),   # both clear, opposite ways
    ("none", 0.05, "disagree"),    # the station sees a trend the model does not
    ("mixed", -0.1, "disagree"),
])
def test_agreement_with_a_clearly_warming_station(model_verdict, model_rate, expected):
    assert second_opinion(31.55, 74.34, model_verdict, model_rate)["outcome"] == expected


@pytest.mark.skipif(NODE is None, reason="node is not installed")
def test_agreement_when_neither_shows_a_clear_trend():
    answer = second_opinion(31.70, 74.80, "not_yet", 0.08)
    assert answer["outcome"] == "agree"
    assert "neither shows a clear trend" in answer["verdict"]
