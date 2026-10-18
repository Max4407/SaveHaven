import pytest
from fastapi.testclient import TestClient


def road_batch(**changes):
    return {
        "catalog_item_id": "dirt_road_01",
        "start_x": 4,
        "start_y": 4,
        "end_x": 7,
        "end_y": 10,
        "shape": "line",
        **changes,
    }


def test_multi_road_purchase_requires_login(client: TestClient) -> None:
    assert client.post("/api/game/roads/batch", json=road_batch()).status_code == 401


@pytest.mark.parametrize("reverse", [False, True])
def test_diagonal_buys_only_line_cells_and_persists(logged_in_client, reverse):
    payload = road_batch()
    if reverse:
        payload = road_batch(start_x=7, start_y=10, end_x=4, end_y=4)
    response = logged_in_client.post("/api/game/roads/batch", json=payload)
    assert response.status_code == 201
    assert response.json()["wallet"]["coin_balance"] == 293
    assert {(tile["grid_x"], tile["grid_y"]) for tile in response.json()["buildings"]} == {
        (4, 4), (4, 5), (5, 6), (5, 7), (6, 8), (6, 9), (7, 10),
    }
    assert logged_in_client.get("/api/game/state").json()["buildings"] == response.json()[
        "buildings"
    ]


def test_area_buys_rectangle_and_skips_existing_matching_roads(logged_in_client):
    logged_in_client.post(
        "/api/game/roads/batch",
        json=road_batch(end_x=4, end_y=4),
    )
    response = logged_in_client.post(
        "/api/game/roads/batch",
        json=road_batch(end_y=5, shape="rectangle"),
    )
    assert response.status_code == 201
    assert len(response.json()["buildings"]) == 8
    assert response.json()["wallet"]["coin_balance"] == 292


def test_blocked_batch_is_atomic(logged_in_client):
    logged_in_client.post(
        "/api/game/buildings",
        json={"catalog_item_id": "woodshed_01", "grid_x": 5, "grid_y": 7},
    )
    response = logged_in_client.post("/api/game/roads/batch", json=road_batch())
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "occupied"
    state = logged_in_client.get("/api/game/state").json()
    assert state["wallet"]["coin_balance"] == 200
    assert len(state["buildings"]) == 1


def test_unaffordable_batch_never_partially_charges(logged_in_client):
    response = logged_in_client.post(
        "/api/game/roads/batch",
        json=road_batch(start_x=0, start_y=0, end_x=31, end_y=69, shape="rectangle"),
    )
    assert response.status_code == 409
    state = logged_in_client.get("/api/game/state").json()
    assert state["wallet"]["coin_balance"] == 300
    assert state["buildings"] == []


@pytest.mark.parametrize(
    "changes,expected",
    [
        ({"start_x": -1}, 422),
        ({"end_y": 70}, 422),
        ({"shape": "invalid"}, 422),
        ({"catalog_item_id": "woodshed_01"}, 409),
        ({"catalog_item_id": "not-a-road"}, 409),
    ],
)
def test_invalid_batches_leave_wallet_and_map_intact(logged_in_client, changes, expected):
    response = logged_in_client.post("/api/game/roads/batch", json=road_batch(**changes))
    assert response.status_code == expected
    state = logged_in_client.get("/api/game/state").json()
    assert state["wallet"]["coin_balance"] == 300
    assert state["buildings"] == []


def test_multi_road_purchases_are_isolated_by_user(logged_in_client):
    logged_in_client.post("/api/game/roads/batch", json=road_batch())
    logged_in_client.post(
        "/api/auth/demo-login",
        json={"email": "alex.morgan@savehaven.demo", "password": "savehaven-demo"},
    )
    state = logged_in_client.get("/api/game/state").json()
    assert state["buildings"] == []
    assert state["wallet"]["coin_balance"] == 300
