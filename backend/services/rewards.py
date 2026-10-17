from datetime import UTC, datetime

from sqlalchemy.orm import Session

from models import PlanPeriodEvaluation, RewardEvent
from repository import ensure_wallet, get_reward_by_source
from schemas import EvaluationResponse, RewardResponse
from services.progression import level_for_xp


def _round_half_up(numerator: int, denominator: int) -> int:
    return (numerator + denominator // 2) // denominator


def evaluation_response(evaluation: PlanPeriodEvaluation) -> EvaluationResponse:
    return EvaluationResponse(
        id=evaluation.id,
        period_start=evaluation.period_start,
        period_end=evaluation.period_end,
        planned_savings_cents=evaluation.planned_savings_cents,
        actual_net_savings_cents=evaluation.actual_net_savings_cents,
        planned_discretionary_spending_cents=(
            evaluation.planned_discretionary_spending_cents
        ),
        actual_discretionary_spending_cents=(
            evaluation.actual_discretionary_spending_cents
        ),
        savings_ratio_basis_points=evaluation.savings_ratio_basis_points,
        adherence_tier=evaluation.adherence_tier,  # type: ignore[arg-type]
        exceptional_expense_flag=evaluation.exceptional_expense_flag,
        source=evaluation.source,
        explanation=evaluation.explanation,
        evaluated_at=evaluation.evaluated_at,
    )


def reward_response(reward: RewardEvent) -> RewardResponse:
    return RewardResponse(
        id=reward.id,
        plan_period_id=reward.plan_period_id,
        reward_type=reward.reward_type,
        coins_awarded=reward.coins_awarded,
        xp_awarded=reward.xp_awarded,
        previous_level=reward.previous_level,
        new_level=reward.new_level,
        streak_weeks=reward.streak_weeks,
        explanation=reward.explanation,
        created_at=reward.created_at,
    )


def process_evaluation(
    session: Session,
    *,
    evaluation: PlanPeriodEvaluation,
) -> tuple[RewardEvent, bool]:
    source_key = f"plan-period:{evaluation.id}"
    existing = get_reward_by_source(
        session,
        user_id=evaluation.user_id,
        source_key=source_key,
        reward_type="weekly_plan",
    )
    if existing is not None:
        return existing, True

    wallet = ensure_wallet(session, evaluation.user_id)
    ratio = max(0, evaluation.savings_ratio_basis_points)
    eligible = evaluation.planned_savings_cents > 0
    base_coins = _round_half_up(400 * min(ratio, 12_500), 10_000) if eligible else 0
    xp_awarded = _round_half_up(100 * min(ratio, 10_000), 10_000) if eligible else 0

    multiplier = {
        "within": 10_000,
        "moderate": 7_500,
        "substantial": 5_000,
    }[evaluation.adherence_tier]
    if evaluation.exceptional_expense_flag:
        multiplier = 10_000

    previous_streak = wallet.streak_weeks
    if not eligible or evaluation.exceptional_expense_flag:
        new_streak = previous_streak
    elif ratio >= 10_000 and evaluation.adherence_tier == "within":
        new_streak = previous_streak + 1
    elif ratio >= 5_000 and evaluation.adherence_tier != "substantial":
        new_streak = previous_streak
    else:
        new_streak = 0

    streak_percent = min(new_streak * 5, 25)
    streak_bonus = _round_half_up(base_coins * streak_percent, 100)
    coins_awarded = _round_half_up(base_coins * multiplier, 10_000) + streak_bonus
    previous_level = wallet.level
    wallet.coin_balance += coins_awarded
    wallet.total_coins_earned += coins_awarded
    wallet.xp += xp_awarded
    wallet.level = level_for_xp(wallet.xp)
    wallet.streak_weeks = new_streak
    wallet.updated_at = datetime.now(UTC)

    explanation = (
        f"Saved {ratio / 100:.0f}% of the weekly target; "
        f"{evaluation.adherence_tier} discretionary spending awarded "
        f"{coins_awarded} Coins and {xp_awarded} XP."
    )
    reward = RewardEvent(
        user_id=evaluation.user_id,
        plan_period_id=evaluation.id,
        source_key=source_key,
        reward_type="weekly_plan",
        coins_awarded=coins_awarded,
        xp_awarded=xp_awarded,
        previous_level=previous_level,
        new_level=wallet.level,
        streak_weeks=new_streak,
        explanation=explanation,
        created_at=datetime.now(UTC),
    )
    session.add(reward)
    session.flush()
    return reward, False
