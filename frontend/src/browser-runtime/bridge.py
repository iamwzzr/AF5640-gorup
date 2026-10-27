"""Static-host adapter. Calculation, input validation and ZIP output use the server modules."""

import base64
import json

from app.engine import reconcile
from app.export import make_zip
from app.parser import validate_inputs


def browser_request(data):
    inputs = validate_inputs(
        data["rules"], bytes(data["holders"]), data["holders_name"],
        bytes(data["payments"]), data["payments_name"],
    )
    if data["action"] == "validate":
        return json.dumps({"status": 200, "json": inputs.response()}, ensure_ascii=False)
    if inputs.issues:
        return json.dumps({"status": 422, "json": {"error": {
            "code": "INPUT_INVALID", "message": "输入存在歧义或格式错误，请更正后重新核对。",
            "issues": inputs.issues,
        }}}, ensure_ascii=False)
    result = reconcile(inputs)
    if data["action"] == "export":
        archive = make_zip(result, inputs.rules.as_dict())
        return json.dumps({"status": 200, "zip": base64.b64encode(archive).decode("ascii")})
    return json.dumps({"status": 200, "json": result}, ensure_ascii=False)
