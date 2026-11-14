"""Make the English voice-over for the demo video, one WAV per scene, plus lines.json with the
spoken text and the length of each clip. make_video.py then fits the scenes to the voice.

Usage: python tools/demo/make_narration.py MODEL_FOLDER OUTPUT_FOLDER
(MODEL_FOLDER holds kokoro-v1.0.onnx and voices-v1.0.bin; needs the kokoro-onnx package.)
"""

import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED, LANGUAGE = "af_heart", 1.15, "en-us"

# One line per scene, in order. The subtitles show exactly these words.
LINES = [
    "We are Ludilume Studios: Talha Abid and Kainat Ijaz.",
    "Is my city really getting hotter, or was it one hot year?",
    "Pick a place and a question: 45 years of NASA data, two honest tests.",
    "Jacobabad: no trend in the average, but the nights are warming.",
    "Too soon to say? It tells you how many more years you need.",
    "A map shows where it is changing.",
    "NASA's MODIS satellite sees central Lahore and the Thar desert turning greener.",
    "Free for every classroom. Try Earth Trend Detective.",
]

# Spellings that only change how the voice says a name; the subtitles keep the real spelling.
SAY_AS = [
    (r"\bLudilume\b", "Loo-dee-loom"),
    (r"\bTalha\b", "Tul-ha"),
    (r"\bKainat\b", "Kai-naat"),
    (r"\bIjaz\b", "Ee-jaaz"),
    (r"\bJacobabad\b", "Jacob-abad"),
    (r"\bMODIS\b", "Mo-dis"),
    (r"\b45\b", "forty-five"),
]


def spoken_form(line):
    for pattern, sound in SAY_AS:
        line = re.sub(pattern, sound, line)
    return line


def trim_silence(samples, rate, threshold=0.01, margin_seconds=0.05):
    """Cut quiet parts at the start and end of a clip, keeping a short margin."""
    loud = np.flatnonzero(np.abs(samples) > threshold)
    if not len(loud):
        return samples
    margin = int(rate * margin_seconds)
    return samples[max(0, loud[0] - margin): loud[-1] + margin]


def main():
    model_folder, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    kokoro = Kokoro(str(model_folder / "kokoro-v1.0.onnx"), str(model_folder / "voices-v1.0.bin"))
    clips = []
    for number, line in enumerate(LINES, start=1):
        samples, rate = kokoro.create(spoken_form(line), voice=VOICE, speed=SPEED, lang=LANGUAGE)
        samples = samples / max(1e-6, np.abs(samples).max()) * 0.89  # about -1 dBFS peak
        samples = trim_silence(samples, rate)
        file = out / f"line-{number}.wav"
        sf.write(file, samples, rate)
        clips.append({"file": file.name, "text": line, "seconds": round(len(samples) / rate, 2)})
        print(f"{number}: {clips[-1]['seconds']:.2f} s  {line}")
    (out / "lines.json").write_text(json.dumps({"voice": VOICE, "speed": SPEED, "clips": clips}, indent=2))
    print(f"total speech {sum(c['seconds'] for c in clips):.1f} s")


if __name__ == "__main__":
    main()
