import secrets

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


class InternalAuthError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.headers = headers or {}


class InternalAuthService:
    def __init__(self) -> None:
        self._settings = get_settings()

    def verify_request(
        self,
        x_internal_api_key: str | None,
        authorization: str | None,
    ) -> None:
        expected_key = self._settings.internal_api_key
        if not expected_key:
            logger.warning("INTERNAL_API_KEY not configured, skipping auth verification")
            return

        if x_internal_api_key is not None:
            if secrets.compare_digest(x_internal_api_key, expected_key):
                return
            raise InternalAuthError(403, "Invalid internal API key")

        token = self._extract_bearer_token(authorization)
        if token is not None:
            if secrets.compare_digest(token, expected_key):
                return
            raise InternalAuthError(403, "Invalid authorization token")

        raise InternalAuthError(
            401,
            "Internal API key required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    @staticmethod
    def _extract_bearer_token(authorization: str | None) -> str | None:
        if authorization is None or not authorization.startswith("Bearer "):
            return None
        return authorization[7:]


def generate_internal_api_key() -> str:
    return secrets.token_hex(32)


_internal_auth_service: InternalAuthService | None = None


def get_internal_auth_service() -> InternalAuthService:
    global _internal_auth_service
    if _internal_auth_service is None:
        _internal_auth_service = InternalAuthService()
    return _internal_auth_service
