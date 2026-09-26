import pytest
from fastapi import status


@pytest.mark.asyncio
async def test_cors_allows_configured_nextjs_origin(client):
    response = await client.options(
        "/api/auth/login",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert response.headers["access-control-allow-credentials"] == "true"
