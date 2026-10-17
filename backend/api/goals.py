from datetime import date

from fastapi import APIRouter, HTTPException, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from repository import get_bank_connection, get_goal, replace_active_goal
from schemas import CreateGoalRequest, GoalPlanResponse
from services import accept_goal_plan, build_goal_plan

router = APIRouter(prefix="/api/goals", tags=["goals"])


def _owned_goal_or_404(session: DatabaseSession, *, user_id: str, goal_id: int):
    goal = get_goal(session, user_id=user_id, goal_id=goal_id)
    if goal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Savings goal not found")
    return goal


@router.post("", response_model=GoalPlanResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: CreateGoalRequest,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GoalPlanResponse:
    if get_bank_connection(session, user.id) is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect a demo bank before creating a savings plan",
        )
    if payload.target_date <= date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Target date must be in the future",
        )
    goal = replace_active_goal(
        session,
        user_id=user.id,
        name=payload.name,
        target_amount_cents=payload.target_amount_cents,
        amount_already_saved_cents=payload.amount_already_saved_cents,
        target_date=payload.target_date,
    )
    session.commit()
    return build_goal_plan(session, user_id=user.id, goal=goal)


@router.get("/{goal_id}/plan", response_model=GoalPlanResponse)
def regenerate_plan(
    goal_id: int,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GoalPlanResponse:
    goal = _owned_goal_or_404(session, user_id=user.id, goal_id=goal_id)
    return build_goal_plan(session, user_id=user.id, goal=goal)


@router.post("/{goal_id}/accept-plan", response_model=GoalPlanResponse)
def accept_plan(
    goal_id: int,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> GoalPlanResponse:
    goal = _owned_goal_or_404(session, user_id=user.id, goal_id=goal_id)
    return accept_goal_plan(session, user_id=user.id, goal=goal)
