from fastapi import Request
from fastapi.responses import JSONResponse
from keenable import (
    KeenableAPIError,
    KeenableConnectionError,
    KeenableError,
    KeenableInvalidRequestError,
    KeenableRateLimitError,
)


def keenable_status(exc: KeenableError) -> int:
    if isinstance(exc, KeenableInvalidRequestError):
        return 400
    if isinstance(exc, KeenableRateLimitError):
        return 429
    if isinstance(exc, KeenableConnectionError):
        return 503
    # Keenable rejected the arguments we passed on (e.g. an unparseable date filter).
    if isinstance(exc, KeenableAPIError) and exc.status_code == 400:
        return 400
    return 502


async def keenable_error_handler(request: Request, exc: KeenableError) -> JSONResponse:
    return JSONResponse(status_code=keenable_status(exc), content={"detail": str(exc)})
