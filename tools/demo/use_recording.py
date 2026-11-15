"""Use a person's own recording as the voice of the demo video.

Give it one audio file with the eight lines from script_lines.py read in order, with a pause of
about one second between lines. It cuts the recording at the pauses, trims each line and writes
the clips make_video.py needs. If the reading is too long for a 30-second video, every line is
sped up a little (never more than 15%).

Usage: python tools/demo/use_recording.py RECORDING OUTPUT_FOLDER
Then:  python tools/demo/make_video.py SCREENSHOT_FOLDER OUTPUT_FOLDER VIDEO.mp4
"""

import json
import re
import subprocess
import sys
from pathlib import Path

from script_lines import LINES

PAUSE_BETWEEN_LINES = 0.45   # a silence at least this long counts as a gap between lines
ROOM_FOR_SPEECH = 26.3       # seconds of speech that fit in the video with its short pauses
MOST_SPEED_UP = 1.15


def run(*command):
    return subprocess.run(command, capture_output=True, text=True, check=True)


def find_spoken_parts(recording, quiet_level):
    """[(start, end)] of the parts with speech, using ffmpeg's silence detector."""
    report = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(recording), "-af",
         f"silencedetect=noise={quiet_level}dB:d={PAUSE_BETWEEN_LINES}", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    length = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(recording)).stdout)
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", report)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", report)]
    parts, position = [], 0.0
    for start, end in zip(starts, ends + [length]):
        if start - position > 0.25:
            parts.append((position, start))
        position = end
    if length - position > 0.25:
        parts.append((position, length))
    return parts


def main():
    recording, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    # Try a few loudness levels for "silence", since rooms and phones differ.
    parts = []
    for quiet_level in (-38, -34, -30, -42, -26):
        parts = find_spoken_parts(recording, quiet_level)
        if len(parts) >= len(LINES):
            break
    # A breath inside a line can look like a gap. Join the parts with the shortest gaps between
    # them until eight lines are left.
    while len(parts) > len(LINES):
        gaps = [parts[i + 1][0] - parts[i][1] for i in range(len(parts) - 1)]
        i = gaps.index(min(gaps))
        parts[i:i + 2] = [(parts[i][0], parts[i + 1][1])]
    if len(parts) != len(LINES):
        found = ", ".join(f"{a:.1f}-{b:.1f}s" for a, b in parts)
        raise SystemExit(f"Expected {len(LINES)} lines but heard {len(parts)} ({found}). "
                         "Record again with a clear one-second pause between lines and none inside a line.")

    speech = sum(end - start for start, end in parts)
    speed = min(MOST_SPEED_UP, max(1.0, speech / ROOM_FOR_SPEECH))
    if speech / speed > ROOM_FOR_SPEECH + 0.05:
        raise SystemExit(f"The reading is {speech:.1f} s of speech; it needs to be under {ROOM_FOR_SPEECH * MOST_SPEED_UP:.0f} s. Read a little faster.")

    clips = []
    for number, ((start, end), line) in enumerate(zip(parts, LINES), start=1):
        file = out / f"line-{number}.wav"
        # Cut the line out with a small margin, remove low rumble, even out the level, apply the speed.
        run("ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(0, start - 0.05):.3f}", "-to", f"{end + 0.08:.3f}", "-i", str(recording),
            "-af", f"highpass=f=70,afade=t=in:d=0.02,dynaudnorm=f=150:g=15,atempo={speed:.4f}",
            "-ac", "1", "-ar", "48000", "-map_metadata", "-1", str(file))
        seconds = float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(file)).stdout)
        clips.append({"file": file.name, "text": line, "seconds": round(seconds, 2)})
        print(f"{number}: {seconds:.2f} s  {line}")
    (out / "lines.json").write_text(json.dumps({"voice": "recorded", "speed": round(speed, 3), "clips": clips}, indent=2))
    print(f"speech {sum(c['seconds'] for c in clips):.1f} s, speed x{speed:.2f}")


if __name__ == "__main__":
    main()
