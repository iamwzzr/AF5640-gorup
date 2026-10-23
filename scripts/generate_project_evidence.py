"""Publish reproducible, explicitly synthetic results for the project presentation."""

import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.engine import reconcile  # noqa: E402
from app.parser import validate_inputs  # noqa: E402


def generate_project_evidence():
    cases = {}
    for key in ("core", "comprehensive"):
        folder = ROOT / "sample-data" / key
        validated = validate_inputs(
            (folder / "rules.json").read_text(),
            (folder / "holders.csv").read_bytes(), "holders.csv",
            (folder / "payments.csv").read_bytes(), "payments.csv",
        )
        if validated.issues:
            raise ValueError(f"Cannot publish invalid example {key}: {validated.issues}")
        cases[key] = reconcile(validated)
        if cases[key]["metadata"]["synthetic"] is not True:
            raise ValueError("The public presentation accepts synthetic examples only")
    path = ROOT / "frontend/src/project/evidence.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "format_version": 1,
        "generated_by": "scripts/generate_project_evidence.py",
        "cases": cases,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    generate_project_evidence()
    print("Published synthetic project evidence from the reconciliation engine.")
