"""Local API and optional production frontend; no database or result persistence."""

from pathlib import Path
import logging
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Receive, Scope, Send

from . import __version__
from .engine import reconcile
from .export import make_zip
from .parser import MAX_FILE_BYTES, issue, validate_inputs

logger = logging.getLogger("af5640")
MAX_REQUEST_BYTES = 12 * 1024 * 1024


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        header_map = dict(scope.get("headers", []))
        try:
            content_length = int(header_map.get(b"content-length", b"0"))
        except ValueError:
            content_length = 0
        if content_length > MAX_REQUEST_BYTES:
            await JSONResponse(status_code=413, content={"error": {"code": "REQUEST_TOO_LARGE", "message": "请求过大：每份文件上限为 5 MiB。"}})(scope, receive, send)
            return
        count = 0

        async def limited_receive() -> dict:
            nonlocal count
            message = await receive()
            count += len(message.get("body", b""))
            if count > MAX_REQUEST_BYTES:
                raise StarletteHTTPException(status_code=413, detail="请求过大：每份文件上限为 5 MiB。")
            return message

        await self.app(scope, limited_receive, send)


app = FastAPI(title="AF5640-gorup", version=__version__, docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
app.add_middleware(BodyLimitMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"], allow_methods=["GET", "POST"], allow_headers=["Content-Type"], allow_credentials=False)


@app.exception_handler(RequestValidationError)
async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    issues = [issue("MISSING_OR_INVALID_FIELD", "rules", None, str(error["loc"][-1]), "缺少请求字段或字段类型无效，请同时提交规则和两份 CSV。") for error in exc.errors()]
    return JSONResponse(status_code=422, content={"error": {"code": "INPUT_INVALID", "message": "请求字段不完整或格式无效。", "issues": issues}})


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    message = "请求过大：每份文件上限为 5 MiB。" if exc.status_code == 413 else "请求无法处理，请确认上传格式或访问地址。"
    return JSONResponse(status_code=exc.status_code, content={"error": {"code": "REQUEST_TOO_LARGE" if exc.status_code == 413 else "REQUEST_ERROR", "message": message}})


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
    # Log only the exception class, never uploaded file contents or financial data.
    logger.error("Unexpected request error: %s", type(exc).__name__)
    return JSONResponse(status_code=500, content={"error": {"code": "INTERNAL_ERROR", "message": "本次处理未完成，请检查文件格式后重试。服务器没有保存本次核对结果。"}})


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "project": "AF5640-gorup", "version": __version__}


async def read_inputs(rules: str, holders_file: UploadFile, payments_file: UploadFile):
    try:
        holders_data = await holders_file.read(MAX_FILE_BYTES + 1)
        payments_data = await payments_file.read(MAX_FILE_BYTES + 1)
        if len(holders_data) > MAX_FILE_BYTES or len(payments_data) > MAX_FILE_BYTES:
            raise StarletteHTTPException(status_code=413)
        return validate_inputs(rules, holders_data, holders_file.filename or "holders.csv", payments_data, payments_file.filename or "payments.csv")
    finally:
        await holders_file.close()
        await payments_file.close()


@app.post("/api/validate")
async def validate_endpoint(
    rules: Annotated[str, Form()],
    holders_file: Annotated[UploadFile, File()],
    payments_file: Annotated[UploadFile, File()],
) -> JSONResponse:
    return JSONResponse(content=(await read_inputs(rules, holders_file, payments_file)).response(), headers={"Cache-Control": "no-store"})


@app.post("/api/reconcile")
async def reconcile_endpoint(
    rules: Annotated[str, Form()],
    holders_file: Annotated[UploadFile, File()],
    payments_file: Annotated[UploadFile, File()],
    format: Annotated[Literal["json", "zip"], Query()] = "json",
) -> Response:
    inputs = await read_inputs(rules, holders_file, payments_file)
    if inputs.issues:
        return JSONResponse(status_code=422, content={"error": {"code": "INPUT_INVALID", "message": "输入存在歧义或格式错误，请更正后重新核对。", "issues": inputs.issues}})
    result = reconcile(inputs)
    if format == "zip":
        return Response(content=make_zip(result, inputs.rules.as_dict()), media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="AF5640-gorup-reconciliation.zip"', "Cache-Control": "no-store"})
    return JSONResponse(content=result, headers={"Cache-Control": "no-store"})


FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class FrontendFiles(StaticFiles):
    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            response = await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            # Extensionless client-side routes can fall back to the SPA, while
            # missing assets/examples remain real 404s rather than HTML downloads.
            if exc.status_code == 404 and not Path(path).suffix and not path.startswith(("api/", "examples/", "templates/", "assets/")):
                return FileResponse(Path(self.directory) / "index.html")
            raise
        return response


if FRONTEND_DIST.joinpath("index.html").is_file():
    app.mount("/", FrontendFiles(directory=FRONTEND_DIST, html=True), name="frontend")
else:
    @app.get("/")
    async def api_home() -> dict:
        return {"project": "AF5640-gorup", "message": "后端已运行。开发界面请访问 http://localhost:5173；构建前端后重启后端可在此地址打开应用。", "docs": "/api/docs"}
