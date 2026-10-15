"""Deterministic reconciliation; all monetary arithmetic stays in Decimal."""

from decimal import Decimal, localcontext
import hashlib
import json

from . import __version__
from .parser import ValidatedInputs
from .schemas import AMOUNT_QUANTUM, money

ZERO = Decimal(0)


def reconcile(inputs: ValidatedInputs) -> dict:
    if inputs.issues or inputs.rules is None:
        raise ValueError("Invalid input cannot be reconciled")
    with localcontext() as context:
        context.prec = 80
        return _reconcile_precise(inputs)


def _reconcile_precise(inputs: ValidatedInputs) -> dict:
    rules = inputs.rules
    rule_values = rules.as_dict()
    rule_bytes = json.dumps(rule_values, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    metadata = {
        **rule_values,
        "rounding": "ROUND_HALF_UP", "amount_decimals": 6, "algorithm_version": __version__,
        "input_fingerprints": {
            "holders": inputs.holders.fingerprint, "payments": inputs.payments.fingerprint,
            "rules": hashlib.sha256(rule_bytes).hexdigest(),
        },
    }
    holders = []
    by_wallet = {}
    for source in inputs.holders.rows:
        exact = Decimal(source["token_units"]) * Decimal(rules.payout_per_token)
        expected = Decimal(money(exact))
        item = {
            "holder_id": source["holder_id"], "wallet": source["wallet"],
            "token_units": source["token_units"], "source_row": source["_source_row"],
            "_expected": expected, "_unrounded": exact, "_confirmed": ZERO, "_pending": ZERO,
            "payment_refs": [], "_payment_rows": [], "issue_codes": [],
        }
        holders.append(item)
        by_wallet[source["wallet"]] = item

    anomalies = []
    ledger = []

    def anomaly(code: str, severity: str, holder: dict | None, wallet: str | None,
                amount: Decimal | None, source_rows: list[int], refs: list[str], message: str) -> None:
        anomalies.append({
            "id": f"A{len(anomalies) + 1:04d}", "code": code, "severity": severity,
            "holder_id": holder["holder_id"] if holder else None, "wallet": wallet,
            "amount": money(amount) if amount is not None else None,
            "source_rows": source_rows, "payment_refs": refs, "message": message,
        })
        if holder and code not in holder["issue_codes"]:
            holder["issue_codes"].append(code)

    confirmed_total = ZERO
    unmatched_confirmed = ZERO
    pending_total = ZERO
    duplicates = 0
    for payment in inputs.payments.rows:
        key = payment["_event_key"]
        amount = Decimal(payment["amount"])
        holder = by_wallet.get(payment["to_wallet"])
        status = payment["status"]
        row = payment["_source_row"]
        included = True
        if payment.get("_duplicate_of"):
            duplicates += 1
            included = False
            reason = f"重复导入：与付款文件第 {payment['_duplicate_of']} 行是同一事件，本行不重复计入。"
            anomaly("DUPLICATE_IMPORT", "warning", holder, payment["to_wallet"], amount,
                    [payment["_duplicate_of"], row], [key], reason)
        elif status == "failed":
            included = False
            reason = "付款状态为 failed，不计入已确认实付或待确认金额。"
            anomaly("FAILED_PAYMENT", "warning", holder, payment["to_wallet"], amount, [row], [key], reason)
        else:
            if status == "confirmed":
                confirmed_total += amount
            else:
                pending_total += amount
            if holder:
                holder["_confirmed" if status == "confirmed" else "_pending"] += amount
                holder["payment_refs"].append(key)
                holder["_payment_rows"].append(row)
                reason = "已确认付款，计入该持有人的实付合计。" if status == "confirmed" else "待确认付款，单列展示，不计入已确认实付。"
            else:
                if status == "confirmed":
                    unmatched_confirmed += amount
                reason = "收款钱包未匹配持有人；已确认金额单列，未抵减任何人的应付。" if status == "confirmed" else "收款钱包未匹配持有人；待确认金额单列，未抵减任何人的应付。"
                anomaly("UNMATCHED_WALLET", "review", None, payment["to_wallet"], amount, [row], [key], reason)
        ledger.append({
            "source_row": row, "event_key": key, "tx_hash": payment["tx_hash"],
            "event_index": payment["event_index"], "to_wallet": payment["to_wallet"],
            "holder_id": holder["holder_id"] if holder else None, "amount": payment["amount"],
            "status": status, "included": included, "reason": reason,
            "submitted_at": payment["submitted_at"], "confirmed_at": payment["confirmed_at"] or None,
        })

    expected_total = ZERO
    unrounded_total = ZERO
    shortfall_total = ZERO
    overpayment_total = ZERO
    expired = rules.as_of > rules.payment_due_at
    final_holders = []
    for holder in holders:
        expected = holder["_expected"]
        paid = holder["_confirmed"]
        pending = holder["_pending"]
        difference = paid - expected
        shortfall = max(-difference, ZERO)
        overpayment = max(difference, ZERO)
        expected_total += expected
        unrounded_total += holder["_unrounded"]
        shortfall_total += shortfall
        overpayment_total += overpayment
        refs = holder["payment_refs"]
        rows = holder["_payment_rows"]
        balance = "short" if shortfall > 0 else "over" if overpayment > 0 else "matched"
        if overpayment > 0:
            settlement = "review"
            anomaly("OVERPAYMENT", "review", holder, holder["wallet"], overpayment, rows, refs,
                    f"应付 {money(expected)} {rules.currency}，已确认 {money(paid)}，超付 {money(overpayment)}。请核实原因；不同交易不会自动认定为重复付款。")
        elif shortfall > 0:
            settlement = "overdue" if expired else "pending" if pending > 0 else "not_due"
            if pending == 0 and (expired or paid > 0):
                code = "UNPAID" if paid == 0 else "SHORT_PAYMENT"
                anomaly(code, "review" if expired else "warning", holder, holder["wallet"], shortfall, rows, refs,
                        f"应付 {money(expected)} {rules.currency}，已确认 {money(paid)}，尚差 {money(shortfall)}。" +
                        ("已过付款截止时间，且未列有待确认付款，请核实。" if expired else "尚未到付款截止时间，请跟进后续付款。"))
        elif pending > 0:
            settlement = "review"
        else:
            settlement = "settled"
        if pending > 0:
            anomaly("PENDING_PAYMENT", "review" if expired or balance != "short" else "warning", holder,
                    holder["wallet"], pending, rows, refs,
                    f"存在 {money(pending)} {rules.currency} 待确认付款，未计入已确认实付。" +
                    ("已到足额确认金额，仍有待确认付款，需核实是否将超付。" if balance != "short" else
                     "已过截止时间，当前仍未结清；请先核实交易状态，不能据此直接补付。" if expired else
                     "付款截止前处于待确认状态，请跟进交易状态。"))
        explanation = (
            f"记录日 {rules.record_date.isoformat()}，持有 {holder['token_units']} 枚 × 每枚 {rules.payout_per_token} "
            f"{rules.currency}，逐人按 6 位小数四舍五入得应付 {money(expected)}；"
            f"已确认 {money(paid)}，待确认 {money(pending)}，差额（已确认－应付）{money(difference)}。"
            "判断仅依据上传文件，不代表链上验证或审计认证。"
        )
        final_holders.append({
            "holder_id": holder["holder_id"], "wallet": holder["wallet"], "token_units": holder["token_units"],
            "source_row": holder["source_row"], "expected": money(expected), "confirmed_paid": money(paid),
            "pending_amount": money(pending), "difference": money(difference), "shortfall": money(shortfall),
            "overpayment": money(overpayment), "balance_status": balance, "settlement_status": settlement,
            "issue_codes": holder["issue_codes"], "payment_refs": refs, "explanation": explanation,
        })
    matched_confirmed = confirmed_total - unmatched_confirmed
    return {
        "metadata": metadata,
        "summary": {
            "holder_count": len(holders), "payment_row_count": len(inputs.payments.rows),
            "unique_payment_count": len(inputs.payments.rows) - duplicates, "duplicate_row_count": duplicates,
            "expected_total": money(expected_total), "confirmed_total": money(confirmed_total),
            "matched_confirmed_total": money(matched_confirmed), "unmatched_confirmed_total": money(unmatched_confirmed),
            "pending_total": money(pending_total), "shortfall_total": money(shortfall_total),
            "overpayment_total": money(overpayment_total), "net_difference": money(confirmed_total - expected_total),
            "rounding_adjustment": money(expected_total - unrounded_total),
            "affected_holder_count": sum(bool(holder["issue_codes"]) for holder in final_holders),
            "issue_count": len(anomalies),
        },
        "holders": final_holders, "anomalies": anomalies, "payment_ledger": ledger,
        "warnings": inputs.warnings,
    }
