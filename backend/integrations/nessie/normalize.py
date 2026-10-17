from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from schemas import FinancialSnapshot, SnapshotAccount, SnapshotTransaction


def dollars_to_cents(value: Any) -> int:
    amount = Decimal(str(value or 0)) * 100
    return int(amount.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def parse_nessie_date(value: Any) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def normalize_nessie_snapshot(
    *,
    profile_id: str,
    customer_id: str,
    customer: dict[str, Any],
    accounts: list[dict[str, Any]],
    transactions_by_account: dict[str, dict[str, list[dict[str, Any]]]],
) -> FinancialSnapshot:
    first_name = str(customer.get("first_name", "")).strip()
    last_name = str(customer.get("last_name", "")).strip()
    display_name = " ".join(part for part in (first_name, last_name) if part) or "Demo Customer"

    normalized_accounts: list[SnapshotAccount] = []
    normalized_transactions: list[SnapshotTransaction] = []
    as_of_dates: list[date] = []

    for account in accounts:
        account_id = str(account.get("_id") or account.get("id") or "")
        if not account_id:
            continue
        normalized_accounts.append(
            SnapshotAccount(
                source_account_id=account_id,
                account_type=str(account.get("type") or "checking").lower(),
                nickname=str(account.get("nickname") or "Account"),
                balance_cents=dollars_to_cents(account.get("balance")),
            )
        )

        grouped_transactions = transactions_by_account.get(account_id, {})
        for kind, records in grouped_transactions.items():
            for record in records:
                occurred_at = parse_nessie_date(
                    record.get("transaction_date")
                    or record.get("purchase_date")
                    or record.get("payment_date")
                    or record.get("creation_date")
                )
                if occurred_at is None:
                    continue
                as_of_dates.append(occurred_at)

                direction = _transaction_direction(kind, record, account_id)
                amount_cents = dollars_to_cents(
                    record.get("amount", record.get("payment_amount", 0))
                )
                signed_amount_cents = amount_cents if direction == "inflow" else -amount_cents
                source_id = str(record.get("_id") or record.get("id") or "")
                if not source_id:
                    source_id = f"{kind}-{account_id}-{occurred_at.isoformat()}-{amount_cents}"

                normalized_transactions.append(
                    SnapshotTransaction(
                        source_account_id=account_id,
                        source_id=f"{kind}:{source_id}",
                        occurred_at=occurred_at,
                        signed_amount_cents=signed_amount_cents,
                        direction=direction,
                        kind=kind,
                        merchant_name=None,
                        category=_default_category(kind, direction),
                        description=str(record.get("description") or record.get("medium") or kind),
                    )
                )

    return FinancialSnapshot(
        profile_id=profile_id,
        customer_id=customer_id,
        customer_display_name=display_name,
        as_of=max(as_of_dates, default=date.today()),
        accounts=normalized_accounts,
        transactions=normalized_transactions,
    )


def _transaction_direction(kind: str, record: dict[str, Any], account_id: str) -> str:
    if kind == "deposit":
        return "inflow"
    if kind == "transfer" and str(record.get("payee_id")) == account_id:
        return "inflow"
    return "outflow"


def _default_category(kind: str, direction: str) -> str:
    if direction == "inflow":
        return "income"
    return {
        "purchase": "purchases",
        "withdrawal": "cash",
        "transfer": "transfers",
    }.get(kind, kind)
