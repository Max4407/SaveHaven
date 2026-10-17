from typing import Annotated

from fastapi import Depends, HTTPException, Request, status

from auth.session import InvalidSessionError
from database.dependencies import DatabaseSession
from models import User
from repository import get_user


def require_demo_user(request: Request, session: DatabaseSession) -> User:
    settings = request.app.state.settings
    token = request.cookies.get(settings.session_cookie_name)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="A demo session is required",
        )

    try:
        user_id = request.app.state.session_manager.read_user_id(token)
    except InvalidSessionError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The demo session is invalid or expired",
        ) from error

    user = get_user(session, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The demo session does not identify a user",
        )
    return user


CurrentDemoUser = Annotated[User, Depends(require_demo_user)]
