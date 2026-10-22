"""Business regressions exercised through the same CSV input path as the API.

Run from backend/: .venv/bin/python -m unittest discover -s tests -v
Only the Python standard library and the application's runtime dependencies are used.
"""

import csv
from decimal import Decimal, localcontext
import io
import json
from pathlib import Path
import random
import unittest
from zipfile import ZipFile

from app.engine import reconcile
from app.export import make_zip
from app.parser import MAX_FILE_BYTES, MAX_ROWS, validate_inputs


ROOT = Path(__file__).resolve().parents[2]
RULES = json.loads((ROOT / "sample-data/core/rules.json").read_text())
HOLDER_FIELDS = ["project_id", "record_date", "holder_id", "wallet", "token_units"]
PAYMENT_FIELDS = [
    "project_id", "batch_id", "chain_id", "currency", "payment_token", "tx_hash",
    "event_index", "to_wallet", "amount", "status", "submitted_at", "confirmed_at",
]


def wallet(number):
    return f"0x{number:040x}"


def holder(number=1, units="100", **changes):
    return {
        "project_id": RULES["project_id"], "record_date": RULES["record_date"],
        "holder_id": f"H{number}", "wallet": wallet(number), "token_units": units,
        **changes,
    }


def payment(number=1, recipient=1, amount="20", status="confirmed", **changes):
    return {
        "project_id": RULES["project_id"], "batch_id": RULES["batch_id"],
        "chain_id": "1", "currency": "USDC", "payment_token": RULES["payment_token"],
        "tx_hash": f"0x{number:064x}", "event_index": "0", "to_wallet": wallet(recipient),
        "amount": amount, "status": status, "submitted_at": "2026-10-10T12:00:00+08:00",
        "confirmed_at": "2026-10-10T12:01:00+08:00" if status == "confirmed" else "",
        **changes,
    }


def csv_data(fields, rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fields)
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8-sig")


def inputs(holders=None, payments=None, rules=None, raw_rules=None):
    return validate_inputs(
        raw_rules if raw_rules is not None else json.dumps(RULES if rules is None else rules),
        csv_data(HOLDER_FIELDS, [holder()] if holders is None else holders), "holders.csv",
        csv_data(PAYMENT_FIELDS, [payment()] if payments is None else payments), "payments.csv",
    )


class ReconciliationTests(unittest.TestCase):
    def run_batch(self, **kwargs):
        validated = inputs(**kwargs)
        self.assertEqual(validated.issues, [])
        return reconcile(validated)

    def test_supplied_scenarios_have_independent_expected_totals(self):
        for scenario, expected in {
            "core": ("800.000000", "870.000000", "170.000000", "240.000000", "0.000000", 0),
            "edge": ("100.000000", "104.999999", "25.000001", "30.000000", "15.000000", 1),
        }.items():
            with self.subTest(scenario=scenario):
                folder = ROOT / "sample-data" / scenario
                validated = validate_inputs(
                    (folder / "rules.json").read_text(), (folder / "holders.csv").read_bytes(),
                    "holders.csv", (folder / "payments.csv").read_bytes(), "payments.csv",
                )
                self.assertEqual(validated.issues, [])
                summary = reconcile(validated)["summary"]
                self.assertEqual(tuple(summary[key] for key in (
                    "expected_total", "confirmed_total", "shortfall_total", "overpayment_total",
                    "pending_total", "duplicate_row_count",
                )), expected)

    def test_split_payments_are_summed(self):
        result = self.run_batch(payments=[payment(amount="12"), payment(2, amount="8")])
        self.assertEqual(result["holders"][0]["settlement_status"], "settled")
        self.assertEqual(result["anomalies"], [])

    def test_duplicate_import_counted_once_but_distinct_payments_not_deduplicated(self):
        result = self.run_batch(payments=[payment(), payment(), payment(2)])
        self.assertEqual(result["summary"]["confirmed_total"], "40.000000")
        self.assertEqual(result["summary"]["duplicate_row_count"], 1)
        self.assertEqual(result["summary"]["overpayment_total"], "20.000000")
        self.assertEqual([row["included"] for row in result["payment_ledger"]], [True, False, True])

    def test_equivalent_event_data_normalizes_before_deduplication(self):
        first = payment(amount="20.000000")
        same = payment(amount="20", submitted_at="2026-10-10T04:00:00Z", confirmed_at="2026-10-10T04:01:00Z")
        same["payment_token"] = "0x" + same["payment_token"][2:].upper()
        result = self.run_batch(payments=[first, same])
        self.assertEqual(result["summary"]["duplicate_row_count"], 1)
        self.assertEqual(result["summary"]["confirmed_total"], "20.000000")

    def test_unknown_wallet_never_covers_a_holders_shortfall(self):
        result = self.run_batch(payments=[payment(recipient=999)])
        self.assertEqual(result["summary"]["confirmed_total"], "20.000000")
        self.assertEqual(result["summary"]["matched_confirmed_total"], "0.000000")
        self.assertEqual(result["summary"]["unmatched_confirmed_total"], "20.000000")
        self.assertEqual(result["summary"]["shortfall_total"], "20.000000")
        self.assertEqual({item["code"] for item in result["anomalies"]}, {"UNMATCHED_WALLET", "UNPAID"})

    def test_comprehensive_demo_covers_every_supported_anomaly_with_review_steps(self):
        folder = ROOT / "sample-data/comprehensive"
        validated = validate_inputs(
            (folder / "rules.json").read_text(), (folder / "holders.csv").read_bytes(), "holders.csv",
            (folder / "payments.csv").read_bytes(), "payments.csv",
        )
        self.assertEqual(validated.issues, [])
        result = reconcile(validated)
        self.assertEqual(result["summary"]["holder_count"], 100)
        self.assertEqual(result["summary"]["payment_row_count"], 102)
        self.assertEqual(result["summary"]["expected_total"], "1000.000000")
        self.assertEqual(result["summary"]["confirmed_total"], "977.999999")
        self.assertEqual(result["summary"]["shortfall_total"], "42.000001")
        self.assertEqual(result["summary"]["overpayment_total"], "10.000000")
        self.assertEqual(result["summary"]["unmatched_confirmed_total"], "10.000000")
        self.assertEqual({item["code"] for item in result["anomalies"]}, {
            "UNPAID", "SHORT_PAYMENT", "OVERPAYMENT", "UNMATCHED_WALLET", "PENDING_PAYMENT", "FAILED_PAYMENT", "DUPLICATE_IMPORT",
        })
        self.assertTrue(all(item["suggested_action"] for item in result["anomalies"]))

    def test_pending_and_failed_payments_do_not_settle_confirmed_amount(self):
        for status in ["pending", "failed"]:
            with self.subTest(status=status):
                result = self.run_batch(payments=[payment(status=status)])
                self.assertEqual(result["summary"]["confirmed_total"], "0.000000")
                self.assertEqual(result["holders"][0]["settlement_status"], "overdue")
                self.assertEqual(result["summary"]["shortfall_total"], "20.000000")

    def test_payment_before_deadline_is_not_overdue(self):
        result = self.run_batch(payments=[], rules={**RULES, "as_of": "2026-10-10T12:00:00+08:00"})
        self.assertEqual(result["holders"][0]["settlement_status"], "not_due")
        self.assertNotIn("UNPAID", result["holders"][0]["issue_codes"])

    def test_fully_paid_holder_with_extra_pending_requires_review(self):
        result = self.run_batch(payments=[payment(), payment(2, status="pending")])
        self.assertEqual(result["holders"][0]["settlement_status"], "review")
        self.assertEqual(result["holders"][0]["balance_status"], "matched")

    def test_zero_holding_with_no_payment_is_settled(self):
        result = self.run_batch(holders=[holder(units="0")], payments=[])
        self.assertEqual(result["holders"][0]["settlement_status"], "settled")

    def test_half_up_rounding_preserves_the_exact_rounding_adjustment(self):
        result = self.run_batch(holders=[holder(units="0.5")], payments=[], rules={**RULES, "payout_per_token": "0.000001"})
        self.assertEqual(result["summary"]["expected_total"], "0.000001")
        self.assertEqual(Decimal(result["summary"]["rounding_adjustment"]), Decimal("0.0000005"))

    def test_maximum_supported_numbers_do_not_lose_significant_digits(self):
        units = "999999999999999999.999999999999999999"
        rate = "999999999999.999999"
        result = self.run_batch(holders=[holder(units=units)], payments=[], rules={**RULES, "payout_per_token": rate})
        with localcontext() as context:
            context.prec = 100
            expected = (Decimal(units) * Decimal(rate)).quantize(Decimal("0.000001"))
        self.assertEqual(Decimal(result["summary"]["expected_total"]), expected)

    def test_money_conservation_for_reproducible_batches(self):
        rng = random.Random(5640)
        for _ in range(30):
            holders = [holder(i, str(rng.randrange(0, 1000))) for i in range(1, 101)]
            payments = [payment(i, i, str(rng.randrange(0, 300))) for i in range(1, 102)]
            result = self.run_batch(holders=holders, payments=payments)
            summary = {key: Decimal(value) for key, value in result["summary"].items() if isinstance(value, str)}
            self.assertEqual(summary["expected_total"] - summary["shortfall_total"] + summary["overpayment_total"], summary["matched_confirmed_total"])
            self.assertEqual(summary["matched_confirmed_total"] + summary["unmatched_confirmed_total"], summary["confirmed_total"])
            self.assertEqual(summary["confirmed_total"] - summary["expected_total"], summary["net_difference"])


class InputValidationTests(unittest.TestCase):
    def assert_invalid(self, code=None, **kwargs):
        validated = inputs(**kwargs)
        self.assertFalse(validated.response()["valid"])
        if code:
            self.assertIn(code, {item["code"] for item in validated.issues})
        with self.assertRaises(ValueError):
            reconcile(validated)
        return validated

    def test_event_conflict_blocks_reconciliation(self):
        self.assert_invalid("EVENT_CONFLICT", payments=[payment(), payment(amount="19")])

    def test_ambiguous_holder_id_and_wallet_block_reconciliation(self):
        for second in [holder(2, holder_id="H1"), holder(2, wallet=wallet(1))]:
            with self.subTest(second=second):
                self.assert_invalid(holders=[holder(), second])

    def test_invalid_money_inputs_block_reconciliation(self):
        for value in ["NaN", "Infinity", "-1", "1e2", "1,000", "0.0000001", "01", ""]:
            with self.subTest(value=value):
                self.assert_invalid("INVALID_AMOUNT", payments=[payment(amount=value)])

    def test_scope_mismatches_block_reconciliation(self):
        for field, value in [
            ("project_id", "OTHER"), ("batch_id", "OTHER"), ("chain_id", "2"),
            ("currency", "DAI"), ("payment_token", wallet(999)),
        ]:
            with self.subTest(field=field):
                self.assert_invalid(payments=[payment(**{field: value})])
        self.assert_invalid("RECORD_DATE_MISMATCH", holders=[holder(record_date="2026-09-29")])

    def test_invalid_status_and_dates_block_reconciliation(self):
        for changes in [
            {"status": "success"}, {"confirmed_at": ""},
            {"submitted_at": "2026-10-10T12:00:00"},
            {"submitted_at": "2026-10-10T12:00:00+08:00:30"},
            {"confirmed_at": "2026-10-16T12:00:00+08:00"},
            {"submitted_at": "2026-09-29T12:00:00+08:00"},
            {"confirmed_at": "2026-10-10T11:00:00+08:00"},
            {"status": "pending", "confirmed_at": "2026-10-10T12:01:00+08:00"},
        ]:
            with self.subTest(changes=changes):
                self.assert_invalid(payments=[payment(**changes)])

    def test_invalid_rules_and_duplicate_json_fields_block_reconciliation(self):
        for raw in ["[]", "null", "{", '{"project_id":"A","project_id":"B"}', json.dumps({**RULES, "synthetic": "false"})]:
            with self.subTest(raw=raw[:40]):
                self.assert_invalid(raw_rules=raw)

    def test_deeply_nested_json_is_a_validation_error(self):
        self.assert_invalid(raw_rules='{"nested":' + "[" * 1500 + "0" + "]" * 1500 + "}")

    def test_invalid_unicode_in_rule_text_is_rejected_before_export(self):
        self.assert_invalid("INVALID_RULE", rules={**RULES, "project_name": "bad\ud800name"})

    def test_unrepresentable_utc_timestamp_is_a_validation_error(self):
        early_rules = {**RULES, "record_date": "0001-01-01", "payment_due_at": "0001-01-02T12:00:00+08:00"}
        self.assert_invalid(
            "INVALID_TIMESTAMP", rules=early_rules, holders=[holder(record_date="0001-01-01")],
            payments=[payment(submitted_at="0001-01-01T00:00:00+08:00")],
        )

    def test_subminute_timezone_cannot_silently_change_the_report_cutoff(self):
        self.assert_invalid("INVALID_RULE", rules={**RULES, "as_of": "2026-10-15T12:00:00+08:00:30"})

    def test_header_only_payments_are_valid_but_empty_holders_are_not(self):
        self.assertTrue(inputs(payments=[]).response()["valid"])
        self.assert_invalid("NO_ROWS", holders=[])

    def test_issue_cap_does_not_accidentally_validate_later_bad_rows(self):
        validated = self.assert_invalid(payments=[payment(i, amount="bad") for i in range(1, 150)])
        self.assertEqual(len(validated.issues), 100)
        self.assertEqual(validated.issues[-1]["code"], "ISSUES_TRUNCATED")

    def test_csv_encoding_and_required_columns(self):
        for data in [b"\xff\xfe", b"holder_id,wallet\nA,wrong\n", b"", b"\x00"]:
            with self.subTest(data=data):
                validated = validate_inputs(json.dumps(RULES), data, "holders.csv", csv_data(PAYMENT_FIELDS, []), "payments.csv")
                self.assertFalse(validated.response()["valid"])

    def test_invalid_holder_snapshot_does_not_invent_unknown_wallet_warnings(self):
        for holders_data in [b"holder_id\nA\n", csv_data(HOLDER_FIELDS, [holder(token_units="bad")])]:
            with self.subTest(holders=holders_data):
                validated = validate_inputs(json.dumps(RULES), holders_data, "holders.csv", csv_data(PAYMENT_FIELDS, [payment()]), "payments.csv")
                self.assertFalse(validated.response()["valid"])
                self.assertNotIn("UNMATCHED_WALLET", {item["code"] for item in validated.warnings})

    def test_multiline_csv_reports_physical_line_without_silent_acceptance(self):
        validated = self.assert_invalid("MULTILINE_FIELD", holders=[holder(holder_id="line1\nline2"), holder(2)])
        self.assertEqual(validated.holders.rows[0]["_source_row"], 4)

    def test_file_and_row_limits(self):
        validated = validate_inputs(json.dumps(RULES), b"x" * (MAX_FILE_BYTES + 1), "holders.csv", csv_data(PAYMENT_FIELDS, []), "payments.csv")
        self.assertIn("FILE_TOO_LARGE", {item["code"] for item in validated.issues})
        self.assert_invalid("TOO_MANY_ROWS", holders=[holder(i) for i in range(1, MAX_ROWS + 2)], payments=[])


class ExportTests(unittest.TestCase):
    def test_review_steps_are_in_the_exported_anomaly_list(self):
        validated = inputs(payments=[])
        result = reconcile(validated)
        with ZipFile(io.BytesIO(make_zip(result, validated.rules.as_dict()))) as archive:
            rows = list(csv.DictReader(io.StringIO(archive.read("anomalies.csv").decode("utf-8-sig"))))
            self.assertEqual(rows[0]["suggested_action"], result["anomalies"][0]["suggested_action"])

    def test_report_is_reproducible_and_matches_reconciliation(self):
        validated = inputs()
        result = reconcile(validated)
        report = make_zip(result, validated.rules.as_dict())
        self.assertEqual(report, make_zip(result, validated.rules.as_dict()))
        with ZipFile(io.BytesIO(report)) as archive:
            self.assertIsNone(archive.testzip())
            self.assertEqual(set(archive.namelist()), {"holders.csv", "anomalies.csv", "payment_ledger.csv", "summary.json", "rules.json"})
            self.assertEqual(json.loads(archive.read("summary.json"))["summary"], result["summary"])
            rows = list(csv.DictReader(io.StringIO(archive.read("holders.csv").decode("utf-8-sig"))))
            self.assertEqual(rows[0]["confirmed_paid"], result["holders"][0]["confirmed_paid"])
            self.assertEqual(rows[0]["expected"], result["holders"][0]["expected"])

    def test_untrusted_identifiers_cannot_become_spreadsheet_formulas(self):
        for identifier in ["=1+1", "+SUM(1,2)", "@A1", "-cmd|test"]:
            with self.subTest(identifier=identifier):
                validated = inputs(holders=[holder(holder_id=identifier)])
                result = reconcile(validated)
                with ZipFile(io.BytesIO(make_zip(result, validated.rules.as_dict()))) as archive:
                    rows = list(csv.DictReader(io.StringIO(archive.read("holders.csv").decode("utf-8-sig"))))
                    self.assertEqual(rows[0]["holder_id"], "'" + identifier)

    def test_browser_examples_are_identical_to_downloadable_source_files(self):
        for path in (ROOT / "sample-data").rglob("*"):
            if path.is_file():
                with self.subTest(path=path.name):
                    self.assertEqual(path.read_bytes(), (ROOT / "frontend/public/examples" / path.relative_to(ROOT / "sample-data")).read_bytes())


if __name__ == "__main__":
    unittest.main()
