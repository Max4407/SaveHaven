from datetime import date

from fastapi.testclient import TestClient


def test_protected_routes_require_a_signed_demo_session(client: TestClient) -> None:
    assert client.get("/api/demo/nessie-profiles").status_code == 401
    assert client.get("/api/game/catalog").status_code == 401
    assert client.get("/api/game/state").status_code == 401
    assert client.get("/api/game/rewards").status_code == 401
    assert client.post(
        "/api/goals",
        json={
            "name": "Emergency fund",
            "target_amount_cents": 300_000,
            "amount_already_saved_cents": 0,
            "target_date": "2027-10-17",
        },
    ).status_code == 401
    assert client.post(
        "/api/demo/nessie-events",
        json={
            "event_type": "paycheck",
            "amount_cents": 185_000,
            "idempotency_key": "auth-demo-001",
        },
    ).status_code == 401
    assert client.post(
        "/api/demo/simulate-successful-week",
        json={"idempotency_key": "auth-week-001"},
    ).status_code == 401


def test_demo_login_grants_access_without_collecting_credentials(client: TestClient) -> None:
    login_response = client.post(
        "/api/auth/demo-login",
        json={"user_id": "demo-player"},
    )

    assert login_response.status_code == 200
    assert login_response.json() == {
        "id": "demo-player",
        "display_name": "Demo Player",
    }
    assert "HttpOnly" in login_response.headers["set-cookie"]
    assert "SameSite=lax" in login_response.headers["set-cookie"]
    assert client.get("/api/auth/session").json() == {
        "id": "demo-player",
        "display_name": "Demo Player",
    }
    assert client.get("/api/demo/nessie-profiles").status_code == 200


def test_demo_login_rejects_unseeded_identities(client: TestClient) -> None:
    response = client.post(
        "/api/auth/demo-login",
        json={"user_id": "not-a-demo-user"},
    )

    assert response.status_code == 401


def test_tampered_session_cookie_is_rejected(client: TestClient) -> None:
    client.cookies.set("savehaven_session", "not-a-valid-signature")

    response = client.get("/api/demo/nessie-profiles")

    assert response.status_code == 401


def test_logout_revokes_browser_access(client: TestClient) -> None:
    client.post("/api/auth/demo-login", json={"user_id": "demo-player"})

    logout_response = client.post("/api/auth/logout")

    assert logout_response.status_code == 204
    assert client.get("/api/auth/session").status_code == 401
    assert client.get("/api/demo/nessie-profiles").status_code == 401


def test_switching_demo_users_restores_each_users_goal_and_town(client: TestClient) -> None:
    target_date = date(date.today().year + 1, 12, 1).isoformat()

    client.post("/api/auth/demo-login", json={"user_id": "demo-player"})
    client.post("/api/bank-connections", json={"profile_id": "steady-paycheck"})
    player_goal = client.post(
        "/api/goals",
        json={
            "name": "Emergency fund",
            "target_amount_cents": 300_000,
            "amount_already_saved_cents": 50_000,
            "target_date": target_date,
        },
    )
    player_purchase = client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "woodshed_01", "grid_x": 4, "grid_y": 4},
    )
    assert player_goal.status_code == 201
    assert player_purchase.status_code == 201
    client.post("/api/auth/logout")

    client.post("/api/auth/demo-login", json={"user_id": "demo-reviewer"})
    client.post("/api/bank-connections", json={"profile_id": "variable-income"})
    reviewer_goal = client.post(
        "/api/goals",
        json={
            "name": "Travel fund",
            "target_amount_cents": 180_000,
            "amount_already_saved_cents": 20_000,
            "target_date": target_date,
        },
    )
    reviewer_purchase = client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "hut_01", "grid_x": 8, "grid_y": 8},
    )
    assert reviewer_goal.status_code == 201
    assert reviewer_purchase.status_code == 201
    client.post("/api/auth/logout")

    client.post("/api/auth/demo-login", json={"user_id": "demo-player"})
    player_dashboard = client.get("/api/dashboard").json()
    player_state = client.get("/api/game/state").json()
    assert player_dashboard["active_goal"]["name"] == "Emergency fund"
    assert [building["catalog_item_id"] for building in player_state["buildings"]] == [
        "woodshed_01"
    ]
    client.post("/api/auth/logout")

    client.post("/api/auth/demo-login", json={"user_id": "demo-reviewer"})
    reviewer_dashboard = client.get("/api/dashboard").json()
    reviewer_state = client.get("/api/game/state").json()
    assert reviewer_dashboard["active_goal"]["name"] == "Travel fund"
    assert [building["catalog_item_id"] for building in reviewer_state["buildings"]] == [
        "hut_01"
    ]
