"""Compare NASA POWER's average air temperature with weather station records at the same places.

POWER is a model-based product, so this is an outside check: does a real thermometer show the same
change? The station data is NOAA's GHCN-Monthly version 4 (the station set that NASA's GISTEMP
analysis is built on), in its adjusted form. Download and unpack
https://www.ncei.noaa.gov/pub/data/ghcn/v4/ghcnm.tavg.latest.qcf.tar.gz first.

Each comparison uses only the months that the station has, so both series cover the same months.

Run from the engine folder: python -m scripts.station_check PATH_TO/ghcnm.tavg.*.qcf.dat
"""

import math
import sys

from trend import stats
from trend.power import get_point

FIRST_YEAR, LAST_YEAR = 1981, 2025
STATION_MISSING = -9999

# Place: (GHCN station id, station name, latitude, longitude)
STATIONS = {
    "Jacobabad": ("PKM00041715", "Shahbaz air base, Jacobabad", 28.284, 68.450),
    "Lahore": ("PK000041640", "Lahore City", 31.550, 74.333),
    "Phoenix": ("USW00023183", "Phoenix Sky Harbor airport", 33.428, -112.004),
    "Manaus": ("BRM00082331", "Manaus", -3.133, -60.017),
    "Svalbard": ("SV000001008", "Svalbard airport", 78.250, 15.467),
}


def read_station(data_file, station_id):
    """Monthly averages in °C as {(year, month): value}. GHCN stores hundredths of a degree."""
    values = {}
    with open(data_file, errors="ignore") as lines:
        for line in lines:
            if not line.startswith(station_id):
                continue
            year = int(line[11:15])
            for month in range(12):
                hundredths = int(line[19 + 8 * month:24 + 8 * month])
                if hundredths != STATION_MISSING:
                    values[(year, month + 1)] = hundredths / 100
    return values


def same_months(station_values, power_rows):
    """Two row lists over 1981-2025; a month the station lacks is left empty in both."""
    station_rows, model_rows = [], []
    for year, month, model_value in power_rows:
        station_value = station_values.get((year, month))
        station_rows.append((year, month, station_value))
        model_rows.append((year, month, None if station_value is None else model_value))
    return station_rows, model_rows


def correlation(first, second):
    pairs = [(a, b) for a, b in zip(first, second) if not (math.isnan(a) or math.isnan(b))]
    mean_a = sum(a for a, _ in pairs) / len(pairs)
    mean_b = sum(b for _, b in pairs) / len(pairs)
    cross = sum((a - mean_a) * (b - mean_b) for a, b in pairs)
    spread_a = sum((a - mean_a) ** 2 for a, _ in pairs)
    spread_b = sum((b - mean_b) ** 2 for _, b in pairs)
    return cross / math.sqrt(spread_a * spread_b)


def rate_text(result):
    return (f"{10 * result['sen_slope']:+.2f} ({10 * result['sen_low']:+.2f} to {10 * result['sen_high']:+.2f}), "
            f"{result['verdict']}")


def main():
    data_file = sys.argv[1]
    print("| Place | Station | Months | Station, °C per decade | NASA POWER, °C per decade | Month-to-month match |")
    print("|---|---|---|---|---|---|")
    for place, (station_id, station_name, lat, lon) in STATIONS.items():
        station_values = read_station(data_file, station_id)
        power_rows, _ = get_point("T2M", lat, lon, FIRST_YEAR, LAST_YEAR)
        station_rows, model_rows = same_months(station_values, power_rows)
        station_result, _, station_anomalies = stats.analyse(station_rows)
        model_result, _, model_anomalies = stats.analyse(model_rows)
        match = correlation(station_anomalies, model_anomalies)
        print(f"| {place} | {station_name} ({station_id}) | {station_result['valid_months']} | "
              f"{rate_text(station_result)} | {rate_text(model_result)} | r = {match:.2f} |")


if __name__ == "__main__":
    main()
