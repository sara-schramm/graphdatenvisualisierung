"""Backward-compatible wrapper — runs graph_medium/stress/preprocessing/layout_stress.py."""

from __future__ import annotations

import runpy
from pathlib import Path

SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "graph_medium/stress/preprocessing/layout_stress.py"
)

if __name__ == "__main__":
    runpy.run_path(str(SCRIPT), run_name="__main__")
