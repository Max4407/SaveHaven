from datetime import date
from types import SimpleNamespace

from sqlalchemy import update

from config import Settings
from database import Database
from integrations.nessie import FixtureProfileStore
from models import NormalizedTransaction
from repository import replace_active_goal, seed_demo_users
from services import BankSyncService, build_dashboard
from services.planning import (
    accept_goal_plan,
    build_draft_plan,
    build_forecast,
    build_goal_plan,
)


def tx(
    occurred_at: date,
    amount: int,
    *,
    kind: str = "deposit",
    merchant: str = "Demo Employer",
    description: str = "Payroll deposit",
):
    return SimpleNamespace(
        occurred_at=occurred_at,
        signed_amount_cents=amount,
        kind=kind,
        merchant_name=merchant,
        description=description,
    )


def test_biweekly_income_and_spending_exclusions_are_explainable() -> None:
    transactions = [
        tx(date(2026, 9, 11), 185_000),
        tx(date(2026, 9, 25), 184_900),
        tx(date(2026, 10, 9), 185_100),
        tx(date(2026, 10, 1), -120_000, kind="bill", merchant="Rent"),
        tx(date(2026, 10, 8), -12_000, kind="purchase", merchant="Market"),
        tx(date(2026, 10, 9), -20_000, kind="transfer", merchant="Savings"),
    ]

    forecast = build_forecast(transactions)  # type: ignore[arg-type]

    assert forecast.income_cadence == "biweekly"
    assert forecast.weekly_income_cents == 92_500
    assert forecast.safety_buffer_cents == 9_250
    assert forecast.weekly_variable_spending_cents < 12_000
    assert all("transfer" not in evidence.lower() for evidence in forecast.evidence)


def test_sparse_history_uses_low_confidence_recent_income() -> None:
    forecast = build_forecast([tx(date(2026, 10, 1), 320_000)])  # type: ignore[arg-type]

    assert forecast.confidence == "low"
    assert forecast.income_cadence == "irregular"
    assert forecast.weekly_income_cents == 74_667
    assert "sparse" in forecast.evidence[0].lower()


def test_one_off_demo_paycheck_does_not_erase_biweekly_signal() -> None:
    forecast = build_forecast(
        [
            tx(date(2026, 9, 25), 185_000),
            tx(date(2026, 10, 9), 185_000),
            tx(date(2026, 10, 17), 185_000, description="Demo paycheck"),
        ]
    )  # type: ignore[arg-type]

    assert forecast.income_cadence == "biweekly"
    assert forecast.detected_deposit_count == 3


def test_infeasible_goal_never_returns_negative_safe_to_spend() -> None:
    forecast = build_forecast(
        [
            tx(date(2026, 9, 25), 100_000),
            tx(date(2026, 10, 9), 100_000),
            tx(date(2026, 10, 1), -90_000, kind="bill"),
        ]
    )  # type: ignore[arg-type]
    goal = SimpleNamespace(
        id=1,
        target_amount_cents=10_000_000,
        amount_already_saved_cents=0,
        target_date=date.today().replace(year=date.today().year + 1),
    )

    plan = build_draft_plan(goal, forecast)  # type: ignore[arg-type]

    assert plan.feasible is False
    assert plan.safe_to_spend_cents == 0
    assert plan.suggested_target_date is not None


def test_accepted_plan_stays_fixed_while_new_drafts_use_latest_sync() -> None:
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite:///:memory:",
        session_secret="test-only-session-secret",
        nessie_data_mode="fixture",
    )
    database = Database(settings.database_url)
    database.create_schema()
    with database.session_factory() as session:
        seed_demo_users(session)
        BankSyncService(
            settings=settings,
            fixture_store=FixtureProfileStore(settings.nessie_fixture_path),
            nessie_client=None,
        ).connect(session, user_id="demo-player", profile_id="steady-paycheck")
        goal = replace_active_goal(
            session,
            user_id="demo-player",
            name="Emergency fund",
            target_amount_cents=500_000,
            amount_already_saved_cents=0,
            target_date=date(date.today().year + 1, 12, 1),
        )
        session.commit()
        accepted = accept_goal_plan(session, user_id="demo-player", goal=goal)
        original_weekly_income = accepted.plan.weekly_income_cents

        session.execute(
            update(NormalizedTransaction)
            .where(
                NormalizedTransaction.user_id == "demo-player",
                NormalizedTransaction.category == "income",
            )
            .values(signed_amount_cents=250_000)
        )
        session.commit()

        new_draft = build_goal_plan(session, user_id="demo-player", goal=goal)
        dashboard = build_dashboard(session, user_id="demo-player")

    assert new_draft.plan.weekly_income_cents != original_weekly_income
    assert dashboard.forecast.weekly_income_cents == new_draft.plan.weekly_income_cents
    assert dashboard.current_plan is not None
    assert dashboard.current_plan.status == "accepted"
    assert dashboard.current_plan.weekly_income_cents == original_weekly_income
