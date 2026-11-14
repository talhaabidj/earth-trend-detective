# SI-assisted: written with Claude Code (Anthropic) under the team's direction; see docs/AI_USE.md.
import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from trend import stats
from tests.test_stats import synthetic_series

CLI = Path(__file__).resolve().parents[2] / "tools" / "analyse_cli.mjs"
NODE = shutil.which("node")


def run_js(times, values):
    payload = json.dumps({"times": times, "values": [None if v is None or math.isnan(v) else v for v in values]})
    output = subprocess.run([NODE, str(CLI)], input=payload, capture_output=True, text=True, check=True)
    return json.loads(output.stdout)


@pytest.mark.skipif(NODE is None, reason="node not installed")
@pytest.mark.parametrize("trend,noise,seed,gaps", [(0.05, 0.5, 1, False), (0.0, 1.0, 7, True), (-0.02, 2.0, 11, True)])
def test_browser_engine_matches_python(trend, noise, seed, gaps):
    times, values = synthetic_series(trend_per_year=trend, noise_sd=noise, seed=seed)
    if gaps:
        for i in (3, 40, 41, 200):
            values[i] = None
    python_result, _, _ = stats.analyse(times, values)
    js_result = run_js(times, values)
    for key, expected in python_result.to_dict().items():
        actual = js_result[key]
        if isinstance(expected, float):
            assert actual == pytest.approx(expected, rel=1e-6, abs=1e-9), key
        else:
            assert actual == expected, key
