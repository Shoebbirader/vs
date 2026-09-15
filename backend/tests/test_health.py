from fastapi.testclient import TestClient

from app.main import create_app


def test_health_endpoint() -> None:
    client = TestClient(create_app())
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["ok"] is True


def test_v2_docs_are_available_outside_production() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v2/openapi.json")
    assert response.status_code == 200
    assert "/api/v2/auth/me" in response.json()["paths"]
    assert "/api/v2/vehicles" in response.json()["paths"]


def test_protected_fleet_route_requires_authentication() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v2/vehicles")
    assert response.status_code == 401
