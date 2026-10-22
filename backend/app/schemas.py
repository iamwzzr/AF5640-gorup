"""Input schema and canonical decimal/date helpers."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP, localcontext
import re

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AMOUNT_QUANTUM = Decimal("0.000001")
ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
HASH_RE = re.compile(r"^0x[0-9a-fA-F]{64}$")
AMOUNT_RE = re.compile(r"^(?:0|[1-9]\d{0,23})(?:\.\d{1,6})?$")
UNITS_RE = re.compile(r"^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$")
PAYOUT_RE = re.compile(r"^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$")
UINT_RE = re.compile(r"^(?:0|[1-9]\d{0,19})$")


def money(value: Decimal) -> str:
    with localcontext() as context:
        context.prec = 80
        rounded = value.quantize(AMOUNT_QUANTUM, rounding=ROUND_HALF_UP)
        return format(abs(rounded) if rounded == 0 else rounded, ".6f")


def canonical_units(value: str) -> str:
    number = Decimal(value)
    text = format(number, "f")
    return text.rstrip("0").rstrip(".") if "." in text else text


def aware_datetime(value: str) -> datetime:
    # ISO timestamps must include a time and an explicit offset (or Z).
    if not isinstance(value, str) or "T" not in value:
        raise ValueError("时间必须使用带时区的 ISO 格式，例如 2026-10-15T12:00:00+08:00。")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValueError("时间格式无效，请使用带时区的 ISO 时间。") from exc
    offset = parsed.utcoffset()
    if parsed.tzinfo is None or offset is None:
        raise ValueError("时间必须明确包含时区偏移，不能使用无时区时间。")
    if offset % timedelta(minutes=1):
        raise ValueError("时区偏移必须精确到整分钟，例如 +08:00 或 Z。")
    try:
        parsed.astimezone(timezone.utc)
    except (ValueError, OverflowError) as exc:
        raise ValueError("时间超出可支持的范围，请检查日期与时区。") from exc
    return parsed


class Rules(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    project_id: str = Field(strict=True, min_length=1, max_length=100)
    project_name: str = Field(strict=True, min_length=1, max_length=200)
    batch_id: str = Field(strict=True, min_length=1, max_length=100)
    record_date: date
    payment_due_at: datetime
    as_of: datetime
    payout_per_token: str = Field(strict=True)
    chain_id: str = Field(strict=True)
    currency: str = Field(strict=True, min_length=1, max_length=20)
    payment_token: str = Field(strict=True)
    synthetic: bool = Field(strict=True)

    @field_validator("record_date", mode="before")
    @classmethod
    def date_text(cls, value: object) -> object:
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("记录日必须使用 YYYY-MM-DD 格式。")
        return value

    @field_validator("payment_due_at", "as_of", mode="before")
    @classmethod
    def timestamp(cls, value: object) -> datetime:
        return aware_datetime(value)

    @field_validator("payout_per_token")
    @classmethod
    def payout(cls, value: str) -> str:
        if not PAYOUT_RE.fullmatch(value):
            raise ValueError("每枚分配额必须是非负十进制字符串，最多 12 位整数及 6 位小数。")
        return money(Decimal(value))

    @field_validator("chain_id")
    @classmethod
    def chain(cls, value: str) -> str:
        if not UINT_RE.fullmatch(value) or int(value) == 0:
            raise ValueError("网络编号必须是正整数字符串，不能含前导零。")
        return value

    @field_validator("payment_token")
    @classmethod
    def token(cls, value: str) -> str:
        if not ADDRESS_RE.fullmatch(value):
            raise ValueError("付款代币标识必须是 0x 开头的 40 位十六进制 EVM 地址。")
        return value.lower()

    @field_validator("currency")
    @classmethod
    def currency_code(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]{0,19}", value):
            raise ValueError("币种代码只能包含英文字母、数字、点、下划线或连字符。")
        return value.upper()

    @model_validator(mode="after")
    def date_order(self) -> "Rules":
        record_instant = datetime.combine(self.record_date, datetime.min.time(), self.payment_due_at.tzinfo)
        if self.payment_due_at < record_instant:
            raise ValueError("付款截止时间不能早于记录日零时（按付款截止时间的时区）。")
        if self.as_of < record_instant:
            raise ValueError("核对时间不能早于记录日零时（按付款截止时间的时区）。")
        return self

    def as_dict(self) -> dict:
        return self.model_dump(mode="json")
