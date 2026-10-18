from fastapi.testclient import TestClient


def test_catalog_and_starter_wallet_are_server_authoritative(
    logged_in_client: TestClient,
) -> None:
    catalog = logged_in_client.get("/api/game/catalog")
    state = logged_in_client.get("/api/game/state")
    rewards = logged_in_client.get("/api/game/rewards")

    assert catalog.status_code == 200
    assert len(catalog.json()["items"]) == 13
    dirt_road = next(item for item in catalog.json()["items"] if item["id"] == "dirt_road_01")
    assert dirt_road["asset"] == "/full_dirt.png"
    assert (dirt_road["cost_coins"], dirt_road["render_kind"]) == (1, "ground")
    resident_counts = {
        item["id"]: item["resident_count"] for item in catalog.json()["items"]
    }
    assert resident_counts == {
        "dirt_road_01": 0,
        "woodshed_01": 0,
        "hut_01": 1,
        "cottage_01": 2,
        "well_01": 0,
        "townhouse_01": 3,
        "bakery_01": 1,
        "smithy_01": 1,
        "windmill_01": 1,
        "chapel_01": 2,
        "manor_01": 5,
        "gatehouse_01": 3,
        "keep_01": 2,
    }
    assert state.status_code == 200
    assert state.json()["wallet"] == {
        "coin_balance": 300,
        "total_coins_earned": 300,
        "xp": 0,
        "level": 1,
        "level_name": "Homestead",
        "streak_weeks": 0,
    }
    assert rewards.json()["rewards"][0]["reward_type"] == "starter_grant"


def test_purchase_move_and_sale_return_confirmed_state(
    logged_in_client: TestClient,
) -> None:
    purchase = logged_in_client.post(
        "/api/game/buildings",
        json={
            "catalog_item_id": "woodshed_01",
            "grid_x": 4,
            "grid_y": 4,
            "facing": "right",
        },
    )
    building_id = purchase.json()["buildings"][0]["id"]
    move = logged_in_client.patch(
        f"/api/game/buildings/{building_id}",
        json={"grid_x": 5, "grid_y": 4, "facing": "left"},
    )
    sale = logged_in_client.delete(f"/api/game/buildings/{building_id}")

    assert purchase.status_code == 201
    assert purchase.json()["wallet"]["coin_balance"] == 200
    assert purchase.json()["buildings"][0]["facing"] == "right"
    assert move.status_code == 200
    assert move.json()["wallet"]["coin_balance"] == 200
    assert move.json()["buildings"][0]["facing"] == "left"
    assert (move.json()["buildings"][0]["grid_x"], move.json()["buildings"][0]["grid_y"]) == (
        5,
        4,
    )
    assert sale.status_code == 200
    assert sale.json()["wallet"]["coin_balance"] == 260
    assert sale.json()["buildings"] == []


def test_failed_mutations_return_structured_conflicts_without_charging(
    logged_in_client: TestClient,
) -> None:
    locked = logged_in_client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "bakery_01", "grid_x": 4, "grid_y": 4},
    )
    outside = logged_in_client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "hut_01", "grid_x": 31, "grid_y": 4},
    )
    state = logged_in_client.get("/api/game/state")

    assert locked.status_code == 409
    assert locked.json()["detail"]["code"] == "level_locked"
    assert outside.json()["detail"]["code"] == "outside_town_map"
    assert state.json()["wallet"]["coin_balance"] == 300
    assert state.json()["buildings"] == []


def test_purchase_accepts_former_district_and_road_cells(
    logged_in_client: TestClient,
) -> None:
    outside_former_district = logged_in_client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "woodshed_01", "grid_x": 3, "grid_y": 4},
    )
    on_former_road = logged_in_client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "woodshed_01", "grid_x": 7, "grid_y": 5},
    )

    assert outside_former_district.status_code == 201
    assert on_former_road.status_code == 201
    assert len(on_former_road.json()["buildings"]) == 2


def test_buildings_are_not_accessible_across_users(logged_in_client: TestClient) -> None:
    purchase = logged_in_client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "woodshed_01", "grid_x": 4, "grid_y": 4},
    )
    building_id = purchase.json()["buildings"][0]["id"]
    logged_in_client.post(
        "/api/auth/demo-login",
        json={"email": "alex.morgan@savehaven.demo", "password": "savehaven-demo"},
    )

    move = logged_in_client.patch(
        f"/api/game/buildings/{building_id}",
        json={"grid_x": 5, "grid_y": 4},
    )
    sale = logged_in_client.delete(f"/api/game/buildings/{building_id}")

    assert move.status_code == 404
    assert sale.status_code == 404
