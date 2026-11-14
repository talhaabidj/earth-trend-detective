"""Build the demo video: 1920x1080, an English voice-over, and burned-in English subtitles that
match the spoken words. Scenes last as long as their spoken line; the video must stay under 30 s.

Needs: screenshots from take_screenshots.py, the voice clips from make_narration.py, Playwright
(to draw the title cards) and ffmpeg.
Usage: python tools/demo/make_video.py SCREENSHOT_FOLDER VOICE_FOLDER OUTPUT.mp4
"""

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

FADE = 0.4         # seconds of cross-fade between scenes
PAUSE = 0.2        # silence after each spoken line
MIN_SCENE = 2.5    # shortest time a scene stays on screen (without the fade)
MAX_LENGTH = 29.5  # the rules allow 30 seconds; keep a margin

# (image, crop) per scene. A crop (x, y, width) in screenshot pixels zooms in on the part that
# matters, so the text can be read on a small screen; the height follows from 16:9.
SCENES_IN_ORDER = [
    ("card-team", None),
    ("card-name", None),
    ("09-explorer-start.png", (200, 40, 1500)),
    ("03-jacobabad-day-night.png", (230, 240, 1460)),
    ("05-hunza-not-yet.png", (230, 255, 1460)),
    ("07-trend-map.png", (200, 100, 1520)),
    ("06-greener-from-space.png", (230, 250, 1460)),
    ("card-future", None),
]

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
  .note { position: absolute; top: 28px; right: 56px; margin: 0; font-size: 22px; color: #3d3c39; }
</style>
"""

VOICE_NOTE = '<p class="note">Voice-over generated with SI (Kokoro text-to-speech).</p>'

CARDS = {
    "card-team": f"""<div class="bar"></div><p class="small">NASA Space Apps Challenge 2026</p>
        <h1>Ludilume Studios</h1><p>Talha Abid · Kainat Ijaz</p>
        <p class="small">Challenge: Be An Earth System Trend Detective!</p>{VOICE_NOTE}""",
    "card-name": """<div class="bar"></div><h1>Earth Trend Detective</h1>
        <p>Is it really changing, or is it too soon to say?</p>""",
    "card-future": f"""<div class="bar"></div><h1>Free. No login.<br>Every number traced to NASA data.</h1>
        <p>For classrooms in Pakistan, and everywhere.</p>
        <p class="url">earth-trend-detective.vercel.app</p>{VOICE_NOTE}""",
}


def draw_cards(folder):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5)
        for name, body in CARDS.items():
            page.set_content(f"<html><head>{CARD_STYLE}</head><body>{body}</body></html>")
            page.screenshot(path=folder / f"{name}.png")
        browser.close()


def plan_scenes(voice_folder):
    """Each scene: image, spoken line, voice clip, when it starts and how long it lasts."""
    clips = json.loads((voice_folder / "lines.json").read_text())["clips"]
    if len(clips) != len(SCENES_IN_ORDER):
        raise SystemExit("make_narration.py and make_video.py must have the same number of scenes")
    scenes, start = [], 0.0
    for (image, crop), clip in zip(SCENES_IN_ORDER, clips):
        visible = max(clip["seconds"] + PAUSE, MIN_SCENE)
        scenes.append({"image": image, "crop": crop, "text": clip["text"], "voice": voice_folder / clip["file"],
                       "start": start, "seconds": visible + FADE, "speech": clip["seconds"]})
        start += visible
    length = start + FADE
    if length > MAX_LENGTH:
        raise SystemExit(f"Video would be {length:.1f} s; shorten the narration.")
    return scenes, length


def ass_time(seconds):
    minutes, secs = divmod(seconds, 60)
    return f"0:{int(minutes):02d}:{secs:05.2f}"


def write_subtitles(path, scenes):
    lines = [
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
        "Style: Default,Helvetica,50,&H00FFFFFF,&H20101010,&H20101010,1,3,14,0,2,120,120,60",
        "", "[Events]", "Format: Layer, Start, End, Style, Text",
    ]
    for scene in scenes:
        end = scene["start"] + scene["seconds"] - FADE
        lines.append(f"Dialogue: 0,{ass_time(scene['start'] + 0.1)},{ass_time(end)},Default,{scene['text']}")
    path.write_text("\n".join(lines) + "\n")


def build_video(scenes, length, shots, cards, subtitles, output):
    inputs, filters = [], []
    for i, scene in enumerate(scenes):
        image = scene["image"]
        file = (cards / f"{image}.png") if image.startswith("card-") else (shots / image)
        inputs += ["-loop", "1", "-t", f"{scene['seconds']:.2f}", "-i", str(file)]
        zoom = ""
        if scene["crop"]:
            x, y, width = scene["crop"]
            zoom = f"crop={width}:{round(width * 9 / 16)}:{x}:{y},"
        filters.append(f"[{i}:v]{zoom}scale=1920:1080:flags=lanczos,setsar=1,fps=30,format=yuv420p[v{i}]")
    previous = "v0"
    for i in range(1, len(scenes)):
        filters.append(f"[{previous}][v{i}]xfade=transition=fade:duration={FADE}:offset={scenes[i]['start']:.2f}[x{i}]")
        previous = f"x{i}"
    filters.append(f"[{previous}]subtitles={subtitles}[video]")

    # Each voice clip starts 0.1 s after its scene begins.
    first_voice = len(scenes)
    for i, scene in enumerate(scenes):
        inputs += ["-i", str(scene["voice"])]
        delay = int((scene["start"] + 0.1) * 1000)
        filters.append(f"[{first_voice + i}:a]aresample=48000,adelay={delay}|{delay}[a{i}]")
    mixed = "".join(f"[a{i}]" for i in range(len(scenes)))
    # Loudness about -14 LUFS, the level YouTube plays at.
    filters.append(f"{mixed}amix=inputs={len(scenes)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,"
                   f"aresample=48000,apad,atrim=0:{length:.2f}[audio]")

    command = [
        "ffmpeg", "-y", "-loglevel", "error", *inputs,
        "-filter_complex", ";".join(filters), "-map", "[video]", "-map", "[audio]",
        "-t", f"{length:.2f}", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-movflags", "+faststart",
        # No file metadata at all (no title, no encoder name).
        "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact",
        "-flags:v", "+bitexact", "-flags:a", "+bitexact",
        "-metadata:s:v", "encoder=", "-metadata:s:a", "encoder=",
        "-bsf:v", "filter_units=remove_types=6",  # drops the encoder's settings note from the stream
        str(output),
    ]
    subprocess.run(command, check=True)


def main():
    shots, voice_folder, output = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    scenes, length = plan_scenes(voice_folder)
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        draw_cards(temp)
        write_subtitles(temp / "subtitles.ass", scenes)
        build_video(scenes, length, shots, temp, temp / "subtitles.ass", output)
    print(f"{length:.1f} s ->", output)


if __name__ == "__main__":
    main()
