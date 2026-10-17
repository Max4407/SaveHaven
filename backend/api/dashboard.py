from fastapi import APIRouter, HTTPException, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from schemas import DashboardResponse
from services import BankConnectionNotFoundError, build_dashboard

router = APIRouter(prefix="/api", tags=["finance"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> DashboardResponse:
    try:
        return build_dashboard(session, user_id=user.id)
    except BankConnectionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect a demo bank before opening the dashboard",
        ) from error
