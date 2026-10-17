from pathlib import Path

import pytest

from database import Database
from models import GameWallet
from repository import ensure_wallet, seed_demo_users
from schemas import PlaceBuildingRequest
from services import GameRuleError, GameService, PlacedBuildingNotFoundError, TownCatalog

CATALOG_PATH = Path(__file__).resolve().parents[3] / "data" / "catalog" / "town_catalog.json"


def game_session():
    database = Database("sqlite:///:memory:")
    database.create_schema()
    session = database.session_factory()
    seed_demo_users(session)
    return session, GameService(TownCatalog.load(CATALOG_PATH))


def test_starter_grant_purchase_move_and_original_price_refund() -> None:
    session, game = game_session()
    with session:
        initial = game.get_state(session, user_id="demo-player")
        purchased = game.buy_building(
            session,
            user_id="demo-player",
            request=PlaceBuildingRequest(catalog_item_id="woodshed_01", grid_x=4, grid_y=4),
        )
        moved = game.move_building(
            session,
            user_id="demo-player",
            building_id=purchased.buildings[0].id,
            grid_x=5,
            grid_y=4,
        )
        sold = game.sell_building(
            session,
            user_id="demo-player",
            building_id=purchased.buildings[0].id,
        )

        assert (initial.wallet.coin_balance, initial.wallet.xp) == (300, 0)
        assert purchased.wallet.coin_balance == 200
        assert purchased.buildings[0].purchase_price_coins == 100
        assert moved.wallet.coin_balance == 200
        assert (moved.buildings[0].grid_x, moved.buildings[0].grid_y) == (5, 4)
        assert sold.wallet.coin_balance == 260
        assert sold.buildings == []


@pytest.mark.parametrize(
    ("item_id", "grid_x", "grid_y", "code"),
    [
        ("bakery_01", 4, 4, "level_locked"),
        ("woodshed_01", 3, 4, "outside_unlocked_district"),
        ("woodshed_01", 7, 5, "infrastructure_reserved"),
    ],
)
def test_failed_purchase_is_atomic(item_id: str, grid_x: int, grid_y: int, code: str) -> None:
    session, game = game_session()
    with session:
        with pytest.raises(GameRuleError) as error:
            game.buy_building(
                session,
                user_id="demo-player",
                request=PlaceBuildingRequest(
                    catalog_item_id=item_id,
                    grid_x=grid_x,
                    grid_y=grid_y,
                ),
            )
        session.rollback()
        state = game.get_state(session, user_id="demo-player")

        assert error.value.code == code
        assert state.wallet.coin_balance == 300
        assert state.buildings == []


def test_collision_and_cross_user_ownership_are_server_authoritative() -> None:
    session, game = game_session()
    with session:
        state = game.buy_building(
            session,
            user_id="demo-player",
            request=PlaceBuildingRequest(catalog_item_id="hut_01", grid_x=4, grid_y=4),
        )
        with pytest.raises(GameRuleError) as collision:
            game.buy_building(
                session,
                user_id="demo-player",
                request=PlaceBuildingRequest(
                    catalog_item_id="woodshed_01",
                    grid_x=5,
                    grid_y=5,
                ),
            )
        session.rollback()
        with pytest.raises(PlacedBuildingNotFoundError):
            game.sell_building(
                session,
                user_id="demo-reviewer",
                building_id=state.buildings[0].id,
            )

        wallet = session.get(GameWallet, "demo-player")
        assert collision.value.code == "occupied"
        assert wallet is not None
        assert wallet.coin_balance == 150


def test_insufficient_funds_never_create_a_negative_wallet() -> None:
    session, game = game_session()
    with session:
        wallet = ensure_wallet(session, "demo-player")
        wallet.coin_balance = 99
        session.commit()

        with pytest.raises(GameRuleError) as error:
            game.buy_building(
                session,
                user_id="demo-player",
                request=PlaceBuildingRequest(
                    catalog_item_id="woodshed_01",
                    grid_x=4,
                    grid_y=4,
                ),
            )
        session.rollback()
        state = game.get_state(session, user_id="demo-player")

        assert error.value.code == "insufficient_coins"
        assert state.wallet.coin_balance == 99
        assert state.buildings == []
