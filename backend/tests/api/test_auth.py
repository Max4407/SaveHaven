from fastapi.testclient import TestClient


def test_protected_routes_require_a_signed_demo_session(client: TestClient) -> None:
    response = client.get("/api/demo/nessie-profiles")

    assert response.status_code == 401


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
