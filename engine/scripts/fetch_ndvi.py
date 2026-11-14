# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
"""Download monthly MODIS NDVI for one place and print its trend.

Usage: python -m scripts.fetch_ndvi NAME LAT LON
Writes ~/.cache/space-apps-2026/ndvi_NAME.json.
"""

import json
import sys
from pathlib import Path

from trend import stats
from trend.modis import fetch_monthly_ndvi


def main():
    name, latitude, longitude = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
    series, meta = fetch_monthly_ndvi(latitude, longitude)
    out = Path.home() / ".cache" / "space-apps-2026" / f"ndvi_{name}.json"
    out.write_text(json.dumps({"series": series, "meta": meta}))
    result, _, _ = stats.analyse([t for t, _ in series], [v for _, v in series])
    print(name, json.dumps(meta), json.dumps(result.to_dict()), flush=True)


if __name__ == "__main__":
    main()
