from fastapi.testclient import TestClient


def test_health_is_public_and_reports_fixture_readiness(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "data_mode": "fixture",
        "nessie_configured": False,
        "demo_controls_enabled": False,
    }
