from fastapi.testclient import TestClient


def test_health_check_endpoint(client: TestClient):
    """Test health check returns 200 and healthy database connectivity."""
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert "app_name" in data
    assert "environment" in data



# -----------------------------------------------------------------------------
# CORS configuration (Backend_missing.md #5)
# -----------------------------------------------------------------------------


def test_cors_allows_cross_origin_preflight(client: TestClient):
    """A browser preflight from another origin succeeds and echoes the origin."""
    res = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert res.status_code == 200
    assert res.headers.get("access-control-allow-origin") in {"*", "http://localhost:5173"}


def test_cors_headers_present_on_actual_request(client: TestClient):
    """Non-preflight responses carry the allow-origin header too."""
    res = client.get("/api/v1/health", headers={"Origin": "http://localhost:5173"})
    assert res.status_code == 200
    assert "access-control-allow-origin" in {k.lower() for k in res.headers}


def test_cors_origins_are_configurable():
    """CORS_ORIGINS parses into a list, so deployments can lock the API down."""
    from app.core.config import Settings

    settings = Settings(CORS_ORIGINS="https://app.example.com, https://admin.example.com", _env_file=None)
    assert settings.cors_origin_list == [
        "https://app.example.com",
        "https://admin.example.com",
    ]

    wildcard = Settings(CORS_ORIGINS="*", _env_file=None)
    assert wildcard.cors_origin_list == ["*"]
