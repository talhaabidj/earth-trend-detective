"""Draw the YouTube thumbnail for the demo video: 1280x720 JPEG, no file metadata.

The stripes are real: one per year of Jacobabad's night-time lows from the site's own example data
(web/data/stories.json), coloured the same way as on the site.
Usage: python tools/demo/make_thumbnail.py OUTPUT.jpg
"""

import json
import sys
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
STRIPE_COLOURS = ["#184f95", "#2a78d6", "#6da7ec", "#b7d3f6", "#e9e8e3", "#f3c2bd", "#eb8a82", "#e34948", "#a8302f"]


def yearly_anomalies(rows):
    """Each year's average minus the average of all years (months with no value are skipped)."""
    by_year = {}
    for row in rows:
        if row[2] is not None:
            by_year.setdefault(row[0], []).append(row[2])
    means = {year: sum(values) / len(values) for year, values in by_year.items() if len(values) >= 10}
    overall = sum(means.values()) / len(means)
    return [(year, means[year] - overall) for year in sorted(means)]


def stripe_colours():
    stories = json.loads((ROOT / "web" / "data" / "stories.json").read_text())["stories"]
    panel = next(p for s in stories for step in s["steps"] for p in step["panels"]
                 if p["name"] == "Jacobabad" and p["variable"] == "T2M_MIN")
    rows = [(r["year"], r["month"], r["value"]) if isinstance(r, dict) else tuple(r) for r in panel["rows"]]
    years = yearly_anomalies(rows)
    biggest = max(abs(anomaly) for _, anomaly in years)
    return [STRIPE_COLOURS[min(8, max(0, round(anomaly / biggest * 4) + 4))] for _, anomaly in years]


PAGE = """<html><head><style>
  body {{ margin: 0; width: 1280px; height: 720px; overflow: hidden; position: relative; color: #fff;
         font-family: -apple-system, "Helvetica Neue", Arial, sans-serif;
         background: radial-gradient(700px 500px at 85% 0%, rgba(57,135,229,.45), transparent 70%),
                     linear-gradient(165deg, #0d1b33, #16345f); }}
  .brand {{ position: absolute; left: 64px; top: 52px; display: flex; align-items: center; gap: 16px;
           font-size: 34px; font-weight: 700; }}
  .logo {{ width: 52px; height: 52px; }}
  h1 {{ position: absolute; left: 64px; top: 140px; margin: 0; font-size: 112px; line-height: 1.0;
       letter-spacing: -3px; font-weight: 800; width: 1150px; }}
  .accent {{ background: linear-gradient(90deg, #8fc0f8, #ffb892); -webkit-background-clip: text; color: transparent; }}
  .sub {{ position: absolute; left: 64px; top: 392px; font-size: 38px; color: #dbe6f5; font-weight: 600; }}
  .stripes {{ position: absolute; left: 0; right: 0; bottom: 0; height: 200px; display: flex; }}
  .stripes span {{ flex: 1; }}
  .label {{ position: absolute; left: 64px; bottom: 216px; font-size: 22px; color: #b8c9e0; }}
</style></head><body>
  <div class="brand"><svg class="logo" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2a78d6"/>
    <polyline points="6,22 13,15 18,19 26,9" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
    Earth Trend Detective</div>
  <h1>Is it really changing, or <span class="accent">too soon to say?</span></h1>
  <div class="sub">45 years of NASA data · checked against thermometers</div>
  <div class="label">Jacobabad nights, 1981 to 2025: one stripe per year, NASA POWER data</div>
  <div class="stripes">{stripes}</div>
</body></html>"""


def main():
    output = Path(sys.argv[1])
    stripes = "".join(f'<span style="background:{colour}"></span>' for colour in stripe_colours())
    with tempfile.TemporaryDirectory() as temp, sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=2)
        page.set_content(PAGE.format(stripes=stripes))
        png = Path(temp) / "thumbnail.png"
        page.screenshot(path=png)
        browser.close()
        picture = Image.open(png).convert("RGB").resize((1280, 720), Image.LANCZOS)
        picture.save(output, "JPEG", quality=90, optimize=True)  # PIL writes no EXIF unless asked
    print(output, output.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
