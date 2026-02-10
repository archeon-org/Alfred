"""
Security Middleware

Provides security headers and request validation for the Scribe API.
"""

import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Add security headers to all responses.

    Headers added:
    - X-Content-Type-Options: nosniff
    - X-Frame-Options: DENY
    - X-XSS-Protection: 1; mode=block
    - Strict-Transport-Security (production only)
    - Cache-Control for API responses
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        settings = get_settings()

        response = await call_next(request)

        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # HSTS in production
        if settings.is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        # Disable caching for API responses (except health checks)
        if not request.url.path.startswith("/api/health"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """
    Add request timing headers for monitoring and debugging.

    Headers added:
    - X-Request-ID: Unique request identifier
    - X-Response-Time: Time taken to process request
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        import uuid

        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        start_time = time.perf_counter()

        # Add request_id to state for logging
        request.state.request_id = request_id

        response = await call_next(request)

        # Calculate processing time
        process_time = time.perf_counter() - start_time

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{process_time:.3f}s"

        # Log slow requests
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
    """
    Limit request body size to prevent DoS attacks.

    Default limit: 50MB (configurable via settings)
    """

    # 50MB default limit
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
