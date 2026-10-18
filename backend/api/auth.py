from fastapi import APIRouter, HTTPException, Request, Response, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from models import User
from repository import authenticate_demo_user, get_bank_connection, get_demo_profile_id
from schemas import DemoLoginRequest, SessionUserResponse
from services import BankSyncError, ProfileNotFoundError

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _ensure_demo_bank_connection(
    request: Request,
    session: DatabaseSession,
    user: User,
) -> None:
    if get_bank_connection(session, user.id) is not None:
        return
    profile_id = get_demo_profile_id(user.id)
    if profile_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="This demo account has no fictional bank profile configured",
        )
    try:
        request.app.state.bank_sync_service.connect(
            session,
            user_id=user.id,
            profile_id=profile_id,
        )
    except (ProfileNotFoundError, BankSyncError) as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The fictional bank profile could not be loaded",
        ) from error


@router.post("/demo-login", response_model=SessionUserResponse)
def demo_login(
    payload: DemoLoginRequest,
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> SessionUserResponse:
    user = authenticate_demo_user(session, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect",
        )

    _ensure_demo_bank_connection(request, session, user)

    settings = request.app.state.settings
    response.set_cookie(
        key=settings.session_cookie_name,
        value=request.app.state.session_manager.create_token(user.id),
        max_age=settings.session_max_age_seconds,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
    )
    return SessionUserResponse(id=user.id, display_name=user.display_name)


@router.get("/session", response_model=SessionUserResponse)
def get_session(
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> SessionUserResponse:
    _ensure_demo_bank_connection(request, session, user)
    return SessionUserResponse(id=user.id, display_name=user.display_name)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, _user: CurrentDemoUser) -> None:
    response.delete_cookie(
        key=request.app.state.settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=request.app.state.settings.session_cookie_secure,
        samesite="lax",
    )
