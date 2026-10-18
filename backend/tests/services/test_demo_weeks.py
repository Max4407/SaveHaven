from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import func, select

from config import Settings
from database import Database
from integrations.nessie import FixtureProfileStore
from models import (
    AcceptedSavingsPlan,
    DemoNessieRecord,
    NormalizedTransaction,
    PlanPeriodEvaluation,
    RewardEvent,
)
from repository import (
    get_active_goal,
    get_bank_connection,
    list_accounts,
    replace_active_goal,
    seed_demo_users,
)
from schemas import NessieRecordReference, PlaceBuildingRequest
from services import BankSyncService, DemoWeekService, GameService, NessieEventService, TownCatalog

CATALOG_PATH = Path(__file__).resolve().parents[3] / "data" / "catalog" / "town_catalog.json"


class ResyncingNessieEvents:
    def __init__(self) -> None:
        self.client = object()
        self.events = []

    def run(self, session, *, user_id: str, event):
        self.events.append(event)
        now = datetime.now(UTC)
        if event.event_type == "move_to_savings":
            rows = [
                NormalizedTransaction(
                    user_id=user_id,
                    source_account_id="jordan-checking",
                    source_id=f"withdrawal:demo:{event.idempotency_key}:withdrawal:fake",
                    occurred_at=event.occurred_at,
                    signed_amount_cents=-event.amount_cents,
                    direction="outflow",
                    kind="transfer",
                    merchant_name="Goal Savings",
                    category="savings",
                    description="Weekly savings transfer",
                    synced_at=now,
                ),
                NormalizedTransaction(
                    user_id=user_id,
                    source_account_id="jordan-savings",
                    source_id=f"deposit:demo:{event.idempotency_key}:deposit:fake",
                    occurred_at=event.occurred_at,
                    signed_amount_cents=event.amount_cents,
                    direction="inflow",
                    kind="transfer",
                    merchant_name="Checking",
                    category="savings",
                    description="Weekly savings transfer",
                    synced_at=now,
                ),
            ]
            remote_records = [
                NessieRecordReference(
                    resource="withdrawals",
                    record_id=f"withdrawal-{event.idempotency_key}",
                ),
                NessieRecordReference(
                    resource="deposits",
                    record_id=f"deposit-{event.idempotency_key}",
                ),
            ]
        else:
            inflow = event.event_type == "paycheck"
            resource = "deposits" if inflow else "withdrawals"
            kind = (
                "deposit"
                if inflow
                else "bill"
                if event.event_type == "recurring_bill"
                else "purchase"
            )
            category = (
                "income"
                if inflow
                else "housing"
                if event.event_type == "recurring_bill"
                else "groceries"
                if event.event_type == "planned_purchase"
                else "discretionary"
            )
            rows = [
                NormalizedTransaction(
                    user_id=user_id,
                    source_account_id="jordan-checking",
                    source_id=f"{resource}:demo:{event.idempotency_key}:{resource}:fake",
                    occurred_at=event.occurred_at,
                    signed_amount_cents=event.amount_cents if inflow else -event.amount_cents,
                    direction="inflow" if inflow else "outflow",
                    kind=kind,
                    merchant_name="Simulated activity",
                    category=category,
                    description="Simulated weekly activity",
                    synced_at=now,
                )
            ]
            remote_records = [
                NessieRecordReference(
                    resource=resource,
                    record_id=f"{resource}-{event.idempotency_key}",
                )
            ]
        session.add_all(rows)
        session.flush()
        return SimpleNamespace(remote_records=remote_records)


def setup_demo_week_service():
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite:///:memory:",
        session_secret="test-only-session-secret",
        nessie_data_mode="fixture",
        nessie_allow_fixture_fallback=True,
    )
    database = Database(settings.database_url)
    database.create_schema()
    fixture_store = FixtureProfileStore(settings.nessie_fixture_path)
    bank_sync = BankSyncService(
        settings=settings,
        fixture_store=fixture_store,
        nessie_client=None,
    )
    game = GameService(TownCatalog.load(CATALOG_PATH))
    service = DemoWeekService(
        nessie_events=NessieEventService(client=None, bank_sync=bank_sync),
        game=game,
        allow_fixture_fallback=True,
    )
    with database.session_factory() as session:
        seed_demo_users(session)
        bank_sync.connect(
            session,
            user_id="demo-player",
            profile_id="steady-paycheck",
        )
        goal = replace_active_goal(
            session,
            user_id="demo-player",
            name="Emergency fund",
            target_amount_cents=500_000,
            amount_already_saved_cents=0,
            target_date=date.today() + timedelta(days=365),
        )
        session.add(
            AcceptedSavingsPlan(
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
                explanation="Test accepted plan",
                evidence_json="[]",
                accepted_at=datetime.now(UTC),
            )
        )
        session.commit()
    return database, service


def test_fixture_fallback_success_is_explained_and_idempotent() -> None:
    database, service = setup_demo_week_service()
    with database.session_factory() as session:
        initial_transaction_count = session.scalar(select(func.count(NormalizedTransaction.id)))
        first = service.simulate(
            session,
            user_id="demo-player",
            idempotency_key="successful-week-001",
            scenario="successful",
        )
        replay = service.simulate(
            session,
            user_id="demo-player",
            idempotency_key="successful-week-001",
            scenario="successful",
        )
        final_transaction_count = session.scalar(select(func.count(NormalizedTransaction.id)))

        assert first.source == "fixture_fallback"
        assert first.replayed is False
        assert (first.reward.coins_awarded, first.reward.xp_awarded) == (420, 100)
        assert first.game_state.wallet.level_name == "Village"
        assert first.game_state.infrastructure.tier == "gravel"
        assert [item.id for item in first.unlocks.catalog_items] == [
            "townhouse_01",
            "bakery_01",
            "smithy_01",
            "windmill_01",
        ]
        assert first.unlocks.district is not None
        assert first.unlocks.infrastructure is not None
        assert replay.replayed is True
        assert replay.reward.id == first.reward.id
        assert replay.game_state.wallet.coin_balance == 720
        assert final_transaction_count == initial_transaction_count + 5
        assert first.evaluation.period_start == date.today() + timedelta(days=1)
        assert first.evaluation.period_end == date.today() + timedelta(days=7)
        assert first.dashboard.summary.as_of == first.evaluation.period_end
        assert first.dashboard.summary.checking_balance_cents == 362_650
        assert first.dashboard.summary.savings_balance_cents == 645_000
        assert first.dashboard.active_goal is not None
        assert first.dashboard.active_goal.amount_already_saved_cents == 645_000
        generated = [
            transaction
            for transaction in first.dashboard.recent_transactions
            if "successful-week-001" in transaction.source_id
        ]
        assert len(generated) == 5
        assert {transaction.kind for transaction in generated} == {
            "bill",
            "deposit",
            "purchase",
            "transfer",
        }


def test_live_week_uses_the_resynced_nessie_amount_for_rewards() -> None:
    database, service = setup_demo_week_service()
    nessie_events = ResyncingNessieEvents()
    service.nessie_events = nessie_events  # type: ignore[assignment]

    with database.session_factory() as session:
        connection = get_bank_connection(session, "demo-player")
        plan = session.scalar(select(AcceptedSavingsPlan))
        assert connection is not None
        assert plan is not None
        connection.data_source = "live"
        plan.weekly_savings_cents = 20_049
        session.commit()

        result = service.simulate(
            session,
            user_id="demo-player",
            idempotency_key="live-week-001",
            scenario="successful",
        )
        remote_records = list(session.scalars(select(DemoNessieRecord)))

    assert result.source == "live"
    assert [event.event_type for event in nessie_events.events] == [
        "paycheck",
        "recurring_bill",
        "planned_purchase",
        "move_to_savings",
    ]
    assert nessie_events.events[-1].amount_cents == 20_000
    assert nessie_events.events[0].occurred_at == result.evaluation.period_start
    assert nessie_events.events[-1].occurred_at == result.evaluation.period_end
    assert result.evaluation.actual_net_savings_cents == 20_000
    assert len(remote_records) == 5


def test_three_successful_periods_unlock_haven_without_rewriting_history() -> None:
    database, service = setup_demo_week_service()
    with database.session_factory() as session:
        results = [
            service.simulate(
                session,
                user_id="demo-player",
                idempotency_key=f"successful-week-{number:03d}",
                scenario="successful",
            )
            for number in range(1, 4)
        ]

        assert [result.reward.xp_awarded for result in results] == [100, 100, 100]
        assert [result.reward.coins_awarded for result in results] == [420, 440, 460]
        assert results[-1].game_state.wallet.xp == 300
        assert results[-1].game_state.wallet.level_name == "Haven"
        assert results[-1].game_state.district.max_x == 31
        assert results[-1].game_state.district.max_y == 69
        assert results[-1].game_state.infrastructure.tier == "stone"
        assert [result.evaluation.period_end for result in results] == [
            date.today() + timedelta(weeks=week) for week in range(1, 4)
        ]


def test_unlocked_bakery_persists_moves_free_and_refunds_original_price() -> None:
    database, service = setup_demo_week_service()
    with database.session_factory() as session:
        service.simulate(
            session,
            user_id="demo-player",
            idempotency_key="bakery-week-001",
            scenario="successful",
        )
        purchased = service.game.buy_building(
            session,
            user_id="demo-player",
            request=PlaceBuildingRequest(
                catalog_item_id="bakery_01",
                grid_x=4,
                grid_y=4,
            ),
        )
        building_id = purchased.buildings[0].id
        moved = service.game.move_building(
            session,
            user_id="demo-player",
            building_id=building_id,
            grid_x=9,
            grid_y=4,
        )

        assert purchased.wallet.coin_balance == 320
        assert moved.wallet.coin_balance == 320

    with database.session_factory() as reloaded_session:
        reloaded = service.game.get_state(reloaded_session, user_id="demo-player")
        sold = service.game.sell_building(
            reloaded_session,
            user_id="demo-player",
            building_id=building_id,
        )

        assert (reloaded.buildings[0].grid_x, reloaded.buildings[0].grid_y) == (9, 4)
        assert sold.wallet.coin_balance == 560


def test_off_plan_week_is_bounded_and_never_damages_the_town() -> None:
    database, service = setup_demo_week_service()
    with database.session_factory() as session:
        before = service.game.get_state(session, user_id="demo-player")
        result = service.simulate(
            session,
            user_id="demo-player",
            idempotency_key="off-plan-week-001",
            scenario="off_plan",
        )

        assert (result.reward.coins_awarded, result.reward.xp_awarded) == (100, 50)
        assert result.evaluation.adherence_tier == "substantial"
        assert result.game_state.wallet.coin_balance == before.wallet.coin_balance + 100
        assert result.game_state.buildings == before.buildings


def test_reset_removes_demo_transactions_rewards_and_town_state() -> None:
    database, service = setup_demo_week_service()
    with database.session_factory() as session:
        starting_balances = {
            account.source_account_id: account.balance_cents
            for account in list_accounts(session, "demo-player")
        }
        service.simulate(
            session,
            user_id="demo-player",
            idempotency_key="reset-week-001",
            scenario="successful",
        )
        service.game.buy_building(
            session,
            user_id="demo-player",
            request=PlaceBuildingRequest(
                catalog_item_id="woodshed_01",
                grid_x=4,
                grid_y=4,
            ),
        )

        state, warnings = service.reset(session, user_id="demo-player")
        evaluation_count = session.scalar(select(func.count(PlanPeriodEvaluation.id)))
        rewards = list(
            session.scalars(
                select(RewardEvent).where(RewardEvent.user_id == "demo-player")
            )
        )
        local_demo_count = session.scalar(
            select(func.count(NormalizedTransaction.id)).where(
                NormalizedTransaction.source_id.contains(":demo:")
            )
        )
        reset_balances = {
            account.source_account_id: account.balance_cents
            for account in list_accounts(session, "demo-player")
        }

        assert warnings == []
        assert (state.wallet.coin_balance, state.wallet.xp, state.wallet.level) == (300, 0, 1)
        assert state.buildings == []
        assert evaluation_count == 0
        assert [reward.reward_type for reward in rewards] == ["starter_grant"]
        assert local_demo_count == 0
        assert reset_balances == starting_balances
        reset_goal = get_active_goal(session, "demo-player")
        assert reset_goal is not None
        assert reset_goal.amount_already_saved_cents == starting_balances["jordan-savings"]


def test_reset_retains_unavailable_remote_cleanup_for_a_later_retry() -> None:
    database, service = setup_demo_week_service()
    with database.session_factory() as session:
        session.add(
            DemoNessieRecord(
                user_id="demo-player",
                plan_period_id=None,
                resource="deposits",
                remote_id="remote-deposit-1",
                created_at=datetime.now(UTC),
            )
        )
        session.commit()

        _state, warnings = service.reset(session, user_id="demo-player")
        tracked = list(session.scalars(select(DemoNessieRecord)))

        assert warnings == [
            "Nessie cleanup is unavailable; future demo weeks will use fixture fallback."
        ]
        assert [record.remote_id for record in tracked] == ["remote-deposit-1"]
