"""Build the weather station list behind the website's "second opinion" (web/data/stations.json).

For every station with a long, nearly complete record of monthly average temperature since 1981,
this runs the same trend tests the website uses and keeps the answer. The website then shows the
nearest station's answer next to NASA POWER's, so a visitor can see when a real thermometer agrees
with the model and when it does not.

Station data: NOAA GHCN-Monthly version 4, adjusted series (the station set that NASA's GISTEMP
analysis is built on). Download and unpack
https://www.ncei.noaa.gov/pub/data/ghcn/v4/ghcnm.tavg.latest.qcf.tar.gz first.

Run from the engine folder: python -m scripts.build_stations PATH_TO/ghcnm.tavg.*.qcf.dat
(the .inv file with the station names must sit next to the .dat file).
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from trend import stats

FIRST_YEAR, LAST_YEAR = 1981, 2025
STATION_MISSING = -9999
MIN_SHARE_OF_MONTHS = 0.75   # of the 540 months from 1981 to 2025
MIN_RECENT_MONTHS = 60       # of the 120 months from 2016 to 2025, so the record is still running
OUTPUT_FILE = Path(__file__).resolve().parents[2] / "web" / "data" / "stations.json"
SHORT_WORDS = {"Ap": "Airport", "Ab": "Air Base", "Afb": "Air Force Base", "Intl": "International"}


def read_names(inventory_file):
    """{station id: (name, latitude, longitude)} from the GHCN .inv file."""
    names = {}
    for line in Path(inventory_file).read_text(errors="ignore").splitlines():
        words = line[38:68].strip().replace("_", " ").title().split()
        name = " ".join(SHORT_WORDS.get(word, word) for word in words)
        names[line[:11]] = (name, float(line[12:20]), float(line[21:30]))
    return names


def read_monthly_values(line):
    """One line of the GHCN .dat file -> (station id, year, [12 values in °C or None])."""
    values = []
    for month in range(12):
        hundredths = int(line[19 + 8 * month:24 + 8 * month])
        values.append(None if hundredths == STATION_MISSING else hundredths / 100)
    return line[:11], int(line[11:15]), values


def read_records(data_file):
    """{station id: {(year, month): value}} for 1981 to 2025."""
    records = {}
    with open(data_file, errors="ignore") as lines:
        for line in lines:
            station_id, year, values = read_monthly_values(line)
            if not FIRST_YEAR <= year <= LAST_YEAR:
                continue
            record = records.setdefault(station_id, {})
            for month, value in enumerate(values, start=1):
                if value is not None:
                    record[(year, month)] = value
    return records


def long_enough(record):
    months = (LAST_YEAR - FIRST_YEAR + 1) * 12
    recent = sum(1 for (year, _month) in record if year >= LAST_YEAR - 9)
    return len(record) >= MIN_SHARE_OF_MONTHS * months and recent >= MIN_RECENT_MONTHS


def to_rows(record):
    return [(year, month, record.get((year, month)))
            for year in range(FIRST_YEAR, LAST_YEAR + 1) for month in range(1, 13)]


def main():
    data_file = Path(sys.argv[1])
    names = read_names(data_file.with_suffix(".inv"))
    stations = []
    for station_id, record in read_records(data_file).items():
        if station_id not in names or not long_enough(record):
            continue
        result, _, _ = stats.analyse(to_rows(record))
        if result["verdict"] not in ("clear", "mixed", "not_yet", "none"):
            continue
        name, lat, lon = names[station_id]
        stations.append([station_id, name, round(lat, 3), round(lon, 3), result["valid_months"],
                         round(10 * result["sen_slope"], 3), round(10 * result["sen_low"], 3),
                         round(10 * result["sen_high"], 3), result["verdict"]])
    stations.sort()
    OUTPUT_FILE.write_text(json.dumps({
        "made": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "made_by": "engine/scripts/build_stations.py",
        "source": "NOAA GHCN-Monthly v4, adjusted monthly average temperature (Menne et al., 2018)",
        "years": [FIRST_YEAR, LAST_YEAR],
        "columns": ["id", "name", "lat", "lon", "months", "rate_per_decade", "low", "high", "verdict"],
        "stations": stations,
    }, separators=(",", ":")))
    print(f"{len(stations)} stations ->", OUTPUT_FILE)


if __name__ == "__main__":
    main()
