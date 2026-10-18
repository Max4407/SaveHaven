from fastapi.testclient import TestClient


def test_demo_profiles_offer_distinct_financial_scenarios(
    logged_in_client: TestClient,
) -> None:
    response = logged_in_client.get("/api/demo/nessie-profiles")

    assert response.status_code == 200
    profiles = response.json()
    assert [profile["id"] for profile in profiles] == [
        "steady-paycheck",
        "variable-income",
        "tight-budget",
    ]


def test_connecting_profile_materializes_normalized_dashboard(
    logged_in_client: TestClient,
) -> None:
    connection_response = logged_in_client.post(
        "/api/bank-connections",
        json={"profile_id": "steady-paycheck"},
    )

    assert connection_response.status_code == 200
    assert connection_response.json()["data_source"] == "fixture"

    dashboard_response = logged_in_client.get("/api/dashboard")
    assert dashboard_response.status_code == 200
    dashboard = dashboard_response.json()
    assert dashboard["summary"] == {
        "as_of": "2026-10-14",
        "total_balance_cents": 967650,
        "checking_balance_cents": 342650,
        "savings_balance_cents": 625000,
        "income_last_30_days_cents": 370000,
        "spending_last_30_days_cents": 154750,
    }
    assert dashboard["forecast"]["income_cadence"] == "biweekly"
    assert dashboard["forecast"]["detected_deposit_count"] == 2
    assert dashboard["import_summary"] == {
        "account_count": 2,
        "transaction_count": 7,
        "transaction_types": ["bill", "deposit", "purchase"],
    }
    assert dashboard["active_goal"] is None
    assert dashboard["current_plan"] is None


def test_sync_replaces_cached_rows_instead_of_duplicating_them(
    logged_in_client: TestClient,
) -> None:
    logged_in_client.post(
        "/api/bank-connections",
        json={"profile_id": "steady-paycheck"},
    )
    first_dashboard = logged_in_client.get("/api/dashboard").json()

    sync_response = logged_in_client.post("/api/bank-connections/sync")
    second_dashboard = logged_in_client.get("/api/dashboard").json()

    assert sync_response.status_code == 200
    assert len(second_dashboard["recent_transactions"]) == len(
        first_dashboard["recent_transactions"]
    )


def test_connection_errors_are_actionable(logged_in_client: TestClient) -> None:
    missing_profile = logged_in_client.post(
        "/api/bank-connections",
        json={"profile_id": "missing-profile"},
    )

    assert missing_profile.status_code == 404


def test_each_demo_user_has_isolated_financial_state(client: TestClient) -> None:
    client.post(
        "/api/auth/demo-login",
        json={"email": "jordan.lee@savehaven.demo", "password": "savehaven-demo"},
    )
    client.post(
        "/api/bank-connections",
        json={"profile_id": "steady-paycheck"},
    )

    client.post(
        "/api/auth/demo-login",
        json={"email": "alex.morgan@savehaven.demo", "password": "savehaven-demo"},
    )
    response = client.get("/api/dashboard")

    assert response.status_code == 409
