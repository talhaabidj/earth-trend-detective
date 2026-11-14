"""Build the 28-second demo video (1920x1080, burned-in English subtitles, no audio content).

Needs the screenshots from take_screenshots.py, Playwright (to draw the title cards) and ffmpeg.
Usage: python tools/demo/make_video.py SCREENSHOT_FOLDER OUTPUT.mp4
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

FADE = 0.4  # seconds of cross-fade between scenes

CARD_STYLE = """
<style>
  body { margin: 0; width: 1280px; height: 720px; display: flex; flex-direction: column; justify-content: center;
         padding: 0 110px; box-sizing: border-box; background: #f4f4f2; color: #0b0b0b;
         font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .small { font-size: 26px; color: #52514e; margin: 0 0 18px; }
  h1 { font-size: 76px; margin: 0 0 18px; letter-spacing: -1.5px; line-height: 1.05; }
  p { font-size: 34px; margin: 0 0 14px; color: #2b2b29; line-height: 1.3; }
  .url { color: #1c5cab; font-weight: 700; }
  .bar { width: 120px; height: 8px; background: #2a78d6; border-radius: 4px; margin-bottom: 34px; }
</style>
"""

CARDS = {
    "card-team": """<div class="bar"></div><p class="small">NASA Space Apps Challenge 2026</p>
        <h1>Ludilume Studios</h1><p>Talha Abid · Kainat Ijaz</p>
        <p class="small">Challenge: Be An Earth System Trend Detective!</p>""",
    "card-name": """<div class="bar"></div><h1>Earth Trend Detective</h1>
        <p>Is it really changing, or is it too soon to say?</p>""",
    "card-future": """<div class="bar"></div><h1>Free. No login.<br>Every number traced to NASA data.</h1>
        <p>For classrooms in Pakistan, and everywhere.</p>
        <p class="url">earth-trend-detective.vercel.app</p>""",
}

# (image, seconds on screen, subtitle)
SCENES = [
    ("card-team", 3.4, "We are Ludilume Studios: Talha Abid and Kainat Ijaz."),
    ("card-name", 3.4, "Is my city really getting hotter, or was it just one hot year?"),
    ("09-explorer-start.png", 4.2, "Pick any place and a question. 45 years of NASA data, seasons removed, two honest tests."),
    ("03-jacobabad-day-night.png", 4.0, "Jacobabad: no trend in the average, but nights are warming 0.35 °C per decade."),
    ("05-hunza-not-yet.png", 4.0, "Too soon to say? It tells you how many more years of data you need."),
    ("07-trend-map.png", 4.0, "A map shows where it is changing, with chance results filtered out."),
    ("06-greener-from-space.png", 3.6, "NASA's MODIS satellite: central Lahore and the Thar desert are getting greener."),
    ("card-future", 4.2, "Free for every classroom. Try it: earth-trend-detective.vercel.app"),
]


def draw_cards(folder):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5)
        for name, body in CARDS.items():
            page.set_content(f"<html><head>{CARD_STYLE}</head><body>{body}</body></html>")
            page.screenshot(path=folder / f"{name}.png")
        browser.close()


def ass_time(seconds):
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f"{int(hours)}:{int(minutes):02d}:{secs:05.2f}"


def write_subtitles(path):
    """ASS file: white text in a nearly solid dark box near the bottom, one line per scene."""
    lines = [
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
        "Style: Default,Helvetica,50,&H00FFFFFF,&H20101010,&H20101010,1,3,14,0,2,120,120,60",
        "", "[Events]", "Format: Layer, Start, End, Style, Text",
    ]
    start = 0.0
    for _, seconds, text in SCENES:
        end = start + seconds - FADE
        lines.append(f"Dialogue: 0,{ass_time(start + 0.15)},{ass_time(end)},Default,{text}")
        start = end
    path.write_text("\n".join(lines) + "\n")
    return start + FADE


def build_video(shots, cards, subtitles, output):
    inputs, filters = [], []
    for i, (image, seconds, _) in enumerate(SCENES):
        folder = cards if image.startswith("card-") else shots
        file = folder / (image if image.endswith(".png") else f"{image}.png")
        inputs += ["-loop", "1", "-t", str(seconds), "-i", str(file)]
        filters.append(f"[{i}:v]scale=1920:1080,setsar=1,fps=30,format=yuv420p[v{i}]")
    previous, offset = "v0", 0.0
    for i in range(1, len(SCENES)):
        offset += SCENES[i - 1][1] - FADE
        filters.append(f"[{previous}][v{i}]xfade=transition=fade:duration={FADE}:offset={offset:.2f}[x{i}]")
        previous = f"x{i}"
    filters.append(f"[{previous}]subtitles={subtitles}[out]")
    command = ["ffmpeg", "-y", "-loglevel", "error", *inputs,
               "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
               "-filter_complex", ";".join(filters), "-map", "[out]", "-map", f"{len(SCENES)}:a",
               "-shortest", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
               "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
               "-metadata", "title=Earth Trend Detective - Ludilume Studios - NASA Space Apps 2026",
               "-metadata", "comment=Assembled with help from Claude Code (SI) from screenshots of the live site. No SI voice, music or images.",
               str(output)]
    subprocess.run(command, check=True)


def main():
    shots, output = Path(sys.argv[1]), Path(sys.argv[2])
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        draw_cards(temp)
        length = write_subtitles(temp / "subtitles.ass")
        build_video(shots, temp, temp / "subtitles.ass", output)
    print(f"planned length {length:.1f} s ->", output)


if __name__ == "__main__":
    main()
