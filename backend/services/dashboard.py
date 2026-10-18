from collections import defaultdict
from datetime import timedelta

from sqlalchemy.orm import Session

from repository import (
    get_accepted_plan,
    get_active_goal,
    get_bank_connection,
    list_accounts,
    list_transactions,
)
from schemas import (
    AccountResponse,
    BankConnectionResponse,
    DashboardResponse,
    DashboardSummaryResponse,
    ImportSummaryResponse,
    SpendingCategoryResponse,
    TransactionResponse,
)
from services.bank_sync import BankConnectionNotFoundError
from services.planning import (
    accepted_plan_response,
    build_draft_plan,
    build_forecast,
    current_goal_progress_cents,
    goal_response,
)


def build_dashboard(session: Session, *, user_id: str) -> DashboardResponse:
    connection = get_bank_connection(session, user_id)
    if connection is None:
        raise BankConnectionNotFoundError(user_id)

    accounts = list_accounts(session, user_id)
    transactions = list_transactions(session, user_id)
    as_of = max((transaction.occurred_at for transaction in transactions), default=None)
    if as_of is None:
        raise BankConnectionNotFoundError(user_id)

    cutoff = as_of - timedelta(days=29)
    recent_period = [
        transaction for transaction in transactions if transaction.occurred_at >= cutoff
    ]
    income_cents = sum(
        transaction.signed_amount_cents
        for transaction in recent_period
        if transaction.signed_amount_cents > 0 and transaction.kind != "transfer"
    )
    spending_cents = -sum(
        transaction.signed_amount_cents
        for transaction in recent_period
        if transaction.signed_amount_cents < 0 and transaction.kind != "transfer"
    )

    category_totals: defaultdict[str, int] = defaultdict(int)
    for transaction in recent_period:
        if transaction.signed_amount_cents < 0 and transaction.kind != "transfer":
            category_totals[transaction.category] += -transaction.signed_amount_cents

    checking_balance = sum(
        account.balance_cents for account in accounts if account.account_type == "checking"
    )
    savings_balance = sum(
        account.balance_cents for account in accounts if account.account_type == "savings"
    )
    forecast = build_forecast(transactions)
    active_goal = get_active_goal(session, user_id)
    current_plan = None
    active_goal_progress = None
    if active_goal is not None:
        active_goal_progress = current_goal_progress_cents(active_goal, savings_balance)
        accepted_plan = get_accepted_plan(session, user_id=user_id, goal_id=active_goal.id)
        current_plan = (
            accepted_plan_response(accepted_plan)
            if accepted_plan is not None
            else build_draft_plan(
                active_goal,
                forecast,
                current_goal_progress_cents=active_goal_progress,
            )
        )

    return DashboardResponse(
        connection=BankConnectionResponse(
            profile_id=connection.profile_id,
            nessie_customer_id=connection.nessie_customer_id,
            display_name=connection.display_name,
            data_source=connection.data_source,
            last_synced_at=connection.last_synced_at,
        ),
        summary=DashboardSummaryResponse(
            as_of=as_of,
            total_balance_cents=sum(account.balance_cents for account in accounts),
            checking_balance_cents=checking_balance,
            savings_balance_cents=savings_balance,
            income_last_30_days_cents=income_cents,
            spending_last_30_days_cents=spending_cents,
        ),
        accounts=[
            AccountResponse(
                source_account_id=account.source_account_id,
                account_type=account.account_type,
                nickname=account.nickname,
                balance_cents=account.balance_cents,
            )
            for account in accounts
        ],
        recent_transactions=[
            TransactionResponse(
                source_account_id=transaction.source_account_id,
                source_id=transaction.source_id,
                occurred_at=transaction.occurred_at,
                signed_amount_cents=transaction.signed_amount_cents,
                direction=transaction.direction,
                kind=transaction.kind,
                merchant_name=transaction.merchant_name,
                category=transaction.category,
                description=transaction.description,
            )
            for transaction in transactions
        ],
        spending_by_category=[
            SpendingCategoryResponse(category=category, amount_cents=amount_cents)
            for category, amount_cents in sorted(
                category_totals.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ],
        import_summary=ImportSummaryResponse(
            account_count=len(accounts),
            transaction_count=len(transactions),
            transaction_types=sorted({transaction.kind for transaction in transactions}),
        ),
        forecast=forecast,
        active_goal=(
            goal_response(active_goal, current_savings_balance_cents=savings_balance)
            if active_goal is not None
            else None
        ),
        current_plan=current_plan,
    )
