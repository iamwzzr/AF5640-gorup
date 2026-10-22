"""Generate reproducible synthetic demonstration files, never live-chain records."""

from pathlib import Path
import csv
import io
import json

ROOT = Path(__file__).resolve().parents[1]
ADDRESS = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
HOLDER_HEADERS = ["project_id", "record_date", "holder_id", "wallet", "token_units"]
PAYMENT_HEADERS = ["project_id", "batch_id", "chain_id", "currency", "payment_token", "tx_hash", "event_index", "to_wallet", "amount", "status", "submitted_at", "confirmed_at"]


def wallet(number):
    return "0x" + format(number, "040x")


def rules(payout):
    return {
        "project_id": "DEMO-BOND-01", "project_name": "示例债券收益分配",
        "batch_id": "2026-Q3", "record_date": "2026-09-30",
        "payment_due_at": "2026-10-10T18:00:00+08:00",
        "as_of": "2026-10-15T12:00:00+08:00", "payout_per_token": payout,
        "chain_id": "1", "currency": "USDC", "payment_token": ADDRESS,
        "synthetic": True,
    }


def holder_rows(units):
    return [["DEMO-BOND-01", "2026-09-30", chr(65+i) if len(units) <= 26 else f"H{i+1:03d}", wallet(i+1), str(amount)]
            for i, amount in enumerate(units)]


def payment(number, recipient, amount, status="confirmed"):
    submitted = "2026-10-10T12:00:00+08:00" if status == "confirmed" else "2026-10-14T09:00:00+08:00"
    confirmed = "2026-10-10T12:01:00+08:00" if status == "confirmed" else ""
    return ["DEMO-BOND-01", "2026-Q3", "1", "USDC", ADDRESS,
            "0x" + format(number, "064x"), "0", wallet(recipient), amount,
            status, submitted, confirmed]


def csv_text(headers, rows):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows(rows)
    return output.getvalue()


def write_text(relative, text):
    for parent in [ROOT / "sample-data", ROOT / "frontend/public/examples"]:
        path = parent / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def main():
    core = [payment(1, 1, "200.000000"), payment(2, 2, "90.000000"),
            payment(3, 4, "240.000000"), payment(4, 4, "240.000000"),
            payment(5, 5, "60.000000"), payment(6, 5, "40.000000")]
    edge = [payment(101, 1, "10.000000"), payment(101, 1, "10.000000"),
            payment(102, 2, "12.000000"), payment(103, 2, "8.000000"),
            payment(104, 3, "30.000000"), payment(105, 3, "30.000000"),
            payment(106, 4, "15.000000", "pending"), payment(107, 5, "14.999999")]
    comprehensive = []
    for recipient in range(1, 101):
        number = 2000 + recipient * 10
        if recipient == 1:
            continue
        if recipient == 3:
            comprehensive.extend([payment(number, recipient, "10"), payment(number + 1, recipient, "10")])
        elif recipient == 7:
            comprehensive.extend([payment(number, recipient, "6"), payment(number + 1, recipient, "4")])
        elif recipient == 8:
            record = payment(number, recipient, "10")
            comprehensive.extend([record, record.copy()])
        else:
            amount = "8" if recipient == 2 else "9.999999" if recipient == 9 else "10"
            status = "pending" if recipient == 5 else "failed" if recipient == 6 else "confirmed"
            comprehensive.append(payment(number, 1004 if recipient == 4 else recipient, amount, status))
    scenarios = []
    for key, name, description, units, payments, payout in [
        ("core", "收益分配示例", "5位持有人：少付、未付、超付与正常拆分付款。应付800，已确认870，个人不足额170。", [1000, 500, 800, 1200, 500], core, "0.200000"),
        ("edge", "付款状态与精度示例", "6位持有人：重复导入、待确认、合法拆分与0.000001的金额差异。", [100, 200, 300, 150, 150, 100], edge, "0.100000"),
        ("comprehensive", "100人综合演示", "覆盖漏付、少付、超付、未知钱包、待确认、付款失败和重复导入，含正常拆分付款。", [100] * 100, comprehensive, "0.100000"),
    ]:
        batch = rules(payout)
        write_text(f"{key}/holders.csv", csv_text(HOLDER_HEADERS, holder_rows(units)))
        write_text(f"{key}/payments.csv", csv_text(PAYMENT_HEADERS, payments))
        write_text(f"{key}/rules.json", json.dumps(batch, ensure_ascii=False, indent=2) + "\n")
        scenarios.append({"id": key, "name": name, "description": description, "rules": batch,
                          "holders_url": f"/examples/{key}/holders.csv",
                          "payments_url": f"/examples/{key}/payments.csv"})
    write_text("manifest.json", json.dumps({"synthetic": True, "scenarios": scenarios}, ensure_ascii=False, indent=2) + "\n")
    write_text("templates/holders.csv", csv_text(HOLDER_HEADERS, []))
    write_text("templates/payments.csv", csv_text(PAYMENT_HEADERS, []))
    print("Generated three synthetic scenarios and CSV templates.")


if __name__ == "__main__":
    main()
