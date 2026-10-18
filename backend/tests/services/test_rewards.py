from datetime import UTC, date, datetime, timedelta

import pytest

from database import Database
from models import AcceptedSavingsPlan, GameWallet, PlanPeriodEvaluation, SavingsGoal
from repository import ensure_wallet, seed_demo_users
from services.rewards import process_evaluation


def reward_session():
    database = Database("sqlite:///:memory:")
    database.create_schema()
    session = database.session_factory()
    seed_demo_users(session)
    now = datetime.now(UTC)
    goal = SavingsGoal(
        user_id="demo-player",
        name="Emergency fund",
        target_amount_cents=500_000,
        amount_already_saved_cents=0,
        target_date=date.today() + timedelta(days=365),
        is_active=True,
        created_at=now,
    )
    session.add(goal)
    session.flush()
    plan = AcceptedSavingsPlan(
        goal_id=goal.id,
        user_id="demo-player",
        weekly_income_cents=100_000,
        weekly_recurring_bills_cents=40_000,
        weekly_variable_spending_cents=20_000,
        safety_buffer_cents=10_000,
        weekly_savings_cents=20_000,
        safe_to_spend_cents=30_000,
        confidence="high",
        income_cadence="weekly",
        feasible=True,
        suggested_target_date=None,
        explanation="Test plan",
        evidence_json="[]",
        accepted_at=now,
    )
    session.add(plan)
    session.commit()
    return session, plan


def evaluation(
    session,
    plan: AcceptedSavingsPlan,
    *,
    key: str,
    ratio: int,
    adherence: str = "within",
    planned_savings: int = 20_000,
    exceptional: bool = False,
) -> PlanPeriodEvaluation:
    row = PlanPeriodEvaluation(
        user_id="demo-player",
        accepted_plan_id=plan.id,
        period_start=date.today() - timedelta(days=6),
        period_end=date.today(),
        planned_savings_cents=planned_savings,
        actual_net_savings_cents=max(0, planned_savings * ratio // 10_000),
        planned_discretionary_spending_cents=30_000,
        actual_discretionary_spending_cents=30_000,
        savings_ratio_basis_points=ratio,
        adherence_tier=adherence,
        exceptional_expense_flag=exceptional,
        source="fixture_fallback",
        idempotency_key=key,
        explanation="Test evaluation",
        evaluated_at=datetime.now(UTC),
    )
    session.add(row)
    session.flush()
    return row


@pytest.mark.parametrize(
    ("ratio", "adherence", "expected_coins", "expected_xp"),
    [
        (10_000, "within", 420, 100),
        (10_000, "moderate", 300, 100),
        (10_000, "substantial", 200, 100),
        (12_500, "moderate", 375, 100),
        (20_000, "within", 525, 100),
        (1_263, "moderate", 38, 13),
        (-2_000, "within", 0, 0),
    ],
)
def test_weekly_rewards_encode_caps_rounding_and_adherence(
    ratio: int,
    adherence: str,
    expected_coins: int,
    expected_xp: int,
) -> None:
    session, plan = reward_session()
    with session:
        reward, replayed = process_evaluation(
            session,
            evaluation=evaluation(
                session,
                plan,
                key=f"ratio-{ratio}-{adherence}",
                ratio=ratio,
                adherence=adherence,
            ),
        )

        assert replayed is False
        assert reward.coins_awarded == expected_coins
        assert reward.xp_awarded == expected_xp


def test_first_success_levels_up_and_replay_is_idempotent() -> None:
    session, plan = reward_session()
    with session:
        row = evaluation(session, plan, key="first-success", ratio=10_000)
        reward, replayed = process_evaluation(session, evaluation=row)
        session.commit()
        replay, was_replayed = process_evaluation(session, evaluation=row)
        wallet = session.get(GameWallet, "demo-player")

        assert (reward.coins_awarded, reward.xp_awarded) == (420, 100)
        assert (reward.previous_level, reward.new_level) == (1, 2)
        assert replayed is False
        assert was_replayed is True
        assert replay.id == reward.id
        assert wallet is not None
        assert (wallet.coin_balance, wallet.xp, wallet.level) == (10_420, 100, 2)


def test_streak_hold_reset_and_exceptional_expense_preservation() -> None:
    session, plan = reward_session()
    with session:
        first, _ = process_evaluation(
            session,
            evaluation=evaluation(session, plan, key="streak-1", ratio=10_000),
        )
        held, _ = process_evaluation(
            session,
            evaluation=evaluation(
                session,
                plan,
                key="streak-hold",
                ratio=5_000,
                adherence="moderate",
            ),
        )
        exceptional, _ = process_evaluation(
            session,
            evaluation=evaluation(
                session,
                plan,
                key="streak-exception",
                ratio=10_000,
                adherence="substantial",
                exceptional=True,
            ),
        )
        reset, _ = process_evaluation(
            session,
            evaluation=evaluation(
                session,
                plan,
                key="streak-reset",
                ratio=4_999,
                adherence="within",
            ),
        )

        assert first.streak_weeks == 1
        assert held.streak_weeks == 1
        assert exceptional.streak_weeks == 1
        assert exceptional.coins_awarded == 420
        assert reset.streak_weeks == 0


def test_zero_savings_plan_is_not_reward_eligible() -> None:
    session, plan = reward_session()
    with session:
        wallet = ensure_wallet(session, "demo-player")
        wallet.streak_weeks = 2
        reward, _ = process_evaluation(
            session,
            evaluation=evaluation(
                session,
                plan,
                key="zero-target",
                ratio=10_000,
                planned_savings=0,
            ),
        )

        assert (reward.coins_awarded, reward.xp_awarded) == (0, 0)
        assert reward.streak_weeks == 2
