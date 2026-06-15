"""
middleware/logging_middleware.py
---------------------------------
Request/response logging middleware.
Logs method, path, status code, and duration for every request.
Sensitive paths (auth) have their bodies redacted.
"""
import logging
import time
from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("cdss.access")

REDACTED_PATHS = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh"}


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Log every HTTP request with method, path, status, and latency."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = int((time.perf_counter() - start) * 1000)

        logger.info(
            "%s %s → %d (%dms)",
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        # Expose timing header so frontend can display it
        response.headers["X-Response-Time-Ms"] = str(duration_ms)
        return response
