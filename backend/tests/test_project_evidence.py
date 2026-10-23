"""The pitch must show actual fixture results, rather than manually entered claims."""

import json
from pathlib import Path
import unittest

from app.engine import reconcile
from app.parser import validate_inputs

ROOT = Path(__file__).resolve().parents[2]


class ProjectEvidenceTests(unittest.TestCase):
    def test_published_presentation_matches_the_current_engine_and_original_inputs(self):
        published = json.loads((ROOT / "frontend/src/project/evidence.json").read_text())
        self.assertEqual(set(published["cases"]), {"core", "comprehensive"})
        for key, result in published["cases"].items():
            with self.subTest(scenario=key):
                folder = ROOT / "sample-data" / key
                validated = validate_inputs(
                    (folder / "rules.json").read_text(),
                    (folder / "holders.csv").read_bytes(), "holders.csv",
                    (folder / "payments.csv").read_bytes(), "payments.csv",
                )
                self.assertEqual(validated.issues, [])
                self.assertTrue(result["metadata"]["synthetic"])
                self.assertEqual(result, reconcile(validated), "Run scripts/generate_project_evidence.py")
