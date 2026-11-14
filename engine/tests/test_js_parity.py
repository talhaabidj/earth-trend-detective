"""The browser engine (web/js/stats.js) must give the same numbers as the Python engine."""

import json
import math
import shutil
import subprocess
from pathlib import Path

import pytest

from trend import stats
from tests.test_stats import make_series

SCRIPT = Path(__file__).resolve().parents[2] / "tools" / "analyse_cli.mjs"
NODE = shutil.which("node")


def run_in_node(rows):
    rows_json = [{"year": y, "month": m, "value": None if v is None or math.isnan(v) else v} for y, m, v in rows]
    output = subprocess.run([NODE, str(SCRIPT)], input=json.dumps(rows_json), capture_output=True, text=True, check=True)
    return json.loads(output.stdout)


@pytest.mark.skipif(NODE is None, reason="node is not installed")
@pytest.mark.parametrize("trend,noise,seed,with_gaps", [(0.05, 0.5, 1, False), (0.0, 1.0, 7, True), (-0.02, 2.0, 11, True)])
def test_browser_engine_matches_python(trend, noise, seed, with_gaps):
    rows = make_series(trend_per_year=trend, noise=noise, seed=seed)
    if with_gaps:
        for i in (3, 40, 41, 200):
            rows[i] = (rows[i][0], rows[i][1], None)
    python_result, _, _ = stats.analyse(rows)
    browser_result = run_in_node(rows)
    for key, expected in python_result.items():
        if isinstance(expected, float):
            assert browser_result[key] == pytest.approx(expected, rel=1e-6, abs=1e-9), key
        else:
            assert browser_result[key] == expected, key
