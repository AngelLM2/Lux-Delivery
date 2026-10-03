"""Framework-agnostic application errors.

Services raise these instead of ``HTTPException`` so they can be reused from the worker and
tested without FastAPI. A single handler translates them to HTTP responses.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import TimeoutError as SQLAlchemyTimeoutError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_ctx

logger = logging.getLogger(__name__)


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, detail: str, *, code: str | None = None, headers: dict[str, str] | None = None):
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code
        self.headers = headers


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class PayloadTooLarge(AppError):
    status_code = 413
    code = "payload_too_large"


class UnsupportedMediaType(AppError):
    status_code = 415
    code = "unsupported_media_type"


class UnprocessableEntity(AppError):
    status_code = 422
    code = "unprocessable_entity"


class TooManyRequests(AppError):
    status_code = 429
    code = "rate_limited"


class ServiceUnavailable(AppError):
    status_code = 503
    code = "service_unavailable"


def _body(detail: object, code: str) -> dict:
    return {"detail": detail, "code": code, "request_id": request_id_ctx.get()}


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(exc.detail, exc.code), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"loc": list(err.get("loc", ())), "msg": err.get("msg", ""), "type": err.get("type", "")}
            for err in exc.errors()
        ]
        return JSONResponse(_body(errors, "validation_error"), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {401: "unauthorized", 403: "forbidden", 404: "not_found", 405: "method_not_allowed"}.get(
            exc.status_code, "http_error"
        )
        return JSONResponse(_body(exc.detail, code), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(SQLAlchemyTimeoutError)
    async def _db_pool_exhausted(_: Request, exc: SQLAlchemyTimeoutError) -> JSONResponse:
        # Load shedding: an exhausted connection pool is overload, not a bug. 503 + Retry-After
        # tells clients and load balancers to back off instead of retrying immediately.
        logger.warning("db_pool_exhausted")
        return JSONResponse(
            _body("Servico sobrecarregado. Tente novamente em instantes.", "overloaded"),
            status_code=503,
            headers={"Retry-After": "2"},
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error", exc_info=exc)
        return JSONResponse(_body("Erro interno. Tente novamente.", "internal_error"), status_code=500)
