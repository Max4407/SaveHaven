from collections import defaultdict
from datetime import timedelta

from sqlalchemy.orm import Session

from repository import get_bank_connection, list_accounts, list_transactions
from schemas import (
    AccountResponse,
    BankConnectionResponse,
    DashboardResponse,
    DashboardSummaryResponse,
    SpendingCategoryResponse,
    TransactionResponse,
)
from services.bank_sync import BankConnectionNotFoundError


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
        if transaction.signed_amount_cents > 0
    )
    spending_cents = -sum(
        transaction.signed_amount_cents
        for transaction in recent_period
        if transaction.signed_amount_cents < 0
    )

    category_totals: defaultdict[str, int] = defaultdict(int)
    for transaction in recent_period:
        if transaction.signed_amount_cents < 0:
            category_totals[transaction.category] += -transaction.signed_amount_cents

    checking_balance = sum(
        account.balance_cents for account in accounts if account.account_type == "checking"
    )
    savings_balance = sum(
        account.balance_cents for account in accounts if account.account_type == "savings"
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
            for transaction in transactions[:50]
        ],
        spending_by_category=[
            SpendingCategoryResponse(category=category, amount_cents=amount_cents)
            for category, amount_cents in sorted(
                category_totals.items(),
                key=lambda item: item[1],
                reverse=True,
            )
        ],
    )
