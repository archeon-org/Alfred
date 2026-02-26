from fastapi import Header, HTTPException

from application.api.auth_service import (
    InternalAuthError,
    get_internal_auth_service,
)
from application.api.auth_service import (
    generate_internal_api_key as generate_api_key,
)


async def verify_internal_service(
    x_internal_api_key: str | None = Header(None, alias="X-Internal-API-Key"),
    authorization: str | None = Header(None),
) -> None:
    service = get_internal_auth_service()
    try:
        service.verify_request(
            x_internal_api_key=x_internal_api_key,
            authorization=authorization,
        )
    except InternalAuthError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail=error.detail,
            headers=error.headers,
        ) from error


def generate_internal_api_key() -> str:
    return generate_api_key()
