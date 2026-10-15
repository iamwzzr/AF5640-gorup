"""Portable evidence package with formula-safe UTF-8 CSV files."""

import csv
import io
import json
import re
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

HOLDER_HEADERS = ["holder_id", "wallet", "token_units", "source_row", "expected", "confirmed_paid", "pending_amount", "difference", "shortfall", "overpayment", "balance_status", "settlement_status", "issue_codes", "payment_refs", "explanation"]
ANOMALY_HEADERS = ["id", "code", "severity", "holder_id", "wallet", "amount", "source_rows", "payment_refs", "message"]
LEDGER_HEADERS = ["source_row", "event_key", "tx_hash", "event_index", "to_wallet", "holder_id", "amount", "status", "included", "reason", "submitted_at", "confirmed_at"]


def safe_cell(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, dict)):
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    elif isinstance(value, bool):
        text = "true" if value else "false"
    else:
        text = str(value)
    stripped = text.lstrip()
    # Known numeric negatives are safe numbers. Other spreadsheet formula prefixes
    # are neutralized, including user-supplied identifiers with leading whitespace.
    dangerous_minus = stripped.startswith("-") and not re.fullmatch(r"-\d+(?:\.\d+)?", stripped)
    if stripped.startswith(("=", "+", "@")) or dangerous_minus or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def csv_bytes(headers: list[str], rows: list[dict]) -> bytes:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\r\n")
    writer.writerow(headers)
    writer.writerows([safe_cell(row.get(name)) for name in headers] for row in rows)
    return stream.getvalue().encode("utf-8-sig")


def make_zip(result: dict, rules: dict) -> bytes:
    parts = {
        "holders.csv": csv_bytes(HOLDER_HEADERS, result["holders"]),
        "anomalies.csv": csv_bytes(ANOMALY_HEADERS, result["anomalies"]),
        "payment_ledger.csv": csv_bytes(LEDGER_HEADERS, result["payment_ledger"]),
        "summary.json": json.dumps({"metadata": result["metadata"], "summary": result["summary"], "warnings": result["warnings"]}, ensure_ascii=False, indent=2).encode("utf-8"),
        "rules.json": json.dumps(rules, ensure_ascii=False, indent=2).encode("utf-8"),
    }
    stream = io.BytesIO()
    with ZipFile(stream, "w", ZIP_DEFLATED) as archive:
        for name, payload in parts.items():
            # Fixed archive timestamps make the package reproducible for identical
            # inputs, instead of leaking wall-clock time into an evidence export.
            info = ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            archive.writestr(info, payload)
    return stream.getvalue()
