from datetime import UTC, date, datetime, timedelta

from sqlalchemy import delete, select
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
    get_latest_evaluation,
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
from services.dashboard import build_dashboard
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
                dashboard=build_dashboard(session, user_id=user_id),
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
        spending_amount = (
            max(5_000, (plan.safe_to_spend_cents * 130 + 99) // 100)
            if scenario == "off_plan"
            else min(plan.weekly_variable_spending_cents, plan.safe_to_spend_cents)
        )
        period_start, period_end = self._next_period(session, user_id=user_id)

        source = "fixture_fallback"
        remote_records = []
        connection = get_bank_connection(session, user_id)
        if connection is None:
            raise DemoWeekError("Connect a demo bank before simulating a week.")
        if connection.data_source == "live":
            starting_live_balances = {
                account.source_account_id: account.balance_cents
                for account in list_accounts(session, user_id)
            }
            try:
                live_events = [
                    (
                        "income",
                        "paycheck",
                        plan.weekly_income_cents,
                        period_start,
                    ),
                    (
                        "bill",
                        "recurring_bill",
                        plan.weekly_recurring_bills_cents,
                        period_start + timedelta(days=2),
                    ),
                    (
                        "spend",
                        "unplanned_purchase" if scenario == "off_plan" else "planned_purchase",
                        spending_amount,
                        period_start + timedelta(days=4),
                    ),
                    ("save", "move_to_savings", savings_amount, period_end),
                ]
                for suffix, event_type, amount, occurred_at in live_events:
                    if amount <= 0:
                        continue
                    result = self.nessie_events.run(
                        session,
                        user_id=user_id,
                        event=NessieEventRequest(
                            event_type=event_type,  # type: ignore[arg-type]
                            amount_cents=_whole_dollars(amount),
                            idempotency_key=f"{event_key}-{suffix}",
                            occurred_at=occurred_at,
                        ),
                    )
                    remote_records.extend(result.remote_records)
                self._apply_live_balance_changes(
                    session,
                    user_id=user_id,
                    starting_balances=starting_live_balances,
                    income_amount=_live_event_amount(plan.weekly_income_cents),
                    bills_amount=_live_event_amount(plan.weekly_recurring_bills_cents),
                    savings_amount=_live_event_amount(savings_amount),
                    spending_amount=_live_event_amount(spending_amount),
                )
                source = "live"
            except (NessieEventError, BankSyncError):
                if not self.allow_fixture_fallback:
                    raise DemoWeekError("Nessie could not simulate the plan period.") from None
                session.rollback()

        if source == "fixture_fallback":
            self._insert_fallback_transactions(
                session,
                user_id=user_id,
                event_key=event_key,
                period_start=period_start,
                period_end=period_end,
                income_amount=plan.weekly_income_cents,
                bills_amount=plan.weekly_recurring_bills_cents,
                savings_amount=savings_amount,
                spending_amount=spending_amount,
                spending_kind=(
                    "unplanned_purchase" if scenario == "off_plan" else "planned_purchase"
                ),
            )

        evaluation = self._evaluate(
            session,
            user_id=user_id,
            plan=plan,
            idempotency_key=idempotency_key,
            source=source,
            period_start=period_start,
            period_end=period_end,
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
            dashboard=build_dashboard(session, user_id=user_id),
        )

    def _next_period(self, session: Session, *, user_id: str) -> tuple[date, date]:
        transactions = list_transactions(session, user_id)
        latest_transaction_date = max(
            (transaction.occurred_at for transaction in transactions),
            default=date.today(),
        )
        latest_evaluation = get_latest_evaluation(session, user_id)
        current_demo_date = max(
            date.today(),
            latest_transaction_date,
            latest_evaluation.period_end if latest_evaluation is not None else date.today(),
        )
        return current_demo_date + timedelta(days=1), current_demo_date + timedelta(days=7)

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
        all_local_demo_transactions = [
            transaction
            for transaction in list_transactions(session, user_id)
            if ":demo:" in transaction.source_id and transaction.source_id.endswith(":local")
        ]
        balance_adjusted_week_keys = {
            _demo_week_key(transaction.source_id)
            for transaction in all_local_demo_transactions
            if "-income:" in transaction.source_id or "-bill:" in transaction.source_id
        }
        local_demo_transactions = [
            transaction
            for transaction in all_local_demo_transactions
            if _demo_week_key(transaction.source_id) in balance_adjusted_week_keys
        ]
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
        local_balance_changes: dict[str, int] = {}
        for transaction in local_demo_transactions:
            local_balance_changes[transaction.source_account_id] = (
                local_balance_changes.get(transaction.source_account_id, 0)
                + transaction.signed_amount_cents
            )
        for account in list_accounts(session, user_id):
            account.balance_cents -= local_balance_changes.get(account.source_account_id, 0)
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
        source: str,
        period_start: date,
        period_end: date,
    ) -> PlanPeriodEvaluation:
        accounts = list_accounts(session, user_id)
        savings_accounts = {
            account.source_account_id
            for account in accounts
            if account.account_type == "savings"
        }
        transactions = [
            transaction
            for transaction in list_transactions(session, user_id)
            if period_start <= transaction.occurred_at <= period_end
        ]
        actual_savings = sum(
            transaction.signed_amount_cents
            for transaction in transactions
            if transaction.source_account_id in savings_accounts
        )
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

        evaluation = PlanPeriodEvaluation(
            user_id=user_id,
            accepted_plan_id=plan.id,
            period_start=period_start,
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
        event_key: str,
        period_start: date,
        period_end: date,
        income_amount: int,
        bills_amount: int,
        savings_amount: int,
        spending_amount: int,
        spending_kind: str,
    ) -> None:
        accounts = list_accounts(session, user_id)
        by_type = {account.account_type: account for account in accounts}
        if "checking" not in by_type or "savings" not in by_type:
            raise DemoWeekError("The connected profile needs checking and savings accounts.")
        now = datetime.now(UTC)
        checking = by_type["checking"]
        savings = by_type["savings"]
        rows = [
            NormalizedTransaction(
                user_id=user_id,
                source_account_id=checking.source_account_id,
                source_id=f"deposit:demo:{event_key}-income:deposit:local",
                occurred_at=period_start,
                signed_amount_cents=income_amount,
                direction="inflow",
                kind="deposit",
                merchant_name="Expected Income",
                category="income",
                description="Simulated weekly income",
                synced_at=now,
            ),
            NormalizedTransaction(
                user_id=user_id,
                source_account_id=checking.source_account_id,
                source_id=f"withdrawal:demo:{event_key}-bill:withdrawal:local",
                occurred_at=period_start + timedelta(days=2),
                signed_amount_cents=-bills_amount,
                direction="outflow",
                kind="bill",
                merchant_name="Recurring Bills",
                category="housing",
                description="Simulated recurring weekly bills",
                synced_at=now,
            ),
            NormalizedTransaction(
                user_id=user_id,
                source_account_id=checking.source_account_id,
                source_id=f"withdrawal:demo:{event_key}-spend:withdrawal:local",
                occurred_at=period_start + timedelta(days=4),
                signed_amount_cents=-spending_amount,
                direction="outflow",
                kind="purchase",
                merchant_name=(
                    "Impulse Electronics"
                    if spending_kind == "unplanned_purchase"
                    else "Planned Weekly Spending"
                ),
                category=(
                    "discretionary"
                    if spending_kind == "unplanned_purchase"
                    else "groceries"
                ),
                description=(
                    "Unplanned discretionary purchase"
                    if spending_kind == "unplanned_purchase"
                    else "Simulated planned weekly spending"
                ),
                synced_at=now,
            ),
            NormalizedTransaction(
                user_id=user_id,
                source_account_id=checking.source_account_id,
                source_id=f"withdrawal:demo:{event_key}-save:withdrawal:local",
                occurred_at=period_end,
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
                source_account_id=savings.source_account_id,
                source_id=f"deposit:demo:{event_key}-save:deposit:local",
                occurred_at=period_end,
                signed_amount_cents=savings_amount,
                direction="inflow",
                kind="transfer",
                merchant_name="Checking",
                category="savings",
                description="Weekly savings transfer",
                synced_at=now,
            ),
        ]
        existing_ids = {
            transaction.source_id for transaction in list_transactions(session, user_id)
        }
        rows = [
            row
            for row in rows
            if row.source_id not in existing_ids and row.signed_amount_cents != 0
        ]
        session.add_all(rows)
        balance_changes: dict[str, int] = {}
        for row in rows:
            balance_changes[row.source_account_id] = (
                balance_changes.get(row.source_account_id, 0) + row.signed_amount_cents
            )
        for account in accounts:
            account.balance_cents += balance_changes.get(account.source_account_id, 0)
            account.synced_at = now
        connection = get_bank_connection(session, user_id)
        if connection is not None:
            connection.last_synced_at = now
        session.flush()

    def _apply_live_balance_changes(
        self,
        session: Session,
        *,
        user_id: str,
        starting_balances: dict[str, int],
        income_amount: int,
        bills_amount: int,
        savings_amount: int,
        spending_amount: int,
    ) -> None:
        accounts = list_accounts(session, user_id)
        by_type = {account.account_type: account for account in accounts}
        if "checking" not in by_type or "savings" not in by_type:
            raise DemoWeekError("The connected profile needs checking and savings accounts.")
        checking = by_type["checking"]
        savings = by_type["savings"]
        checking.balance_cents = (
            starting_balances[checking.source_account_id]
            + income_amount
            - bills_amount
            - spending_amount
            - savings_amount
        )
        savings.balance_cents = (
            starting_balances[savings.source_account_id] + savings_amount
        )
        now = datetime.now(UTC)
        checking.synced_at = now
        savings.synced_at = now
        connection = get_bank_connection(session, user_id)
        if connection is not None:
            connection.last_synced_at = now
        session.flush()


def _whole_dollars(amount_cents: int) -> int:
    return max(100, _round_half_up(amount_cents, 100) * 100)


def _live_event_amount(amount_cents: int) -> int:
    return _whole_dollars(amount_cents) if amount_cents > 0 else 0


def _demo_week_key(source_id: str) -> str:
    demo_part = source_id.split(":demo:", maxsplit=1)[-1].split(":", maxsplit=1)[0]
    for suffix in ("-income", "-bill", "-spend", "-save"):
        if demo_part.endswith(suffix):
            return demo_part[: -len(suffix)]
    return demo_part


def _round_half_up(numerator: int, denominator: int) -> int:
    return (numerator + denominator // 2) // denominator
