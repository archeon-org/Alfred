"""
Authentication Module

Security utilities for internal service-to-service communication.
Provides API key validation for Gate -> Scribe requests.
"""

from typing import Optional

from fastapi import Header, HTTPException, status

from core.config import get_settings
from core.logging import get_logger

logger = get_logger(__name__)


async def verify_internal_service(
    x_internal_api_key: Optional[str] = Header(None, alias="X-Internal-API-Key"),
    authorization: Optional[str] = Header(None),
) -> None:
    """
    Verify that the request comes from an authorized internal service.

    This dependency checks for a valid internal API key in either:
    - X-Internal-API-Key header (preferred)
    - Authorization header with Bearer token

    Parameters
    ----------
    x_internal_api_key : str, optional
        The internal API key from X-Internal-API-Key header.
    authorization : str, optional
        The Authorization header (Bearer token fallback).

    Raises
    ------
    HTTPException
        401 if no credentials provided.
        403 if credentials are invalid.

    Usage
    -----
    ```python
    from api.auth import verify_internal_service

    @router.get("/protected")
    async def protected_endpoint(
        _: None = Depends(verify_internal_service)
    ):
        return {"status": "authorized"}
    ```
    """
    settings = get_settings()
    expected_key = settings.internal_api_key

    # If no internal API key is configured, allow all requests (dev mode)
    if not expected_key:
        logger.warning(
            "INTERNAL_API_KEY not set - allowing unauthenticated requests. "
            "This should only happen in development!"
        )
        return

    # Check X-Internal-API-Key header first
    if x_internal_api_key:
        if x_internal_api_key == expected_key:
            return
        else:
            logger.warning("Invalid internal API key provided")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Invalid internal API key",
            )

    # Fall back to Authorization header
    if authorization:
        if authorization.startswith("Bearer "):
            token = authorization[7:]  # Remove "Bearer " prefix
            if token == expected_key:
                return

        logger.warning("Invalid authorization token provided")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid authorization token",
        )

    # No credentials provided
    logger.warning("No authentication credentials provided for internal API")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Internal API key required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def generate_internal_api_key() -> str:
    """
    Generate a secure random API key for internal service communication.

    Returns
    -------
    str
        A 64-character hex string suitable for use as an API key.

    Usage
    -----
    ```bash
    python -c "from api.auth import generate_internal_api_key; print(generate_internal_api_key())"
    ```
    """
    import secrets

    return secrets.token_hex(32)


# For convenience, allow direct execution to generate a key
if __name__ == "__main__":
    print("Generated Internal API Key:")
    print(generate_internal_api_key())
