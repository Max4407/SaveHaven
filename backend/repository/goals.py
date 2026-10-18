from datetime import UTC, date, datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from models import AcceptedSavingsPlan, FinancialAccount, SavingsGoal


def replace_active_goal(
    session: Session,
    *,
    user_id: str,
    name: str,
    target_amount_cents: int,
    amount_already_saved_cents: int,
    target_date: date,
    starting_savings_balance_cents: int | None = None,
) -> SavingsGoal:
    if starting_savings_balance_cents is None:
        starting_savings_balance_cents = session.scalar(
            select(func.sum(FinancialAccount.balance_cents)).where(
                FinancialAccount.user_id == user_id,
                FinancialAccount.account_type == "savings",
            )
        )
    if starting_savings_balance_cents is None:
        starting_savings_balance_cents = amount_already_saved_cents
    session.execute(
        update(SavingsGoal)
        .where(SavingsGoal.user_id == user_id, SavingsGoal.is_active.is_(True))
        .values(is_active=False)
    )
    goal = SavingsGoal(
        user_id=user_id,
        name=name,
        target_amount_cents=target_amount_cents,
        amount_already_saved_cents=amount_already_saved_cents,
        starting_savings_balance_cents=starting_savings_balance_cents,
        target_date=target_date,
        is_active=True,
        created_at=datetime.now(UTC),
    )
    session.add(goal)
    session.flush()
    return goal


def get_active_goal(session: Session, user_id: str) -> SavingsGoal | None:
    return session.scalar(
        select(SavingsGoal).where(
            SavingsGoal.user_id == user_id,
            SavingsGoal.is_active.is_(True),
        )
    )


def get_goal(session: Session, *, user_id: str, goal_id: int) -> SavingsGoal | None:
    return session.scalar(
        select(SavingsGoal).where(SavingsGoal.user_id == user_id, SavingsGoal.id == goal_id)
    )


def get_accepted_plan(
    session: Session, *, user_id: str, goal_id: int
) -> AcceptedSavingsPlan | None:
    return session.scalar(
        select(AcceptedSavingsPlan).where(
            AcceptedSavingsPlan.user_id == user_id,
            AcceptedSavingsPlan.goal_id == goal_id,
        )
    )


def save_accepted_plan(
    session: Session,
    *,
    goal_id: int,
    user_id: str,
    values: dict[str, object],
) -> AcceptedSavingsPlan:
    accepted = get_accepted_plan(session, user_id=user_id, goal_id=goal_id)
    if accepted is None:
        accepted = AcceptedSavingsPlan(goal_id=goal_id, user_id=user_id, **values)
        session.add(accepted)
    else:
        for field, value in values.items():
            setattr(accepted, field, value)
    session.flush()
    return accepted
