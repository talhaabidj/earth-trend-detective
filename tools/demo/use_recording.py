"""Use a person's own recording as the voice of the demo video.

Give it one audio file with the eight lines from script_lines.py read in order. It cuts out each
line, shortens long pauses inside a line, evens out the loudness and writes the clips that
make_video.py needs. If the reading is too long for a 30-second video, every line is sped up a
little (never more than 15%; the pitch stays the same).

Where each line is:
- By default the lines are found by the pauses between them (about one second each).
- If the recording has retakes or short pauses, pass a cuts file: a JSON list with one entry per
  line, each a list of [start, end] times in seconds to keep (see recording_cuts.json).

Usage: python tools/demo/use_recording.py RECORDING OUTPUT_FOLDER [CUTS.json]
Then:  python tools/demo/make_video.py SCREENSHOT_FOLDER OUTPUT_FOLDER VIDEO.mp4
"""

import json
import re
import subprocess
import sys
from pathlib import Path

from script_lines import LINES

PAUSE_BETWEEN_LINES = 0.45   # a silence at least this long counts as a gap between lines
ROOM_FOR_SPEECH = 28.0       # seconds of speech that fit in the video with its short pauses
MOST_SPEED_UP = 1.15
# Pauses inside a line longer than 0.16 s are shortened to 0.1 s.
TIGHTEN = "silenceremove=stop_periods=-1:stop_duration=0.16:stop_threshold=-33dB:stop_silence=0.1"


def run(*command):
    return subprocess.run(command, capture_output=True, text=True, check=True)


def length_of(file):
    return float(run("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(file)).stdout)


def find_spoken_parts(recording, quiet_level):
    """[(start, end)] of the parts with speech, using ffmpeg's silence detector."""
    report = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(recording), "-af",
         f"silencedetect=noise={quiet_level}dB:d={PAUSE_BETWEEN_LINES}", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    length = length_of(recording)
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


def find_lines_by_pauses(recording):
    """One [(start, end)] list per line, found from the pauses between lines."""
    parts = []
    for quiet_level in (-38, -34, -30, -42, -26):  # rooms and phones differ
        parts = find_spoken_parts(recording, quiet_level)
        if len(parts) >= len(LINES):
            break
    # A breath inside a line can look like a gap: join the closest parts until eight are left.
    while len(parts) > len(LINES):
        gaps = [parts[i + 1][0] - parts[i][1] for i in range(len(parts) - 1)]
        i = gaps.index(min(gaps))
        parts[i:i + 2] = [(parts[i][0], parts[i + 1][1])]
    if len(parts) != len(LINES):
        found = ", ".join(f"{a:.1f}-{b:.1f}s" for a, b in parts)
        raise SystemExit(f"Expected {len(LINES)} lines but heard {len(parts)} ({found}). "
                         "Record again with a clear pause between lines, or pass a cuts file.")
    return [[(max(0, start - 0.05), end + 0.08)] for start, end in parts]


def cut_line(recording, parts, speed, file):
    """Join the kept parts of one line, tidy the sound and save it."""
    pieces = "".join(f"[0:a]atrim=start={start:.3f}:end={end:.3f},asetpts=PTS-STARTPTS[p{i}];"
                     for i, (start, end) in enumerate(parts))
    joined = "".join(f"[p{i}]" for i in range(len(parts)))
    tidy = (f"{joined}concat=n={len(parts)}:v=0:a=1,highpass=f=70,{TIGHTEN},dynaudnorm=f=150:g=15,"
            f"atempo={speed:.4f},afade=t=in:d=0.02,areverse,afade=t=in:d=0.04,areverse[out]")
    run("ffmpeg", "-y", "-loglevel", "error", "-i", str(recording), "-filter_complex", pieces + tidy,
        "-map", "[out]", "-ac", "1", "-ar", "48000", "-map_metadata", "-1", str(file))
    return length_of(file)


def main():
    recording, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) > 3:
        lines = [[tuple(part) for part in line] for line in json.loads(Path(sys.argv[3]).read_text())]
        if len(lines) != len(LINES):
            raise SystemExit(f"The cuts file must have {len(LINES)} lines.")
    else:
        lines = find_lines_by_pauses(recording)

    files = [out / f"line-{number}.wav" for number in range(1, len(LINES) + 1)]
    speech = sum(cut_line(recording, parts, 1.0, file) for parts, file in zip(lines, files))
    speed = min(MOST_SPEED_UP, max(1.0, speech / ROOM_FOR_SPEECH))
    if speech / speed > ROOM_FOR_SPEECH + 0.3:
        raise SystemExit(f"The reading is {speech:.1f} s of speech; even sped up it does not fit. Read a little faster.")

    clips = []
    for parts, file, line in zip(lines, files, LINES):
        seconds = cut_line(recording, parts, speed, file)
        clips.append({"file": file.name, "text": line, "seconds": round(seconds, 2)})
        print(f"{len(clips)}: {seconds:.2f} s  {line}")
    (out / "lines.json").write_text(json.dumps({"voice": "recorded", "speed": round(speed, 3), "clips": clips}, indent=2))
    print(f"speech {speech:.1f} s as read, {sum(c['seconds'] for c in clips):.1f} s in the video (speed x{speed:.2f})")


if __name__ == "__main__":
    main()
