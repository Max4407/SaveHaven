from fastapi import APIRouter, HTTPException, Request, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from repository import ensure_wallet, list_reward_events
from schemas import (
    CatalogResponse,
    GameStateResponse,
    MoveBuildingRequest,
    PlaceBuildingRequest,
    RewardsResponse,
)
from services import GameRuleError, PlacedBuildingNotFoundError, reward_response

router = APIRouter(prefix="/api/game", tags=["game"])


def _game_service(request: Request):
    return request.app.state.game_service


def _rule_conflict(error: GameRuleError) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail={"code": error.code, "message": error.message},
    )


@router.get("/catalog", response_model=CatalogResponse)
def get_catalog(request: Request, _user: CurrentDemoUser) -> CatalogResponse:
    return request.app.state.town_catalog.response()


@router.get("/state", response_model=GameStateResponse)
def get_game_state(
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GameStateResponse:
    return _game_service(request).get_state(session, user_id=user.id)


@router.get("/rewards", response_model=RewardsResponse)
def get_rewards(user: CurrentDemoUser, session: DatabaseSession) -> RewardsResponse:
    ensure_wallet(session, user.id)
    session.commit()
    return RewardsResponse(
        rewards=[reward_response(reward) for reward in list_reward_events(session, user.id)]
    )


@router.post("/buildings", response_model=GameStateResponse, status_code=status.HTTP_201_CREATED)
def buy_building(
    payload: PlaceBuildingRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GameStateResponse:
    try:
        return _game_service(request).buy_building(
            session,
            user_id=user.id,
            request=payload,
        )
    except GameRuleError as error:
        session.rollback()
        raise _rule_conflict(error) from error

@router.patch("/buildings/{building_id}", response_model=GameStateResponse)
def move_building(
    building_id: int,
    payload: MoveBuildingRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GameStateResponse:
    try:
        return _game_service(request).move_building(
            session,
            user_id=user.id,
            building_id=building_id,
            grid_x=payload.grid_x,
            grid_y=payload.grid_y,
            facing=payload.facing,
        )
    except PlacedBuildingNotFoundError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Placed building not found",
        ) from error
    except GameRuleError as error:
        session.rollback()
        raise _rule_conflict(error) from error
@router.delete("/buildings/{building_id}", response_model=GameStateResponse)
def sell_building(
    building_id: int,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GameStateResponse:
    try:
        return _game_service(request).sell_building(
            session,
            user_id=user.id,
            building_id=building_id,
        )
    except PlacedBuildingNotFoundError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Placed building not found",
        ) from error


@router.delete("/food/{building_id}", response_model=GameStateResponse)
def consume_food(
    building_id: int,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GameStateResponse:
    try:
        return _game_service(request).consume_food(
            session,
            user_id=user.id,
            building_id=building_id,
        )
    except PlacedBuildingNotFoundError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Placed food not found",
        ) from error
    except GameRuleError as error:
        session.rollback()
        raise _rule_conflict(error) from error
