"""Exercise the real HTTP server, including multipart input and ZIP responses."""

import http.client
import io
import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from zipfile import ZipFile

from test_reconciliation import HOLDER_FIELDS, PAYMENT_FIELDS, RULES, csv_data, holder, payment


BACKEND = Path(__file__).resolve().parents[1]


def multipart(rules=None, holders=None, payments=None):
    boundary = "distributioncheck-regression-boundary"
    parts = []
    for name, filename, content in [
        ("rules", None, json.dumps(RULES if rules is None else rules).encode()),
        ("holders_file", "holders.csv", csv_data(HOLDER_FIELDS, [holder()]) if holders is None else holders),
        ("payments_file", "payments.csv", csv_data(PAYMENT_FIELDS, [payment()]) if payments is None else payments),
    ]:
        disposition = f'Content-Disposition: form-data; name="{name}"'
        if filename:
            disposition += f'; filename="{filename}"'
        parts.append(f"--{boundary}\r\n{disposition}\r\n\r\n".encode() + content + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


class APIRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.log = tempfile.TemporaryFile(mode="w+b")
        cls.addClassCleanup(cls.log.close)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            cls.port = listener.getsockname()[1]
            cls.process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "app.main:app", "--fd", str(listener.fileno()), "--no-access-log", "--log-level", "error"],
                cwd=BACKEND, pass_fds=(listener.fileno(),), stdout=cls.log, stderr=subprocess.STDOUT,
            )
        cls.addClassCleanup(cls.stop_server)
        for _ in range(100):
            try:
                status, _, _ = cls.request("GET", "/api/health")
                if status == 200:
                    return
            except OSError:
                pass
            if cls.process.poll() is not None:
                break
            time.sleep(0.05)
        cls.log.seek(0)
        raise RuntimeError("Test server did not start: " + cls.log.read().decode())

    @classmethod
    def stop_server(cls):
        cls.process.terminate()
        try:
            cls.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            cls.process.kill()
            cls.process.wait(timeout=5)

    @classmethod
    def request(cls, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", cls.port, timeout=5)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def post(self, path, **kwargs):
        body, headers = multipart(**kwargs)
        return self.request("POST", path, body, headers)

    def test_health_and_all_three_api_operations(self):
        status, _, body = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["status"], "ok")
        status, headers, body = self.post("/api/validate")
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["valid"])
        self.assertEqual(headers["cache-control"], "no-store")
        status, _, body = self.post("/api/reconcile?format=json")
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result["summary"]["confirmed_total"], "20.000000")
        status, headers, report = self.post("/api/reconcile?format=zip")
        self.assertEqual(status, 200)
        self.assertEqual(headers["content-type"], "application/zip")
        self.assertIn("attachment", headers["content-disposition"])
        with ZipFile(io.BytesIO(report)) as archive:
            self.assertEqual(json.loads(archive.read("summary.json"))["summary"], result["summary"])

    def test_ambiguous_data_is_reported_and_cannot_be_exported(self):
        payments = csv_data(PAYMENT_FIELDS, [payment(), payment(amount="19")])
        status, _, body = self.post("/api/validate", payments=payments)
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["valid"])
        for path in ["/api/reconcile", "/api/reconcile?format=zip"]:
            with self.subTest(path=path):
                status, _, body = self.post(path, payments=payments)
                self.assertEqual(status, 422)
                self.assertIn("EVENT_CONFLICT", {item["code"] for item in json.loads(body)["error"]["issues"]})

    def test_limits_and_missing_fields_have_readable_errors(self):
        status, _, body = self.post("/api/validate", holders=b"x" * (5 * 1024 * 1024 + 1))
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body)["error"]["code"], "REQUEST_TOO_LARGE")
        status, _, body = self.request("POST", "/api/validate", b"", {"Content-Length": str(13 * 1024 * 1024)})
        self.assertEqual(status, 413)
        self.assertEqual(json.loads(body)["error"]["code"], "REQUEST_TOO_LARGE")
        status, _, body = self.request("POST", "/api/validate", b"")
        self.assertEqual(status, 422)
        self.assertTrue(json.loads(body)["error"]["issues"])

    def test_invalid_extreme_timestamp_returns_validation_instead_of_500(self):
        early_rules = {**RULES, "record_date": "0001-01-01", "payment_due_at": "0001-01-02T12:00:00+08:00"}
        status, _, body = self.post(
            "/api/validate", rules=early_rules,
            holders=csv_data(HOLDER_FIELDS, [holder(record_date="0001-01-01")]),
            payments=csv_data(PAYMENT_FIELDS, [payment(submitted_at="0001-01-01T00:00:00+08:00")]),
        )
        self.assertEqual(status, 200)
        self.assertFalse(json.loads(body)["valid"])
        self.assertIn("INVALID_TIMESTAMP", {item["code"] for item in json.loads(body)["issues"]})

    def test_rounding_adjustment_survives_http_serialization(self):
        status, _, body = self.post(
            "/api/reconcile", rules={**RULES, "payout_per_token": "0.000001"},
            holders=csv_data(HOLDER_FIELDS, [holder(units="0.5")]), payments=csv_data(PAYMENT_FIELDS, []),
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["summary"]["rounding_adjustment"], "0.0000005")

    def test_missing_assets_and_unknown_api_paths_are_real_404s(self):
        for path in ["/api/does-not-exist", "/examples/does-not-exist.csv", "/assets/does-not-exist.js"]:
            with self.subTest(path=path):
                status, _, body = self.request("GET", path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"<!doctype html>", body.lower())


if __name__ == "__main__":
    unittest.main()
