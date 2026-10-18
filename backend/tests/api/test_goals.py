from datetime import date

from fastapi.testclient import TestClient


def goal_payload() -> dict[str, object]:
    return {
        "name": "Emergency fund",
        "target_amount_cents": 1_000_000,
        "amount_already_saved_cents": 50_000,
        "target_date": date(date.today().year + 1, 12, 1).isoformat(),
    }


def test_goal_generates_and_accepts_an_explainable_plan(
    logged_in_client: TestClient,
) -> None:
    logged_in_client.post("/api/bank-connections", json={"profile_id": "steady-paycheck"})

    created = logged_in_client.post("/api/goals", json=goal_payload())

    assert created.status_code == 201
    body = created.json()
    assert body["plan"]["status"] == "draft"
    assert body["plan"]["weekly_savings_cents"] > 0
    assert body["forecast"]["income_cadence"] == "biweekly"
    assert body["goal"]["amount_already_saved_cents"] == 50_000
    accepted = logged_in_client.post(f"/api/goals/{body['goal']['id']}/accept-plan")
    assert accepted.status_code == 200
    assert accepted.json()["plan"]["status"] == "accepted"
    assert logged_in_client.get("/api/dashboard").json()["current_plan"]["status"] == "accepted"


def test_bank_refresh_does_not_overwrite_user_entered_goal_progress(
    logged_in_client: TestClient,
) -> None:
    logged_in_client.post("/api/bank-connections", json={"profile_id": "steady-paycheck"})
    created = logged_in_client.post("/api/goals", json=goal_payload()).json()
    assert created["goal"]["amount_already_saved_cents"] == 50_000

    logged_in_client.post("/api/bank-connections/sync")
    dashboard = logged_in_client.get("/api/dashboard").json()

    assert dashboard["summary"]["savings_balance_cents"] == 625_000
    assert dashboard["active_goal"]["amount_already_saved_cents"] == 50_000


def test_goal_rejects_already_saved_money_not_present_in_savings(
    logged_in_client: TestClient,
) -> None:
    logged_in_client.post("/api/bank-connections", json={"profile_id": "variable-income"})
    payload = goal_payload()
    payload["amount_already_saved_cents"] = 200_000

    response = logged_in_client.post("/api/goals", json=payload)

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "Already-saved amount cannot exceed the current savings balance"
    )


def test_goal_access_is_scoped_to_the_signed_in_user(client: TestClient) -> None:
    client.post(
        "/api/auth/demo-login",
        json={"email": "jordan.lee@savehaven.demo", "password": "savehaven-demo"},
    )
    client.post("/api/bank-connections", json={"profile_id": "steady-paycheck"})
    goal_id = client.post("/api/goals", json=goal_payload()).json()["goal"]["id"]

    client.post(
        "/api/auth/demo-login",
        json={"email": "alex.morgan@savehaven.demo", "password": "savehaven-demo"},
    )

    assert client.get(f"/api/goals/{goal_id}/plan").status_code == 404
    assert client.post(f"/api/goals/{goal_id}/accept-plan").status_code == 404
