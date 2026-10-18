from datetime import UTC, datetime
from math import ceil, floor

from sqlalchemy.orm import Session

from models import PlacedBuilding
from repository import ensure_wallet, get_placed_building, list_placed_buildings
from schemas import (
    GameStateResponse,
    PlaceBuildingRequest,
    PlacedBuildingResponse,
    PlaceRoadsRequest,
    WalletResponse,
)
from services.catalog import TownCatalog
from services.progression import (
    LEVEL_NAMES,
    district_for_level,
    infrastructure_for_level,
    progression_for_xp,
)

TOWN_GRID_COLUMNS = 32
TOWN_GRID_ROWS = 70


def road_line_cells(start_x: int, start_y: int, end_x: int, end_y: int) -> list[tuple[int, int]]:
    start_u = start_x + ceil(start_y / 2)
    start_v = floor(start_y / 2) - start_x
    delta_u = end_x + ceil(end_y / 2) - start_u
    delta_v = floor(end_y / 2) - end_x - start_v
    steps = max(abs(delta_u), abs(delta_v))
    cells: list[tuple[int, int]] = []
    for index in range(steps + 1):
        fraction = index / steps if steps else 0
        next_u = floor(start_u + delta_u * fraction + 0.5)
        next_v = floor(start_v + delta_v * fraction + 0.5)
        y = next_u + next_v
        cells.append((next_u - ceil(y / 2), y))
    return cells


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
                facing=request.facing,
                visual_variant=request.visual_variant,
                purchase_price_coins=item.cost_coins,
                purchased_at=now,
                updated_at=now,
            )
        )
        session.commit()
        return self._state(session, user_id=user_id, wallet=wallet)

    def buy_roads(
        self,
        session: Session,
        *,
        user_id: str,
        request: PlaceRoadsRequest,
    ) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        item = self.catalog.get(request.catalog_item_id)
        if (
            item is None
            or item.category != "roads"
            or item.render_kind != "ground"
            or item.footprint.width != 1
            or item.footprint.height != 1
        ):
            raise GameRuleError("invalid_road", "Choose a single-cell road tile.")
        if item.level_required > wallet.level:
            raise GameRuleError("level_locked", f"Reach level {item.level_required} first.")

        buildings = list_placed_buildings(session, user_id)
        existing_roads = {
            (building.grid_x, building.grid_y)
            for building in buildings
            if building.catalog_item_id == item.id
        }
        if request.shape == "line":
            selected_cells = road_line_cells(
                request.start_x,
                request.start_y,
                request.end_x,
                request.end_y,
            )
        else:
            selected_cells = [
                (x, y)
                for x in range(
                    min(request.start_x, request.end_x), max(request.start_x, request.end_x) + 1
                )
                for y in range(
                    min(request.start_y, request.end_y), max(request.start_y, request.end_y) + 1
                )
            ]
        cells = [cell for cell in selected_cells if cell not in existing_roads]
        if not cells:
            raise GameRuleError("roads_already_placed", "Those roads are already placed.")
        for x, y in cells:
            self._validate_placement(item.id, x, y, buildings)

        total_cost = len(cells) * item.cost_coins
        if wallet.coin_balance < total_cost:
            raise GameRuleError("insufficient_coins", "Not enough Coins for these roads.")

        # Validate the full selection before charging or creating any road tile.
        now = datetime.now(UTC)
        wallet.coin_balance -= total_cost
        wallet.updated_at = now
        session.add_all(
            [
                PlacedBuilding(
                    user_id=user_id,
                    catalog_item_id=item.id,
                    grid_x=x,
                    grid_y=y,
                    facing="left",
                    visual_variant=0,
                    purchase_price_coins=item.cost_coins,
                    purchased_at=now,
                    updated_at=now,
                )
                for x, y in cells
            ]
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
        facing: str | None = None,
    ) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        building = get_placed_building(session, user_id=user_id, building_id=building_id)
        if building is None:
            raise PlacedBuildingNotFoundError(building_id)
        buildings = list_placed_buildings(session, user_id)
        self._validate_placement(
            building.catalog_item_id,
            grid_x,
            grid_y,
            buildings,
            excluded_building_id=building.id,
        )
        building.grid_x = grid_x
        building.grid_y = grid_y
        if facing is not None:
            building.facing = facing
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

    def consume_food(
        self,
        session: Session,
        *,
        user_id: str,
        building_id: int,
    ) -> GameStateResponse:
        wallet = ensure_wallet(session, user_id)
        food = get_placed_building(session, user_id=user_id, building_id=building_id)
        if food is None:
            raise PlacedBuildingNotFoundError(building_id)
        item = self.catalog.get(food.catalog_item_id)
        if item is None or item.render_kind != "food":
            raise GameRuleError("not_food", "Only placed food can be consumed.")
        session.delete(food)
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
                    facing=building.facing,
                    visual_variant=building.visual_variant,
                    purchase_price_coins=building.purchase_price_coins,
                    purchased_at=building.purchased_at,
                    updated_at=building.updated_at,
                )
                for building in list_placed_buildings(session, user_id)
            ],
        )

    def _validate_placement(
        self,
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
        if any(
            x < 0
            or x >= TOWN_GRID_COLUMNS
            or y < 0
            or y >= TOWN_GRID_ROWS
            for x, y in cells
        ):
            raise GameRuleError(
                "outside_town_map",
                "That footprint extends beyond the town map.",
            )

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
