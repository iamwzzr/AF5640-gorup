"""CSV parsing and blocking validation; no calculation on ambiguous input."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
import csv
import hashlib
import io
import json
from pathlib import Path

from pydantic import ValidationError

from .schemas import (
    ADDRESS_RE, AMOUNT_RE, HASH_RE, UINT_RE, UNITS_RE, Rules,
    aware_datetime, canonical_units, money,
)

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10_000
MAX_ISSUES = 100
HOLDER_COLUMNS = ["project_id", "record_date", "holder_id", "wallet", "token_units"]
PAYMENT_COLUMNS = [
    "project_id", "batch_id", "chain_id", "currency", "payment_token", "tx_hash",
    "event_index", "to_wallet", "amount", "status", "submitted_at", "confirmed_at",
]
csv.field_size_limit(32_768)


def issue(code: str, file: str, row: int | None, field_name: str | None, message: str) -> dict:
    return {"code": code, "file": file, "row": row, "field": field_name, "message": message}


class IssueList(list):
    """Bound the response without losing knowledge of suppressed errors."""

    def __init__(self, values=()):
        super().__init__()
        self.total_count = 0
        for value in values:
            self.append(value)

    def append(self, value: dict) -> None:
        self.total_count += 1
        if len(self) < MAX_ISSUES - 1:
            super().append(value)
        elif len(self) == MAX_ISSUES - 1:
            super().append(issue(
                "ISSUES_TRUNCATED", value["file"], None, None,
                "错误较多，仅展示前 99 项，错误列表已截断。请更正已列问题后重新上传。",
            ))


def issue_count(issues: list[dict]) -> int:
    return issues.total_count if isinstance(issues, IssueList) else len(issues)


@dataclass
class Dataset:
    filename: str
    columns: list[str]
    rows: list[dict] = field(default_factory=list)
    fingerprint: str = ""

    def preview(self) -> dict:
        return {
            "filename": self.filename, "row_count": len(self.rows), "columns": self.columns,
            "rows": [{key: item.get(key, "") for key in self.columns} for item in self.rows[:5]],
        }


@dataclass
class ValidatedInputs:
    rules: Rules | None
    holders: Dataset
    payments: Dataset
    issues: list[dict]
    warnings: list[dict]

    def response(self) -> dict:
        return {
            "valid": not self.issues, "issues": self.issues, "warnings": self.warnings,
            "preview": {"holders": self.holders.preview(), "payments": self.payments.preview()},
            "rules": self.rules.as_dict() if self.rules else {},
        }


def parse_rules(raw: str) -> tuple[Rules | None, list[dict]]:
    if len(raw.encode("utf-8")) > 16_384:
        return None, [issue("RULES_TOO_LARGE", "rules", None, None, "批次规则超过允许长度。")]
    def unique_fields(pairs: list[tuple]) -> dict:
        values = {}
        for key, value in pairs:
            if key in values:
                raise ValueError("duplicate JSON field")
            values[key] = value
        return values

    try:
        data = json.loads(raw, object_pairs_hook=unique_fields)
    except (json.JSONDecodeError, ValueError, RecursionError):
        return None, [issue("INVALID_JSON", "rules", None, None, "批次规则不是有效的 JSON 对象。")]
    if not isinstance(data, dict):
        return None, [issue("INVALID_RULES", "rules", None, None, "批次规则必须是 JSON 对象。")]
    try:
        return Rules.model_validate(data), []
    except ValidationError as error:
        output = []
        for detail in error.errors(include_input=False, include_url=False):
            name = ".".join(str(part) for part in detail["loc"]) or None
            message = detail["msg"]
            if message.startswith("Value error, "):
                message = message[len("Value error, "):]
            elif detail["type"] == "missing":
                message = "缺少必填规则字段。"
            elif detail["type"] == "extra_forbidden":
                message = "出现未支持的规则字段，请使用当前版本模板。"
            elif "string" in detail["type"]:
                message = "该字段必须是符合长度要求的字符串。"
            output.append(issue("INVALID_RULE", "rules", None, name, message))
        return None, output


def parse_csv(data: bytes, filename: str, kind: str, issues: list[dict]) -> Dataset:
    expected = HOLDER_COLUMNS if kind == "holders" else PAYMENT_COLUMNS
    result = Dataset(Path(filename or f"{kind}.csv").name[:200], [], fingerprint=hashlib.sha256(data).hexdigest())
    if len(data) > MAX_FILE_BYTES:
        issues.append(issue("FILE_TOO_LARGE", kind, None, None, "每份 CSV 文件不能超过 5 MiB。"))
        return result
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        issues.append(issue("INVALID_ENCODING", kind, None, None, "文件必须使用 UTF-8 编码，请另存为 CSV UTF-8。"))
        return result
    if "\x00" in text:
        issues.append(issue("INVALID_CSV", kind, None, None, "CSV 包含不支持的空字符。"))
        return result
    try:
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        header = next(reader, None)
        if not header:
            issues.append(issue("EMPTY_FILE", kind, 1, None, "文件为空或缺少表头。"))
            return result
        if reader.line_num != 1:
            issues.append(issue("MULTILINE_FIELD", kind, 1, None, "表头不能包含跨行字段，请使用单行 CSV 表头。"))
            return result
        result.columns = [value.strip() for value in header]
        if len(set(result.columns)) != len(result.columns):
            issues.append(issue("DUPLICATE_COLUMNS", kind, 1, None, "表头存在重复字段。"))
            return result
        missing = [name for name in expected if name not in result.columns]
        extra = [name for name in result.columns if name not in expected]
        if missing or extra:
            messages = []
            if missing:
                messages.append("缺少字段：" + "、".join(missing))
            if extra:
                messages.append("不支持的字段：" + "、".join(extra))
            issues.append(issue("INVALID_COLUMNS", kind, 1, None, "；".join(messages) + "。请使用当前模板。"))
            return result
        input_record_count = 0
        while True:
            # csv.reader.line_num counts consumed physical lines, including those
            # inside quoted fields. Capture the physical start before consuming.
            row_number = reader.line_num + 1
            values = next(reader, None)
            if values is None:
                break
            if not values or all(not value.strip() for value in values):
                continue
            input_record_count += 1
            if input_record_count > MAX_ROWS:
                issues.append(issue("TOO_MANY_ROWS", kind, row_number, None, "每份 CSV 最多包含 10,000 条数据。"))
                break
            if reader.line_num > row_number or any("\n" in value or "\r" in value for value in values):
                issues.append(issue("MULTILINE_FIELD", kind, row_number, None, "数据字段不能跨越多行，请移除字段内的换行后重新上传。"))
                continue
            if len(values) != len(result.columns):
                issues.append(issue("COLUMN_COUNT", kind, row_number, None, "本行字段数量与表头不一致。"))
                continue
            item = dict(zip(result.columns, (value.strip() for value in values)))
            item["_source_row"] = row_number
            result.rows.append(item)
    except (csv.Error, OverflowError):
        issues.append(issue("INVALID_CSV", kind, None, None, "CSV 格式无效，或单个字段超过 32,768 个字符。"))
    if not result.rows and kind == "holders" and not any(item["file"] == kind for item in issues):
        issues.append(issue("NO_ROWS", kind, None, None, "文件必须至少包含一条数据记录。"))
    return result


def validate_holder_rows(dataset: Dataset, rules: Rules, issues: list[dict]) -> None:
    ids: dict[str, int] = {}
    wallets: dict[str, int] = {}
    for item in dataset.rows:
        row = item["_source_row"]
        if item["project_id"] != rules.project_id:
            issues.append(issue("PROJECT_MISMATCH", "holders", row, "project_id", "项目编号与批次规则不一致。"))
        if item["record_date"] != rules.record_date.isoformat():
            issues.append(issue("RECORD_DATE_MISMATCH", "holders", row, "record_date", "快照日期与本次记录日不一致。"))
        holder_id = item["holder_id"]
        if not holder_id or len(holder_id) > 100:
            issues.append(issue("INVALID_HOLDER_ID", "holders", row, "holder_id", "持有人编号不能为空，且不能超过 100 个字符。"))
        elif holder_id in ids:
            issues.append(issue("DUPLICATE_HOLDER", "holders", row, "holder_id", f"持有人编号与第 {ids[holder_id]} 行重复，快照存在歧义。"))
        else:
            ids[holder_id] = row
        wallet = item["wallet"]
        if not ADDRESS_RE.fullmatch(wallet):
            issues.append(issue("INVALID_WALLET", "holders", row, "wallet", "钱包必须是 0x 开头的 40 位十六进制 EVM 地址。"))
        else:
            wallet = wallet.lower()
            item["wallet"] = wallet
            if wallet in wallets:
                issues.append(issue("DUPLICATE_WALLET", "holders", row, "wallet", f"登记钱包与第 {wallets[wallet]} 行重复，不能确定唯一持有人。"))
            else:
                wallets[wallet] = row
        if not UNITS_RE.fullmatch(item["token_units"]):
            issues.append(issue("INVALID_UNITS", "holders", row, "token_units", "持有数量须为非负十进制，最多 18 位整数及 18 位小数。"))
        else:
            item["token_units"] = canonical_units(item["token_units"])


def validate_payment_rows(dataset: Dataset, rules: Rules, issues: list[dict], warnings: list[dict]) -> None:
    events: dict[str, dict] = {}
    record_start = datetime.combine(rules.record_date, datetime.min.time(), rules.payment_due_at.tzinfo)
    for item in dataset.rows:
        row = item["_source_row"]
        before = issue_count(issues)
        for key, expected in [("project_id", rules.project_id), ("batch_id", rules.batch_id), ("chain_id", rules.chain_id)]:
            if item[key] != expected:
                issues.append(issue("SCOPE_MISMATCH", "payments", row, key, "付款记录与本次项目、批次或网络范围不一致。"))
        item["currency"] = item["currency"].upper()
        if item["currency"] != rules.currency:
            issues.append(issue("CURRENCY_MISMATCH", "payments", row, "currency", "付款币种与本次规则不一致。"))
        for key in ("payment_token", "to_wallet"):
            if not ADDRESS_RE.fullmatch(item[key]):
                issues.append(issue("INVALID_ADDRESS", "payments", row, key, "地址必须是 0x 开头的 40 位十六进制 EVM 地址。"))
            else:
                item[key] = item[key].lower()
        if item["payment_token"] != rules.payment_token:
            issues.append(issue("TOKEN_MISMATCH", "payments", row, "payment_token", "付款代币合约与本次规则不一致。"))
        if not HASH_RE.fullmatch(item["tx_hash"]):
            issues.append(issue("INVALID_TX_HASH", "payments", row, "tx_hash", "交易哈希必须是 0x 开头的 64 位十六进制字符串。"))
        else:
            item["tx_hash"] = item["tx_hash"].lower()
        if not UINT_RE.fullmatch(item["event_index"]):
            issues.append(issue("INVALID_EVENT_INDEX", "payments", row, "event_index", "事件序号必须是非负整数，不能含前导零。"))
        if not AMOUNT_RE.fullmatch(item["amount"]):
            issues.append(issue("INVALID_AMOUNT", "payments", row, "amount", "金额须为非负十进制，最多 24 位整数及 6 位小数。"))
        else:
            item["amount"] = money(Decimal(item["amount"]))
        if item["status"] not in {"confirmed", "pending", "failed"}:
            issues.append(issue("INVALID_STATUS", "payments", row, "status", "付款状态只支持 confirmed、pending 或 failed。"))
        parsed_times = {}
        for key in ("submitted_at", "confirmed_at"):
            value = item[key]
            if not value:
                if key == "submitted_at" or item["status"] == "confirmed":
                    issues.append(issue("MISSING_TIMESTAMP", "payments", row, key, "缺少本状态所需的时间字段。"))
                continue
            try:
                stamp = aware_datetime(value)
            except ValueError as error:
                issues.append(issue("INVALID_TIMESTAMP", "payments", row, key, str(error)))
                continue
            parsed_times[key] = stamp
            item[key] = stamp.astimezone(timezone.utc).isoformat()
            if stamp > rules.as_of:
                issues.append(issue("FUTURE_TIMESTAMP", "payments", row, key, "付款时间晚于本次核对时间，请更正快照或核对时间。"))
            if stamp < record_start:
                issues.append(issue("BEFORE_RECORD_DATE", "payments", row, key, "付款时间早于本次记录日，请核对所属分配批次。"))
        if "confirmed_at" in parsed_times and item["status"] != "confirmed":
            issues.append(issue("STATUS_TIME_CONFLICT", "payments", row, "confirmed_at", "非 confirmed 状态不应填写确认时间，请先解决状态歧义。"))
        if parsed_times.get("confirmed_at") and parsed_times.get("submitted_at") and parsed_times["confirmed_at"] < parsed_times["submitted_at"]:
            issues.append(issue("TIMESTAMP_ORDER", "payments", row, "confirmed_at", "确认时间不能早于提交时间。"))
        if issue_count(issues) != before:
            continue
        key = f"{item['chain_id']}:{item['tx_hash']}:{item['event_index']}"
        item["_event_key"] = key
        original = events.get(key)
        if original:
            same = all(item[column] == original[column] for column in PAYMENT_COLUMNS)
            if same:
                item["_duplicate_of"] = original["_source_row"]
                warnings.append(issue("DUPLICATE_IMPORT", "payments", row, "tx_hash", f"与第 {original['_source_row']} 行为同一事件的相同记录，仅计入一次。"))
            else:
                issues.append(issue("EVENT_CONFLICT", "payments", row, "tx_hash", f"与第 {original['_source_row']} 行使用相同事件键，但业务内容不同，请先更正。"))
        else:
            events[key] = item


def validate_inputs(raw_rules: str, holders_data: bytes, holders_name: str, payments_data: bytes, payments_name: str) -> ValidatedInputs:
    rules, rule_issues = parse_rules(raw_rules)
    issues = IssueList(rule_issues)
    warnings: list[dict] = []
    holders = parse_csv(holders_data, holders_name, "holders", issues)
    payments = parse_csv(payments_data, payments_name, "payments", issues)
    holders_valid = not any(item["file"] == "holders" for item in issues)
    if rules and set(holders.columns) == set(HOLDER_COLUMNS):
        before = issue_count(issues)
        validate_holder_rows(holders, rules, issues)
        holders_valid = holders_valid and issue_count(issues) == before
    if rules and set(payments.columns) == set(PAYMENT_COLUMNS):
        validate_payment_rows(payments, rules, issues, warnings)
        # An invalid/empty snapshot cannot establish that a recipient is unknown.
        # Report the snapshot errors first instead of inventing unmatched wallets.
        if holders_valid:
            known = {row["wallet"] for row in holders.rows}
            for item in payments.rows:
                if ADDRESS_RE.fullmatch(item["to_wallet"]) and item["to_wallet"] not in known:
                    warnings.append(issue("UNMATCHED_WALLET", "payments", item["_source_row"], "to_wallet", "收款钱包不在持有人快照中，将单列为待核实付款。"))
    if rules and not rules.synthetic:
        warnings.append(issue("USER_SUPPLIED_STATUS", "rules", None, "synthetic", "付款状态仅来自上传文件，系统未连接链上或验证交易真实性。"))
    return ValidatedInputs(rules, holders, payments, issues, warnings)
