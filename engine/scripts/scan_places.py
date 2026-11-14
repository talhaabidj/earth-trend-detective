"""Test many POWER variables at a few places and print a table of trends.

We used this to choose the demo examples from real results. Because it runs many tests, it also
applies the Benjamini-Hochberg check: with 140 tests at the 5% level, about 7 would look
significant by chance alone.

Run from the engine folder: python -m scripts.scan_places > scan.tsv
"""

import time

from trend import stats
from trend.power import download, point_url, to_rows

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


def passes_false_discovery_check(p_values, rate=0.05):
    """Benjamini-Hochberg: True for each test that still counts as significant."""
    order = sorted(range(len(p_values)), key=lambda i: p_values[i])
    last_passing_rank = 0
    for rank, i in enumerate(order, start=1):
        if p_values[i] <= rate * rank / len(p_values):
            last_passing_rank = rank
    passing = [False] * len(p_values)
    for rank, i in enumerate(order, start=1):
        passing[i] = rank <= last_passing_rank
    return passing


def main():
    found = []
    for place, (lat, lon) in PLACES.items():
        data = download(point_url(",".join(VARIABLES), lat, lon, 1981, 2025))
        for variable in VARIABLES:
            rows = to_rows(data["properties"]["parameter"][variable])
            if sum(value not in (None, 0) for _, _, value in rows) < 120:
                continue  # mostly empty or zero (for example snow in a hot place)
            result, _, _ = stats.analyse(rows)
            found.append((place, variable, data["parameters"][variable]["units"], result))
        time.sleep(0.5)

    passing = passes_false_discovery_check([r["mk_p"] for _, _, _, r in found])
    print("place\tvariable\tunits\trate_per_decade\tlow\thigh\tmk_p\tline_p\tverdict\tpasses_fdr\tmore_years")
    for (place, variable, units, r), ok in zip(found, passing):
        print(f"{place}\t{variable}\t{units}\t{10 * r['sen_slope']:.3g}\t{10 * r['sen_low']:.3g}\t{10 * r['sen_high']:.3g}"
              f"\t{r['mk_p']:.2g}\t{r['line_p']:.2g}\t{r['verdict']}\t{ok}\t{r['more_years_needed']:.1f}")


if __name__ == "__main__":
    main()
