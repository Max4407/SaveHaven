from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from integrations.nessie import NessieRequestError
from models import (
    DemoNessieRecord,
    GameWallet,
    NormalizedTransaction,
    PlacedBuilding,
    PlanPeriodEvaluation,
    RewardEvent,
)
from repository import (
    ensure_wallet,
    get_accepted_plan,
    get_active_goal,
    get_bank_connection,
    get_evaluation_by_key,
    get_reward_by_source,
    list_accounts,
    list_transactions,
)
from schemas import (
    GameStateResponse,
    LevelUnlocksResponse,
    NessieEventRequest,
    SimulateWeekResponse,
)
from services.bank_sync import BankSyncError
from services.game import GameService
from services.nessie_events import NessieEventError, NessieEventService
from services.progression import district_for_level, infrastructure_for_level
from services.rewards import evaluation_response, process_evaluation, reward_response

ESSENTIAL_CATEGORIES = {
    "childcare",
    "groceries",
    "healthcare",
    "housing",
    "insurance",
    "transportation",
    "utilities",
}


class DemoWeekError(RuntimeError):
    pass


class DemoWeekService:
    def __init__(
        self,
        *,
        nessie_events: NessieEventService,
        game: GameService,
        allow_fixture_fallback: bool,
    ) -> None:
        self.nessie_events = nessie_events
        self.game = game
        self.allow_fixture_fallback = allow_fixture_fallback

    def simulate(
        self,
        session: Session,
        *,
        user_id: str,
        idempotency_key: str,
        scenario: str,
    ) -> SimulateWeekResponse:
        existing = get_evaluation_by_key(
            session,
            user_id=user_id,
            idempotency_key=idempotency_key,
        )
        if existing is not None:
            reward = get_reward_by_source(
                session,
                user_id=user_id,
                source_key=f"plan-period:{existing.id}",
                reward_type="weekly_plan",
            )
            if reward is None:
                reward, _ = process_evaluation(session, evaluation=existing)
                session.commit()
            return SimulateWeekResponse(
                source=existing.source,  # type: ignore[arg-type]
                replayed=True,
                evaluation=evaluation_response(existing),
                reward=reward_response(reward),
                unlocks=self._unlocks(reward.previous_level, reward.new_level),
                game_state=self.game.get_state(session, user_id=user_id),
            )

        goal = get_active_goal(session, user_id)
        if goal is None:
            raise DemoWeekError("Create and accept a savings plan before simulating a week.")
        plan = get_accepted_plan(session, user_id=user_id, goal_id=goal.id)
        if plan is None:
            raise DemoWeekError("Accept the current savings plan before simulating a week.")
        if plan.weekly_savings_cents <= 0:
            raise DemoWeekError("This savings plan has no reward-eligible weekly target.")

        event_key = idempotency_key[:68]
        savings_amount = (
            plan.weekly_savings_cents
            if scenario == "successful"
            else max(100, plan.weekly_savings_cents // 2)
        )
        spending_amount = 0
        if scenario == "off_plan":
            spending_amount = max(5_000, (plan.safe_to_spend_cents * 130 + 99) // 100)

        source = "fixture_fallback"
        remote_records = []
        connection = get_bank_connection(session, user_id)
        if connection is None:
            raise DemoWeekError("Connect a demo bank before simulating a week.")
        if connection.data_source == "live":
            try:
                savings_result = self.nessie_events.run(
                    session,
                    user_id=user_id,
                    event=NessieEventRequest(
                        event_type="move_to_savings",
                        amount_cents=_whole_dollars(savings_amount),
                        idempotency_key=f"{event_key}-save",
                    ),
                )
                remote_records.extend(savings_result.remote_records)
                if spending_amount:
                    spending_result = self.nessie_events.run(
                        session,
                        user_id=user_id,
                        event=NessieEventRequest(
                            event_type="unplanned_purchase",
                            amount_cents=_whole_dollars(spending_amount),
                            idempotency_key=f"{event_key}-spend",
                        ),
                    )
                    remote_records.extend(spending_result.remote_records)
                source = "live"
            except (NessieEventError, BankSyncError):
                if not self.allow_fixture_fallback:
                    raise DemoWeekError("Nessie could not simulate the plan period.") from None
                session.rollback()

        if source == "fixture_fallback":
            self._insert_fallback_transactions(
                session,
                user_id=user_id,
                savings_event_key=f"{event_key}-save",
                savings_amount=savings_amount,
                spending_event_key=f"{event_key}-spend",
                spending_amount=spending_amount,
            )

        evaluation = self._evaluate(
            session,
            user_id=user_id,
            plan=plan,
            idempotency_key=idempotency_key,
            event_key=event_key,
            source=source,
        )
        session.flush()
        now = datetime.now(UTC)
        for record in remote_records:
            session.add(
                DemoNessieRecord(
                    user_id=user_id,
                    plan_period_id=evaluation.id,
                    resource=record.resource,
                    remote_id=record.record_id,
                    created_at=now,
                )
            )
        reward, replayed = process_evaluation(session, evaluation=evaluation)
        session.commit()
        return SimulateWeekResponse(
            source=source,  # type: ignore[arg-type]
            replayed=replayed,
            evaluation=evaluation_response(evaluation),
            reward=reward_response(reward),
            unlocks=self._unlocks(reward.previous_level, reward.new_level),
            game_state=self.game.get_state(session, user_id=user_id),
        )

    def _unlocks(self, previous_level: int, new_level: int) -> LevelUnlocksResponse:
        leveled_up = new_level > previous_level
        return LevelUnlocksResponse(
            catalog_items=[
                item
                for item in self.game.catalog.items
                if previous_level < item.level_required <= new_level
            ],
            district=district_for_level(new_level) if leveled_up else None,
            infrastructure=(
                infrastructure_for_level(new_level) if leveled_up else None
            ),
        )

    def reset(
        self, session: Session, *, user_id: str
    ) -> tuple[GameStateResponse, list[str]]:
        warnings: list[str] = []
        client = self.nessie_events.client
        remote_records = list(
            session.scalars(
                select(DemoNessieRecord).where(DemoNessieRecord.user_id == user_id)
            )
        )
        cleanup_failed = False
        if client is not None:
            for record in remote_records:
                try:
                    client.delete_account_record(
                        resource=record.resource,
                        record_id=record.remote_id,
                    )
                    session.delete(record)
                except NessieRequestError:
                    cleanup_failed = True
                    warnings.append(
                        f"Could not remove Nessie {record.resource} record {record.remote_id}."
                    )
            if remote_records:
                try:
                    self.nessie_events.bank_sync.sync_existing(session, user_id=user_id)
                except (BankSyncError, NessieRequestError):
                    cleanup_failed = True
                    warnings.append("Nessie cleanup completed, but the final resync failed.")
        elif remote_records:
            cleanup_failed = True
            warnings.append(
                "Nessie cleanup is unavailable; future demo weeks will use fixture fallback."
            )

        if cleanup_failed:
            connection = get_bank_connection(session, user_id)
            if connection is not None:
                connection.data_source = "fixture"
        session.execute(delete(RewardEvent).where(RewardEvent.user_id == user_id))
        session.execute(
            delete(PlanPeriodEvaluation).where(PlanPeriodEvaluation.user_id == user_id)
        )
        session.execute(delete(PlacedBuilding).where(PlacedBuilding.user_id == user_id))
        session.execute(delete(GameWallet).where(GameWallet.user_id == user_id))
        session.execute(
            delete(NormalizedTransaction).where(
                NormalizedTransaction.user_id == user_id,
                NormalizedTransaction.source_id.contains(":demo:"),
            )
        )
        ensure_wallet(session, user_id)
        session.commit()
        return self.game.get_state(session, user_id=user_id), warnings

    def _evaluate(
        self,
        session: Session,
        *,
        user_id: str,
        plan,
        idempotency_key: str,
        event_key: str,
        source: str,
    ) -> PlanPeriodEvaluation:
        accounts = list_accounts(session, user_id)
        savings_accounts = {
            account.source_account_id
            for account in accounts
            if account.account_type == "savings"
        }
        prefixes = (f":demo:{event_key}-save:", f":demo:{event_key}-spend:")
        transactions = [
            transaction
            for transaction in list_transactions(session, user_id)
            if any(prefix in transaction.source_id for prefix in prefixes)
        ]
        actual_savings = sum(
            transaction.signed_amount_cents
            for transaction in transactions
            if transaction.source_account_id in savings_accounts
        )
        if source == "live" and abs(actual_savings - plan.weekly_savings_cents) < 100:
            actual_savings = plan.weekly_savings_cents
        actual_discretionary = -sum(
            transaction.signed_amount_cents
            for transaction in transactions
            if transaction.signed_amount_cents < 0
            and transaction.kind not in {"bill", "transfer"}
            and transaction.category not in ESSENTIAL_CATEGORIES
        )
        savings_ratio = _round_half_up(
            max(0, actual_savings) * 10_000,
            plan.weekly_savings_cents,
        )
        if plan.safe_to_spend_cents <= 0:
            adherence = "within" if actual_discretionary == 0 else "substantial"
        else:
            spending_ratio = _round_half_up(
                actual_discretionary * 10_000,
                plan.safe_to_spend_cents,
            )
            adherence = (
                "within"
                if spending_ratio <= 11_000
                else "moderate"
                if spending_ratio <= 12_500
                else "substantial"
            )

        prior_count = session.scalar(
            select(func.count(PlanPeriodEvaluation.id)).where(
                PlanPeriodEvaluation.user_id == user_id
            )
        ) or 0
        period_end = date.today() + timedelta(weeks=prior_count)
        evaluation = PlanPeriodEvaluation(
            user_id=user_id,
            accepted_plan_id=plan.id,
            period_start=period_end - timedelta(days=6),
            period_end=period_end,
            planned_savings_cents=plan.weekly_savings_cents,
            actual_net_savings_cents=actual_savings,
            planned_discretionary_spending_cents=plan.safe_to_spend_cents,
            actual_discretionary_spending_cents=actual_discretionary,
            savings_ratio_basis_points=savings_ratio,
            adherence_tier=adherence,
            exceptional_expense_flag=False,
            source=source,
            idempotency_key=idempotency_key,
            explanation=(
                f"Saved {actual_savings / 100:,.2f} against a "
                f"{plan.weekly_savings_cents / 100:,.2f} weekly target and used "
                f"{actual_discretionary / 100:,.2f} of discretionary spending."
            ),
            evaluated_at=datetime.now(UTC),
        )
        session.add(evaluation)
        return evaluation

    def _insert_fallback_transactions(
        self,
        session: Session,
        *,
        user_id: str,
        savings_event_key: str,
        savings_amount: int,
        spending_event_key: str,
        spending_amount: int,
    ) -> None:
        accounts = list_accounts(session, user_id)
        by_type = {account.account_type: account.source_account_id for account in accounts}
        if "checking" not in by_type or "savings" not in by_type:
            raise DemoWeekError("The connected profile needs checking and savings accounts.")
        now = datetime.now(UTC)
        occurred_at = date.today()
        rows = [
            NormalizedTransaction(
                user_id=user_id,
                source_account_id=by_type["checking"],
                source_id=f"withdrawal:demo:{savings_event_key}:withdrawal:local",
                occurred_at=occurred_at,
                signed_amount_cents=-savings_amount,
                direction="outflow",
                kind="transfer",
                merchant_name="Goal Savings",
                category="savings",
                description="Weekly savings transfer",
                synced_at=now,
            ),
            NormalizedTransaction(
                user_id=user_id,
                source_account_id=by_type["savings"],
                source_id=f"deposit:demo:{savings_event_key}:deposit:local",
                occurred_at=occurred_at,
                signed_amount_cents=savings_amount,
                direction="inflow",
                kind="transfer",
                merchant_name="Checking",
                category="savings",
                description="Weekly savings transfer",
                synced_at=now,
            ),
        ]
        if spending_amount:
            rows.append(
                NormalizedTransaction(
                    user_id=user_id,
                    source_account_id=by_type["checking"],
                    source_id=f"withdrawal:demo:{spending_event_key}:withdrawal:local",
                    occurred_at=occurred_at,
                    signed_amount_cents=-spending_amount,
                    direction="outflow",
                    kind="purchase",
                    merchant_name="Impulse Electronics",
                    category="discretionary",
                    description="Unplanned discretionary purchase",
                    synced_at=now,
                )
            )
        existing_ids = {
            transaction.source_id for transaction in list_transactions(session, user_id)
        }
        savings_marker = f":demo:{savings_event_key}:"
        spending_marker = f":demo:{spending_event_key}:"
        savings_exists = any(savings_marker in source_id for source_id in existing_ids)
        spending_exists = any(spending_marker in source_id for source_id in existing_ids)
        session.add_all(
            row
            for row in rows
            if row.source_id not in existing_ids
            and (spending_marker not in row.source_id or not spending_exists)
            and (savings_marker not in row.source_id or not savings_exists)
        )
        session.flush()


def _whole_dollars(amount_cents: int) -> int:
    return max(100, _round_half_up(amount_cents, 100) * 100)


def _round_half_up(numerator: int, denominator: int) -> int:
    return (numerator + denominator // 2) // denominator
