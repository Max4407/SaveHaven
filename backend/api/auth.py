from fastapi import APIRouter, HTTPException, Request, Response, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from repository import get_user
from schemas import DemoLoginRequest, SessionUserResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/demo-login", response_model=SessionUserResponse)
def demo_login(
    payload: DemoLoginRequest,
    request: Request,
    response: Response,
    session: DatabaseSession,
) -> SessionUserResponse:
    user = get_user(session, payload.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unknown demo user",
        )

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
def get_session(user: CurrentDemoUser) -> SessionUserResponse:
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
