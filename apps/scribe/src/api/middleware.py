import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        settings = get_settings()

        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        if not request.url.path.startswith("/api/health"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response


class RequestTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        import uuid

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        start_time = time.perf_counter()

        request.state.request_id = request_id

        response = await call_next(request)

        process_time = time.perf_counter() - start_time

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{process_time:.3f}s"

        if process_time > 5.0:
            logger.warning(
                "Slow request detected",
                request_id=request_id,
                path=request.url.path,
                method=request.method,
                duration_seconds=process_time,
            )

        return response


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    MAX_BODY_SIZE = 50 * 1024 * 1024

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        settings = get_settings()
        max_size = getattr(settings, "max_request_size", self.MAX_BODY_SIZE)

        content_length = request.headers.get("content-length")

        if content_length:
            content_length = int(content_length)
            if content_length > max_size:
                logger.warning(
                    "Request body too large",
                    content_length=content_length,
                    max_size=max_size,
                    path=request.url.path,
                )
                return Response(
                    content='{"detail": "Request body too large"}',
                    status_code=413,
                    media_type="application/json",
                )

        return await call_next(request)
