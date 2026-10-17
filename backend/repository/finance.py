from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from models import FinancialAccount, NormalizedTransaction
from schemas import FinancialSnapshot


def replace_financial_snapshot(
    session: Session,
    *,
    user_id: str,
    snapshot: FinancialSnapshot,
    synced_at: datetime,
) -> None:
    session.execute(delete(NormalizedTransaction).where(NormalizedTransaction.user_id == user_id))
    session.execute(delete(FinancialAccount).where(FinancialAccount.user_id == user_id))

    session.add_all(
        FinancialAccount(
            user_id=user_id,
            source_account_id=account.source_account_id,
            account_type=account.account_type,
            nickname=account.nickname,
            balance_cents=account.balance_cents,
            synced_at=synced_at,
        )
        for account in snapshot.accounts
    )
    session.add_all(
        NormalizedTransaction(
            user_id=user_id,
            source_account_id=transaction.source_account_id,
            source_id=transaction.source_id,
            occurred_at=transaction.occurred_at,
            signed_amount_cents=transaction.signed_amount_cents,
            direction=transaction.direction,
            kind=transaction.kind,
            merchant_name=transaction.merchant_name,
            category=transaction.category,
            description=transaction.description,
            synced_at=synced_at,
        )
        for transaction in snapshot.transactions
    )


def list_accounts(session: Session, user_id: str) -> list[FinancialAccount]:
    return list(
        session.scalars(
            select(FinancialAccount)
            .where(FinancialAccount.user_id == user_id)
            .order_by(FinancialAccount.nickname)
        )
    )


def list_transactions(session: Session, user_id: str) -> list[NormalizedTransaction]:
    return list(
        session.scalars(
            select(NormalizedTransaction)
            .where(NormalizedTransaction.user_id == user_id)
            .order_by(
                NormalizedTransaction.occurred_at.desc(),
                NormalizedTransaction.source_id,
            )
        )
    )
