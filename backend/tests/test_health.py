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

