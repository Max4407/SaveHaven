from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import GameWallet, PlacedBuilding, PlanPeriodEvaluation, RewardEvent

STARTER_COINS = 300


def ensure_wallet(session: Session, user_id: str) -> GameWallet:
    wallet = session.get(GameWallet, user_id)
    if wallet is not None:
        return wallet

    now = datetime.now(UTC)
    wallet = GameWallet(
        user_id=user_id,
        coin_balance=STARTER_COINS,
        total_coins_earned=STARTER_COINS,
        xp=0,
        level=1,
        streak_weeks=0,
        created_at=now,
        updated_at=now,
    )
    session.add(wallet)
    session.add(
        RewardEvent(
            user_id=user_id,
            plan_period_id=None,
            source_key="starter",
            reward_type="starter_grant",
            coins_awarded=STARTER_COINS,
            xp_awarded=0,
            previous_level=1,
            new_level=1,
            streak_weeks=0,
            explanation="A starter grant lets every new haven place its first building.",
            created_at=now,
        )
    )
    session.flush()
    return wallet


def list_placed_buildings(session: Session, user_id: str) -> list[PlacedBuilding]:
    return list(
        session.scalars(
            select(PlacedBuilding)
            .where(PlacedBuilding.user_id == user_id)
            .order_by(PlacedBuilding.id)
        )
    )


def get_placed_building(
    session: Session, *, user_id: str, building_id: int
) -> PlacedBuilding | None:
    return session.scalar(
        select(PlacedBuilding).where(
            PlacedBuilding.user_id == user_id,
            PlacedBuilding.id == building_id,
        )
    )


def list_reward_events(session: Session, user_id: str) -> list[RewardEvent]:
    return list(
        session.scalars(
            select(RewardEvent)
            .where(RewardEvent.user_id == user_id)
            .order_by(RewardEvent.created_at.desc(), RewardEvent.id.desc())
        )
    )


def get_reward_by_source(
    session: Session, *, user_id: str, source_key: str, reward_type: str
) -> RewardEvent | None:
    return session.scalar(
        select(RewardEvent).where(
            RewardEvent.user_id == user_id,
            RewardEvent.source_key == source_key,
            RewardEvent.reward_type == reward_type,
        )
    )


def get_evaluation_by_key(
    session: Session, *, user_id: str, idempotency_key: str
) -> PlanPeriodEvaluation | None:
    return session.scalar(
        select(PlanPeriodEvaluation).where(
            PlanPeriodEvaluation.user_id == user_id,
            PlanPeriodEvaluation.idempotency_key == idempotency_key,
        )
    )
