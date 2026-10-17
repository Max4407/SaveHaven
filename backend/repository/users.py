from sqlalchemy.orm import Session

from models import User

DEMO_USERS = {
    "demo-player": "Demo Player",
    "demo-reviewer": "Demo Reviewer",
}


def seed_demo_users(session: Session) -> None:
    for user_id, display_name in DEMO_USERS.items():
        if session.get(User, user_id) is None:
            session.add(User(id=user_id, display_name=display_name))
    session.commit()


def get_user(session: Session, user_id: str) -> User | None:
    return session.get(User, user_id)
