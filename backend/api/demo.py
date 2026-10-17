from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from schemas import (
    DemoProfileResponse,
    DemoResetResponse,
    NessieEventRequest,
    NessieEventResponse,
    SimulateWeekRequest,
    SimulateWeekResponse,
)
from services import (
    BankConnectionNotFoundError,
    BankSyncError,
    DemoWeekError,
    NessieEventError,
)

router = APIRouter(prefix="/api/demo", tags=["demo"])


def require_demo_controls(request: Request) -> None:
    if not request.app.state.settings.demo_controls_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


DemoControlsEnabled = Annotated[None, Depends(require_demo_controls)]


@router.get("/nessie-profiles", response_model=list[DemoProfileResponse])
def list_nessie_profiles(
    request: Request,
    _user: CurrentDemoUser,
) -> list[DemoProfileResponse]:
    return request.app.state.fixture_store.list_profiles()


@router.post("/nessie-events", response_model=NessieEventResponse)
def create_nessie_event(
    payload: NessieEventRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
    _controls: DemoControlsEnabled,
) -> NessieEventResponse:
    try:
        return request.app.state.nessie_event_service.run(
            session,
            user_id=user.id,
            event=payload,
        )
    except BankConnectionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect a demo bank before using Nessie Lab",
        ) from error
    except NessieEventError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except BankSyncError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


def _require_demo_controls(request: Request) -> None:
    if not request.app.state.settings.demo_controls_enabled:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _simulate_week(
    *,
    scenario: str,
    payload: SimulateWeekRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> SimulateWeekResponse:
    _require_demo_controls(request)
    try:
        return request.app.state.demo_week_service.simulate(
            session,
            user_id=user.id,
            idempotency_key=payload.idempotency_key,
            scenario=scenario,
        )
    except DemoWeekError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post("/simulate-successful-week", response_model=SimulateWeekResponse)
def simulate_successful_week(
    payload: SimulateWeekRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> SimulateWeekResponse:
    return _simulate_week(
        scenario="successful",
        payload=payload,
        request=request,
        user=user,
        session=session,
    )


@router.post("/simulate-off-plan-week", response_model=SimulateWeekResponse)
def simulate_off_plan_week(
    payload: SimulateWeekRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> SimulateWeekResponse:
    return _simulate_week(
        scenario="off_plan",
        payload=payload,
        request=request,
        user=user,
        session=session,
    )


@router.post("/reset", response_model=DemoResetResponse)
def reset_demo(
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> DemoResetResponse:
    _require_demo_controls(request)
    state, warnings = request.app.state.demo_week_service.reset(session, user_id=user.id)
    return DemoResetResponse(game_state=state, cleanup_warnings=warnings)
