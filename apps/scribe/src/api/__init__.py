from api.health import router as health_router
from api.search import router as search_router
from api.question import router as question_router
from api.auth import verify_internal_service

__all__ = [
    "health_router",
    "search_router",
    "question_router",
    "verify_internal_service",
]
