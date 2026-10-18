from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class GridSize(BaseModel):
    width: int = Field(ge=1, le=16)
    height: int = Field(ge=1, le=16)


class SpritePivot(BaseModel):
    x: int = Field(ge=0)
    y: int = Field(ge=0)


class CatalogItemResponse(BaseModel):
    id: str
    name: str
    category: str
    asset: str
    shadow_asset: str | None = None
    cost_coins: int
    level_required: int
    footprint: GridSize
    pivot: SpritePivot
    landmark: bool
    render_kind: Literal["building", "ground"] = "building"
    resident_count: int = Field(default=0, ge=0, le=20)


class CatalogResponse(BaseModel):
    items: list[CatalogItemResponse]


class WalletResponse(BaseModel):
    coin_balance: int
    total_coins_earned: int
    xp: int
    level: int
    level_name: str
    streak_weeks: int


class DistrictResponse(BaseModel):
    min_x: int
    max_x: int
    min_y: int
    max_y: int


class GridCellResponse(BaseModel):
    x: int
    y: int


class InfrastructureResponse(BaseModel):
    tier: Literal["dirt", "gravel", "stone"]
    reserved_cells: list[GridCellResponse]


class ProgressionResponse(BaseModel):
    current_level_xp: int
    next_level_xp: int | None
    progress_percent: int


class PlacedBuildingResponse(BaseModel):
    id: int
    catalog_item_id: str
    grid_x: int
    grid_y: int
    facing: Literal["left", "right"]
    purchase_price_coins: int
    purchased_at: datetime
    updated_at: datetime


class GameStateResponse(BaseModel):
    wallet: WalletResponse
    progression: ProgressionResponse
    district: DistrictResponse
    infrastructure: InfrastructureResponse
    buildings: list[PlacedBuildingResponse]


class PlaceBuildingRequest(BaseModel):
    catalog_item_id: str = Field(min_length=1, max_length=80)
    grid_x: int = Field(ge=0, le=31)
    grid_y: int = Field(ge=0, le=69)
    facing: Literal["left", "right"] = "left"


class MoveBuildingRequest(BaseModel):
    grid_x: int = Field(ge=0, le=31)
    grid_y: int = Field(ge=0, le=69)
    facing: Literal["left", "right"] | None = None


class EvaluationResponse(BaseModel):
    id: int
    period_start: date
    period_end: date
    planned_savings_cents: int
    actual_net_savings_cents: int
    planned_discretionary_spending_cents: int
    actual_discretionary_spending_cents: int
    savings_ratio_basis_points: int
    adherence_tier: Literal["within", "moderate", "substantial"]
    exceptional_expense_flag: bool
    source: str
    explanation: str
    evaluated_at: datetime


class RewardResponse(BaseModel):
    id: int
    plan_period_id: int | None
    reward_type: str
    coins_awarded: int
    xp_awarded: int
    previous_level: int
    new_level: int
    streak_weeks: int
    explanation: str
    created_at: datetime


class RewardsResponse(BaseModel):
    rewards: list[RewardResponse]


class SimulateWeekRequest(BaseModel):
    idempotency_key: str = Field(pattern=r"^[a-z0-9_-]{8,80}$")


class LevelUnlocksResponse(BaseModel):
    catalog_items: list[CatalogItemResponse]
    district: DistrictResponse | None
    infrastructure: InfrastructureResponse | None


class SimulateWeekResponse(BaseModel):
    source: Literal["live", "fixture_fallback"]
    replayed: bool
    evaluation: EvaluationResponse
    reward: RewardResponse
    unlocks: LevelUnlocksResponse
    game_state: GameStateResponse


class DemoResetResponse(BaseModel):
    game_state: GameStateResponse
    cleanup_warnings: list[str]
