import logging

from fastapi import Request
from fastapi.responses import JSONResponse

from app.exceptions.custom_exceptions import AppException

logger = logging.getLogger("app")


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    logger.warning(f"{exc.__class__.__name__}: {exc.message} | path={request.url.path}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.__class__.__name__, "message": exc.message},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(f"Unhandled exception on {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "InternalServerError", "message": "An unexpected error occurred"},
    )


def register_exception_handlers(app):
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)