from fastapi.testclient import TestClient


def test_nessie_mutations_are_hidden_when_demo_controls_are_disabled(
    logged_in_client: TestClient,
) -> None:
    response = logged_in_client.post(
        "/api/demo/nessie-events",
        json={
            "event_type": "paycheck",
            "amount_cents": 185_000,
            "idempotency_key": "paycheck-demo-001",
        },
    )

    assert response.status_code == 404


def test_nessie_event_amounts_must_be_whole_dollars(logged_in_client: TestClient) -> None:
    logged_in_client.app.state.settings.demo_controls_enabled = True
    response = logged_in_client.post(
        "/api/demo/nessie-events",
        json={
            "event_type": "paycheck",
            "amount_cents": 18_501,
            "idempotency_key": "paycheck-demo-002",
        },
    )

    assert response.status_code == 422
