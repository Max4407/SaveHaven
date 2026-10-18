from dataclasses import dataclass
from secrets import compare_digest

from sqlalchemy.orm import Session

from models import User


@dataclass(frozen=True)
class DemoUser:
    id: str
    display_name: str
    email: str
    password: str
    profile_id: str


DEMO_USERS = (
    DemoUser(
        id="demo-player",
        display_name="Jordan Lee",
        email="jordan.lee@savehaven.demo",
        password="savehaven-demo",
        profile_id="steady-paycheck",
    ),
    DemoUser(
        id="demo-reviewer",
        display_name="Alex Morgan",
        email="alex.morgan@savehaven.demo",
        password="savehaven-demo",
        profile_id="variable-income",
    ),
    DemoUser(
        id="demo-taylor",
        display_name="Taylor Kim",
        email="taylor.kim@savehaven.demo",
        password="savehaven-demo",
        profile_id="tight-budget",
    ),
)


def seed_demo_users(session: Session) -> None:
    for demo_user in DEMO_USERS:
        user = session.get(User, demo_user.id)
        if user is None:
            session.add(User(id=demo_user.id, display_name=demo_user.display_name))
        elif user.display_name != demo_user.display_name:
            user.display_name = demo_user.display_name
    session.commit()


def get_user(session: Session, user_id: str) -> User | None:
    return session.get(User, user_id)


def get_demo_profile_id(user_id: str) -> str | None:
    demo_user = next((user for user in DEMO_USERS if user.id == user_id), None)
    return demo_user.profile_id if demo_user is not None else None


def authenticate_demo_user(session: Session, email: str, password: str) -> User | None:
    normalized_email = email.strip().casefold()
    demo_user = next(
        (user for user in DEMO_USERS if user.email.casefold() == normalized_email),
        None,
    )
    expected_password = demo_user.password if demo_user is not None else "invalid-demo-password"
    if not compare_digest(password, expected_password) or demo_user is None:
        return None
    return get_user(session, demo_user.id)
