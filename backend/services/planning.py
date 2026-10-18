import json
import math
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from statistics import median

from sqlalchemy.orm import Session

from models import AcceptedSavingsPlan, NormalizedTransaction, SavingsGoal
from repository import get_accepted_plan, list_accounts, list_transactions, save_accepted_plan
from schemas import ForecastResponse, GoalPlanResponse, GoalResponse, SavingsPlanResponse


class GoalNotFoundError(LookupError):
    pass


def current_goal_progress_cents(
    goal: SavingsGoal,
    current_savings_balance_cents: int,
) -> int:
    non_goal_starting_savings = max(
        0,
        goal.starting_savings_balance_cents - goal.amount_already_saved_cents,
    )
    return max(0, current_savings_balance_cents - non_goal_starting_savings)


def goal_response(
    goal: SavingsGoal,
    *,
    current_savings_balance_cents: int | None = None,
) -> GoalResponse:
    amount_saved = (
        goal.amount_already_saved_cents
        if current_savings_balance_cents is None
        else current_goal_progress_cents(goal, current_savings_balance_cents)
    )
    return GoalResponse(
        id=goal.id,
        name=goal.name,
        target_amount_cents=goal.target_amount_cents,
        amount_already_saved_cents=amount_saved,
        target_date=goal.target_date,
        created_at=goal.created_at,
    )


def build_forecast(transactions: list[NormalizedTransaction]) -> ForecastResponse:
    if not transactions:
        return ForecastResponse(
            weekly_income_cents=0,
            weekly_recurring_bills_cents=0,
            weekly_variable_spending_cents=0,
            safety_buffer_cents=0,
            income_cadence="not detected",
            confidence="low",
            detected_deposit_count=0,
            evidence=["No imported transactions are available yet."],
        )

    as_of = max(transaction.occurred_at for transaction in transactions)
    income = [
        transaction
        for transaction in transactions
        if transaction.signed_amount_cents > 0 and transaction.kind != "transfer"
    ]
    groups: defaultdict[str, list[NormalizedTransaction]] = defaultdict(list)
    for transaction in income:
        source_key = (transaction.merchant_name or transaction.description or "unknown source")
        groups[source_key.strip().lower()].append(transaction)
    recurring = max(
        groups.values(),
        key=lambda group: (len(group), sum(t.signed_amount_cents for t in group)),
        default=[],
    )
    total_income = sum(transaction.signed_amount_cents for transaction in income)
    recurring_income_share = (
        sum(transaction.signed_amount_cents for transaction in recurring) / total_income
        if total_income > 0
        else 0
    )
    has_dominant_recurring_source = len(groups) == 1 or recurring_income_share >= 0.75

    cadence = "irregular"
    detected_count = len(recurring)
    weekly_income = 0
    confidence = "low"
    evidence: list[str] = []
    if len(recurring) >= 2 and has_dominant_recurring_source:
        ordered = sorted(recurring, key=lambda transaction: transaction.occurred_at)
        intervals = [
            (right.occurred_at - left.occurred_at).days
            for left, right in zip(ordered, ordered[1:], strict=False)
        ]
        median_days = float(median(intervals))
        cadence, annual_payments = _cadence(intervals, ordered)
        typical_amount = round(median(transaction.signed_amount_cents for transaction in ordered))
        weekly_income = round(typical_amount * annual_payments / 52)
        confidence = "high" if len(ordered) >= 4 else "medium"
        source = ordered[-1].merchant_name or ordered[-1].description or "income source"
        evidence.append(
            f"Detected {len(ordered)} approximately {cadence} deposits from {source}."
        )
        evidence.append(f"Median gap between those deposits is {median_days:g} days.")
    else:
        cutoff = as_of - timedelta(days=29)
        recent_deposits = [
            transaction for transaction in income if transaction.occurred_at >= cutoff
        ]
        recent_income = sum(transaction.signed_amount_cents for transaction in recent_deposits)
        weekly_income = round(recent_income * 7 / 30)
        detected_count = len(recent_deposits)
        if len(groups) > 1 and not has_dominant_recurring_source:
            evidence.append(
                f"Income is spread across {len(groups)} sources, so the estimate uses all "
                f"{len(recent_deposits)} imported deposits from the last 30 days."
            )
        else:
            evidence.append(
                "Income history is sparse, so the estimate uses imported deposits "
                "from the last 30 days."
            )

    observation_start = max(as_of - timedelta(days=89), min(t.occurred_at for t in transactions))
    observation_days = max(30, (as_of - observation_start).days + 1)
    recent = [
        transaction
        for transaction in transactions
        if transaction.occurred_at >= observation_start
    ]
    bill_total = -sum(
        transaction.signed_amount_cents
        for transaction in recent
        if transaction.signed_amount_cents < 0 and transaction.kind == "bill"
    )
    variable_total = -sum(
        transaction.signed_amount_cents
        for transaction in recent
        if transaction.signed_amount_cents < 0
        and transaction.kind not in {"bill", "transfer"}
    )
    weekly_bills = round(bill_total * 7 / observation_days)
    weekly_variable = round(variable_total * 7 / observation_days)
    buffer = round(weekly_income * 0.10)
    evidence.append(
        f"Imported history estimates ${weekly_bills / 100:,.0f} in weekly bills and "
        f"${weekly_variable / 100:,.0f} in recent weekly variable spending."
    )
    evidence.append("A 10% income safety buffer is reserved before safe-to-spend is calculated.")
    return ForecastResponse(
        weekly_income_cents=max(0, weekly_income),
        weekly_recurring_bills_cents=max(0, weekly_bills),
        weekly_variable_spending_cents=max(0, weekly_variable),
        safety_buffer_cents=max(0, buffer),
        income_cadence=cadence,
        confidence=confidence,
        detected_deposit_count=detected_count,
        evidence=evidence,
    )


def _cadence(
    intervals: list[int], transactions: list[NormalizedTransaction]
) -> tuple[str, int]:
    cadence_targets = {
        "weekly": (7.0, 52),
        "biweekly": (14.0, 26),
        "semimonthly": (365 / 24, 24),
        "monthly": (365 / 12, 12),
    }
    scores = {
        cadence: sum(abs(interval - target_days) for interval in intervals) / len(intervals)
        for cadence, (target_days, _annual_payments) in cadence_targets.items()
    }
    cadence = min(scores, key=scores.get)  # type: ignore[arg-type]
    months = {(item.occurred_at.year, item.occurred_at.month) for item in transactions}
    has_twice_monthly_pattern = (
        len(transactions) >= 3
        and len(set(intervals)) > 1
        and len(transactions) / max(1, len(months)) >= 1.5
    )
    if has_twice_monthly_pattern and scores["semimonthly"] <= scores["biweekly"] + 0.5:
        cadence = "semimonthly"
    target_days, annual_payments = cadence_targets[cadence]
    if scores[cadence] > max(5, target_days * 0.35):
        typical_days = float(median(intervals))
        return "irregular", round(365 / max(1, typical_days))
    return cadence, annual_payments


def build_draft_plan(
    goal: SavingsGoal,
    forecast: ForecastResponse,
    *,
    current_goal_progress_cents: int | None = None,
) -> SavingsPlanResponse:
    today = date.today()
    days_remaining = max(1, (goal.target_date - today).days)
    weeks_remaining = max(1, math.ceil(days_remaining / 7))
    amount_saved = (
        goal.amount_already_saved_cents
        if current_goal_progress_cents is None
        else current_goal_progress_cents
    )
    remaining = max(0, goal.target_amount_cents - amount_saved)
    weekly_savings = math.ceil(remaining / weeks_remaining)
    available_before_goal = max(
        0,
        forecast.weekly_income_cents
        - forecast.weekly_recurring_bills_cents
        - forecast.safety_buffer_cents,
    )
    feasible = weekly_savings <= available_before_goal
    safe_to_spend = max(0, available_before_goal - weekly_savings)
    suggested_target_date = None
    if not feasible and remaining > 0 and available_before_goal > 0:
        suggested_weeks = math.ceil(remaining / available_before_goal)
        suggested_target_date = today + timedelta(weeks=suggested_weeks)

    explanation = (
        f"Save ${weekly_savings / 100:,.0f} per week after recurring bills and a 10% income "
        "buffer; the remainder is the safe weekly spending allowance."
    )
    if not feasible:
        explanation = (
            "The current target would require more than the available weekly cash flow, so "
            "safe-to-spend is held at $0 and a later target date is suggested."
        )
    return SavingsPlanResponse(
        goal_id=goal.id,
        weekly_income_cents=forecast.weekly_income_cents,
        weekly_recurring_bills_cents=forecast.weekly_recurring_bills_cents,
        weekly_variable_spending_cents=forecast.weekly_variable_spending_cents,
        safety_buffer_cents=forecast.safety_buffer_cents,
        weekly_savings_cents=weekly_savings,
        safe_to_spend_cents=safe_to_spend,
        confidence=forecast.confidence,
        income_cadence=forecast.income_cadence,
        feasible=feasible,
        suggested_target_date=suggested_target_date,
        explanation=explanation,
        evidence=forecast.evidence,
        status="draft",
    )


def accepted_plan_response(plan: AcceptedSavingsPlan) -> SavingsPlanResponse:
    return SavingsPlanResponse(
        goal_id=plan.goal_id,
        weekly_income_cents=plan.weekly_income_cents,
        weekly_recurring_bills_cents=plan.weekly_recurring_bills_cents,
        weekly_variable_spending_cents=plan.weekly_variable_spending_cents,
        safety_buffer_cents=plan.safety_buffer_cents,
        weekly_savings_cents=plan.weekly_savings_cents,
        safe_to_spend_cents=plan.safe_to_spend_cents,
        confidence=plan.confidence,  # type: ignore[arg-type]
        income_cadence=plan.income_cadence,
        feasible=plan.feasible,
        suggested_target_date=plan.suggested_target_date,
        explanation=plan.explanation,
        evidence=json.loads(plan.evidence_json),
        status="accepted",
        accepted_at=plan.accepted_at,
    )


def build_goal_plan(
    session: Session, *, user_id: str, goal: SavingsGoal, use_accepted: bool = False
) -> GoalPlanResponse:
    forecast = build_forecast(list_transactions(session, user_id))
    current_savings_balance = sum(
        account.balance_cents
        for account in list_accounts(session, user_id)
        if account.account_type == "savings"
    )
    current_progress = current_goal_progress_cents(goal, current_savings_balance)
    accepted = get_accepted_plan(session, user_id=user_id, goal_id=goal.id)
    plan = (
        accepted_plan_response(accepted)
        if use_accepted and accepted
        else build_draft_plan(
            goal,
            forecast,
            current_goal_progress_cents=current_progress,
        )
    )
    return GoalPlanResponse(
        goal=goal_response(goal, current_savings_balance_cents=current_savings_balance),
        forecast=forecast,
        plan=plan,
    )


def accept_goal_plan(session: Session, *, user_id: str, goal: SavingsGoal) -> GoalPlanResponse:
    result = build_goal_plan(session, user_id=user_id, goal=goal)
    draft = result.plan
    accepted = save_accepted_plan(
        session,
        goal_id=goal.id,
        user_id=user_id,
        values={
            "weekly_income_cents": draft.weekly_income_cents,
            "weekly_recurring_bills_cents": draft.weekly_recurring_bills_cents,
            "weekly_variable_spending_cents": draft.weekly_variable_spending_cents,
            "safety_buffer_cents": draft.safety_buffer_cents,
            "weekly_savings_cents": draft.weekly_savings_cents,
            "safe_to_spend_cents": draft.safe_to_spend_cents,
            "confidence": draft.confidence,
            "income_cadence": draft.income_cadence,
            "feasible": draft.feasible,
            "suggested_target_date": draft.suggested_target_date,
            "explanation": draft.explanation,
            "evidence_json": json.dumps(draft.evidence),
            "accepted_at": datetime.now(UTC),
        },
    )
    session.commit()
    return GoalPlanResponse(
        goal=result.goal,
        forecast=result.forecast,
        plan=accepted_plan_response(accepted),
    )
