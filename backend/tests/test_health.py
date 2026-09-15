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
    assert "/api/v2/auth/context" in response.json()["paths"]
    assert "/api/v2/vehicles" in response.json()["paths"]
    assert response.json()["paths"]["/api/v2/vehicles"]["post"]["responses"]["201"]
    assert "/api/v2/work-orders" in response.json()["paths"]
    assert "/api/v2/driver/inspections" in response.json()["paths"]
    assert "/api/v2/driver/assignment" in response.json()["paths"]
    assert "/api/v2/driver/fuel-logs" in response.json()["paths"]
    assert "/api/v2/vehicle-issues" in response.json()["paths"]
    assert "/api/v2/components" in response.json()["paths"]
    assert "/api/v2/planning/maintenance" in response.json()["paths"]
    assert "/api/v2/inventory/parts" in response.json()["paths"]
    assert "/api/v2/documents" in response.json()["paths"]
    assert "/api/v2/vendors" in response.json()["paths"]
    assert "/api/v2/purchase-orders" in response.json()["paths"]


def test_protected_fleet_route_requires_authentication() -> None:
    client = TestClient(create_app())
    response = client.get("/api/v2/vehicles")
    assert response.status_code == 401
