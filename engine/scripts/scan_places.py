# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
"""Scan many POWER variables at a few places and print trends, with a Benjamini-Hochberg false
discovery rate check. Used to choose demo examples from real results, not from guesses.

Usage: python -m scripts.scan_places > scan.tsv
"""

import sys
import time

import requests

from trend import stats
from trend.power import POWER_BASE, parse_monthly

VARIABLES = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "GWETROOT", "GWETTOP",
             "ALLSKY_SFC_SW_DWN", "CLOUD_AMT", "SNODP", "WS2M", "EVLAND", "FROST_DAYS"]

PLACES = {
    "Jacobabad": (28.28, 68.44),
    "Lahore": (31.55, 74.34),
    "Karachi": (24.86, 67.01),
    "Hunza": (36.32, 74.65),
    "Thar": (25.0, 70.0),
    "Quetta": (30.18, 66.97),
    "Los Angeles": (34.05, -118.24),
    "Manaus": (-3.12, -60.02),
    "Niamey": (13.51, 2.11),
    "Svalbard": (78.22, 15.65),
    "Lhasa": (29.65, 91.11),
    "Phoenix": (33.45, -112.07),
}


def fetch_all(latitude, longitude):
    url = (f"{POWER_BASE}/point?parameters={','.join(VARIABLES)}&community=AG"
           f"&longitude={longitude}&latitude={latitude}&start=1981&end=2025&format=JSON")
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    return response.json()


def benjamini_hochberg(p_values, q=0.05):
    order = sorted(range(len(p_values)), key=lambda i: p_values[i])
    passed = [False] * len(p_values)
    largest = -1
    for rank, i in enumerate(order, start=1):
        if p_values[i] <= q * rank / len(p_values):
            largest = rank
    for rank, i in enumerate(order, start=1):
        passed[i] = rank <= largest
    return passed


def main():
    rows = []
    for name, (latitude, longitude) in PLACES.items():
        data = fetch_all(latitude, longitude)
        for variable in VARIABLES:
            series = parse_monthly(data["properties"]["parameter"][variable])
            times = [t for t, _ in series]
            values = [v for _, v in series]
            if sum(v is not None and v != 0 for v in values) < 120:
                continue
            result, climatology, _ = stats.analyse(times, values)
            mean = sum(c for c in climatology.values()) / 12
            rows.append((name, variable, data["parameters"][variable]["units"], mean, result))
        time.sleep(0.5)
    passed = benjamini_hochberg([r[4].mk_p for r in rows])
    print("place\tvariable\tunits\tmean\tsen_per_decade\tci_low\tci_high\tmk_p\tols_p\tr1\tverdict\tbh_pass\textra_years")
    for (name, variable, units, mean, r), ok in zip(rows, passed):
        print(f"{name}\t{variable}\t{units}\t{mean:.3g}\t{r.sen_slope_per_year*10:.3g}\t{r.sen_low_per_year*10:.3g}"
              f"\t{r.sen_high_per_year*10:.3g}\t{r.mk_p:.2g}\t{r.ols_p:.2g}\t{r.lag1_autocorrelation:.2f}"
              f"\t{r.verdict}\t{ok}\t{r.extra_years_needed:.1f}")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
