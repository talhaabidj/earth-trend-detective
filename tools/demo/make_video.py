"""Build the demo video: 1920x1080, the team's recorded voice, and burned-in English subtitles that
match the spoken words. Each spoken line has one or more pictures; the video must stay under 30 s.

Needs: screenshots from take_screenshots.py, the voice clips from use_recording.py, Playwright
(to draw the title cards) and ffmpeg. With a clips folder from record_scenes.py, a line that has a
recorded clip (scene-<line number>.mp4) shows that clip instead of its still pictures.
Usage: python tools/demo/make_video.py SCREENSHOT_FOLDER VOICE_FOLDER OUTPUT.mp4 [CLIPS_FOLDER]
"""

import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

FADE = 0.4         # seconds of cross-fade between scenes
PAUSE = 0.12       # silence after each spoken line
MIN_SCENE = 2.2    # shortest time a scene stays on screen (without the fade)
MAX_LENGTH = 29.8  # the rules allow 30 seconds; keep a margin
ZOOM = 0.04        # a screenshot grows by this share while it is shown, so the picture is never frozen

# The pictures shown during each spoken line: (image, crop, share of the line's time).
# A crop (x, y, width) in screenshot pixels zooms in on the part that matters, so the text can be
# read on a small screen; the height follows from 16:9.
SCENES_IN_ORDER = [
    [("card-team", None, 1)],
    [("01-home.png", None, 1)],
    [("06-explorer.png", (96, 90, 1728), 1)],
    # "no trend in the average" over the average, "but the nights are warming" over day and night.
    [("02a-jacobabad-average.png", (120, 135, 1680), 0.5), ("02-jacobabad-day-night.png", (120, 135, 1680), 0.5)],
    [("04-hunza-not-yet.png", (120, 135, 1680), 1)],
    [("07-trend-map.png", (110, 100, 1700), 1)],
    [("05-greener-from-space.png", (120, 135, 1680), 1)],
    [("card-future", None, 1)],
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
</style>
"""

CARDS = {
    "card-team": """<div class="bar"></div>
        <p class="small">NASA Space Apps Challenge 2026 · Be An Earth System Trend Detective!</p>
        <h1>Earth Trend Detective</h1><p>Is it really changing, or is it too soon to say?</p>
        <p class="small">Team Ludilume Studios: Talha Abid · Kainat Ijaz</p>""",
    "card-future": """<div class="bar"></div><h1>Free. No login.<br>Every number traced to NASA data.</h1>
        <p>For classrooms in Pakistan, and everywhere.</p>
        <p class="url">earth-trend-detective.vercel.app</p>""",
}


def draw_cards(folder):
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 720}, device_scale_factor=1.5)
        for name, body in CARDS.items():
            page.set_content(f"<html><head>{CARD_STYLE}</head><body>{body}</body></html>")
            page.screenshot(path=folder / f"{name}.png")
        browser.close()


def plan_scenes(voice_folder, clips_folder=None):
    """Lines: the words, the voice clip and when it is spoken.
    Shots: the picture or recorded clip, its crop, when it starts and how long it stays (with the fade)."""
    clips = json.loads((voice_folder / "lines.json").read_text())["clips"]
    if len(clips) != len(SCENES_IN_ORDER):
        raise SystemExit("The voice folder and make_video.py must have the same number of scenes")
    lines, shots, start = [], [], 0.0
    for number, (pictures, clip) in enumerate(zip(SCENES_IN_ORDER, clips), start=1):
        visible = max(clip["seconds"] + PAUSE, MIN_SCENE)
        lines.append({"text": clip["text"], "voice": voice_folder / clip["file"], "start": start, "end": start + visible})
        recorded = clips_folder / f"scene-{number}.mp4" if clips_folder else None
        if recorded and recorded.exists():
            pictures = [(recorded, None, 1)]
        shot_start = start
        for image, crop, share in pictures:
            shots.append({"image": image, "crop": crop, "start": shot_start, "seconds": visible * share + FADE})
            shot_start += visible * share
        start += visible
    length = start + FADE
    if length > MAX_LENGTH:
        raise SystemExit(f"Video would be {length:.1f} s; shorten the narration.")
    return lines, shots, length


def ass_time(seconds):
    minutes, secs = divmod(seconds, 60)
    return f"0:{int(minutes):02d}:{secs:05.2f}"


def write_subtitles(path, spoken_lines):
    lines = [
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV",
        "Style: Default,Helvetica,50,&H00FFFFFF,&H20101010,&H20101010,1,3,14,0,2,120,120,60",
        "", "[Events]", "Format: Layer, Start, End, Style, Text",
    ]
    for spoken in spoken_lines:
        lines.append(f"Dialogue: 0,{ass_time(spoken['start'] + 0.1)},{ass_time(spoken['end'])},Default,{spoken['text']}")
    path.write_text("\n".join(lines) + "\n")


def is_clip(shot):
    return str(shot["image"]).endswith(".mp4")


def shot_filter(shot):
    """The ffmpeg filter that turns one picture or recorded clip into a 1920x1080 clip."""
    if is_clip(shot):
        return (f"fps=30,scale=1920:1080:flags=lanczos,trim=duration={shot['seconds']:.2f},"
                "setpts=PTS-STARTPTS,setsar=1,format=yuv420p")
    crop = ""
    if shot["crop"]:
        x, y, width = shot["crop"]
        crop = f"crop={width}:{round(width * 9 / 16)}:{x}:{y},"
    if shot["image"].startswith("card-") or ZOOM == 0:
        return f"{crop}scale=1920:1080:flags=lanczos,setsar=1,fps=30,format=yuv420p"
    # A slow push-in. The picture is enlarged first so the zoom moves in steps smaller than a pixel.
    frames = math.ceil(shot["seconds"] * 30)
    return (f"{crop}scale=3840:2160:flags=lanczos,"
            f"zoompan=z='1+{ZOOM}*on/{frames}':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d={frames}:s=1920x1080:fps=30,"
            f"trim=duration={shot['seconds']:.2f},setsar=1,format=yuv420p")


def build_video(spoken_lines, shots, length, shot_folder, cards, subtitles, output):
    inputs, filters = [], []
    for i, shot in enumerate(shots):
        image = shot["image"]
        if is_clip(shot):
            inputs += ["-i", str(image)]
        elif image.startswith("card-") or ZOOM == 0:
            file = (cards / f"{image}.png") if image.startswith("card-") else (shot_folder / image)
            inputs += ["-loop", "1", "-t", f"{shot['seconds']:.2f}", "-i", str(file)]
        else:
            inputs += ["-i", str(shot_folder / image)]
        filters.append(f"[{i}:v]{shot_filter(shot)}[v{i}]")
    previous = "v0"
    for i in range(1, len(shots)):
        filters.append(f"[{previous}][v{i}]xfade=transition=fade:duration={FADE}:offset={shots[i]['start']:.2f}[x{i}]")
        previous = f"x{i}"
    filters.append(f"[{previous}]subtitles={subtitles}[video]")

    # Each voice clip starts 0.1 s after its line begins.
    first_voice = len(shots)
    for i, spoken in enumerate(spoken_lines):
        inputs += ["-i", str(spoken["voice"])]
        delay = int((spoken["start"] + 0.1) * 1000)
        filters.append(f"[{first_voice + i}:a]aresample=48000,adelay={delay}|{delay}[a{i}]")
    mixed = "".join(f"[a{i}]" for i in range(len(spoken_lines)))
    # Loudness about -14 LUFS, the level YouTube plays at.
    filters.append(f"{mixed}amix=inputs={len(spoken_lines)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,"
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
    shot_folder, voice_folder, output = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
    clips_folder = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    spoken_lines, shots, length = plan_scenes(voice_folder, clips_folder)
    with tempfile.TemporaryDirectory() as temp:
        temp = Path(temp)
        draw_cards(temp)
        write_subtitles(temp / "subtitles.ass", spoken_lines)
        build_video(spoken_lines, shots, length, shot_folder, temp, temp / "subtitles.ass", output)
    print(f"{length:.1f} s ->", output)


if __name__ == "__main__":
    main()
