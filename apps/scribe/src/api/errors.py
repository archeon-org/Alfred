from fastapi import Request
from fastapi.responses import JSONResponse

from application.api.errors import ApiServiceError


async def api_service_error_handler(
    request: Request,
    error: ApiServiceError,
) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"detail": error.detail},
    )
