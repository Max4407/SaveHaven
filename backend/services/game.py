from datetime import UTC, datetime

from sqlalchemy.orm import Session

from models import PlacedBuilding
from repository import ensure_wallet, get_placed_building, list_placed_buildings
from schemas import (
    GameStateResponse,
    PlaceBuildingRequest,
    PlacedBuildingResponse,
    WalletResponse,
)
from services.catalog import TownCatalog
from services.progression import (
    LEVEL_NAMES,
    district_for_level,
    infrastructure_for_level,
    progression_for_xp,
)


class GameRuleError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class PlacedBuildingNotFoundError(LookupError):
    pass


class GameService:
    def __init__(self, catalog: TownCatalog) -> None:
        self.catalog = catalog

    def get_state(self, session: Session, *, user_id: str) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        session.commit()
        return self._state(session, user_id=user_id, wallet=wallet)

    def buy_building(
        self,
        session: Session,
        *,
        user_id: str,
        request: PlaceBuildingRequest,
    ) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        item = self.catalog.get(request.catalog_item_id)
        if item is None:
            raise GameRuleError("catalog_item_not_found", "That catalog item does not exist.")
        if item.level_required > wallet.level:
            raise GameRuleError(
                "level_locked",
                f"Reach level {item.level_required} to unlock {item.name}.",
            )
        if wallet.coin_balance < item.cost_coins:
            raise GameRuleError("insufficient_coins", "There are not enough Town Coins.")

        buildings = list_placed_buildings(session, user_id)
        self._validate_placement(
            wallet.level,
            item.id,
            request.grid_x,
            request.grid_y,
            buildings,
        )
        now = datetime.now(UTC)
        wallet.coin_balance -= item.cost_coins
        wallet.updated_at = now
        session.add(
            PlacedBuilding(
                user_id=user_id,
                catalog_item_id=item.id,
                grid_x=request.grid_x,
                grid_y=request.grid_y,
                purchase_price_coins=item.cost_coins,
                purchased_at=now,
                updated_at=now,
            )
        )
        session.commit()
        return self._state(session, user_id=user_id, wallet=wallet)

    def move_building(
        self,
        session: Session,
        *,
        user_id: str,
        building_id: int,
        grid_x: int,
        grid_y: int,
    ) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        building = get_placed_building(session, user_id=user_id, building_id=building_id)
        if building is None:
            raise PlacedBuildingNotFoundError(building_id)
        buildings = list_placed_buildings(session, user_id)
        self._validate_placement(
            wallet.level,
            building.catalog_item_id,
            grid_x,
            grid_y,
            buildings,
            excluded_building_id=building.id,
        )
        building.grid_x = grid_x
        building.grid_y = grid_y
        building.updated_at = datetime.now(UTC)
        session.commit()
        return self._state(session, user_id=user_id, wallet=wallet)

    def sell_building(
        self,
        session: Session,
        *,
        user_id: str,
        building_id: int,
    ) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        building = get_placed_building(session, user_id=user_id, building_id=building_id)
        if building is None:
            raise PlacedBuildingNotFoundError(building_id)
        refund = building.purchase_price_coins * 60 // 100
        wallet.coin_balance += refund
        wallet.updated_at = datetime.now(UTC)
        session.delete(building)
        session.commit()
        return self._state(session, user_id=user_id, wallet=wallet)

    def _state(self, session: Session, *, user_id: str, wallet) -> GameStateResponse:
        return GameStateResponse(
            wallet=WalletResponse(
                coin_balance=wallet.coin_balance,
                total_coins_earned=wallet.total_coins_earned,
                xp=wallet.xp,
                level=wallet.level,
                level_name=LEVEL_NAMES[wallet.level],
                streak_weeks=wallet.streak_weeks,
            ),
            progression=progression_for_xp(wallet.xp),
            district=district_for_level(wallet.level),
            infrastructure=infrastructure_for_level(wallet.level),
            buildings=[
                PlacedBuildingResponse(
                    id=building.id,
                    catalog_item_id=building.catalog_item_id,
                    grid_x=building.grid_x,
                    grid_y=building.grid_y,
                    purchase_price_coins=building.purchase_price_coins,
                    purchased_at=building.purchased_at,
                    updated_at=building.updated_at,
                )
                for building in list_placed_buildings(session, user_id)
            ],
        )

    def _validate_placement(
        self,
        level: int,
        catalog_item_id: str,
        grid_x: int,
        grid_y: int,
        buildings: list[PlacedBuilding],
        *,
        excluded_building_id: int | None = None,
    ) -> None:
        item = self.catalog.get(catalog_item_id)
        if item is None:
            raise GameRuleError("catalog_item_not_found", "That catalog item does not exist.")
        cells = {
            (x, y)
            for x in range(grid_x, grid_x + item.footprint.width)
            for y in range(grid_y, grid_y + item.footprint.height)
        }
        district = district_for_level(level)
        if any(
            x < district.min_x
            or x > district.max_x
            or y < district.min_y
            or y > district.max_y
            for x, y in cells
        ):
            raise GameRuleError(
                "outside_unlocked_district",
                "That footprint extends beyond the town map.",
            )
        reserved = {
            (cell.x, cell.y) for cell in infrastructure_for_level(level).reserved_cells
        }
        if cells & reserved:
            raise GameRuleError("infrastructure_reserved", "Town roads must remain clear.")

        occupied: set[tuple[int, int]] = set()
        for building in buildings:
            if building.id == excluded_building_id:
                continue
            placed_item = self.catalog.get(building.catalog_item_id)
            if placed_item is None:
                continue
            occupied.update(
                (x, y)
                for x in range(
                    building.grid_x,
                    building.grid_x + placed_item.footprint.width,
                )
                for y in range(
                    building.grid_y,
                    building.grid_y + placed_item.footprint.height,
                )
            )
        if cells & occupied:
            raise GameRuleError("occupied", "Another building already occupies that space.")
