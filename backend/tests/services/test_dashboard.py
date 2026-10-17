from datetime import date, datetime
from types import SimpleNamespace

from services import dashboard as dashboard_service


def transaction(*, amount_cents: int, kind: str, category: str) -> SimpleNamespace:
    return SimpleNamespace(
        source_account_id="checking-1",
        source_id=f"{kind}-{amount_cents}",
        occurred_at=date(2026, 10, 24),
        signed_amount_cents=amount_cents,
        direction="inflow" if amount_cents > 0 else "outflow",
        kind=kind,
        merchant_name=None,
        category=category,
        description=kind,
    )


def test_internal_savings_transfer_is_not_income_or_spending(monkeypatch) -> None:
    connection = SimpleNamespace(
        profile_id="steady-paycheck",
        nessie_customer_id="customer-1",
        display_name="Jordan Lee",
        data_source="live",
        last_synced_at=datetime(2026, 10, 24),
    )
    accounts = [
        SimpleNamespace(
            source_account_id="checking-1",
            account_type="checking",
            nickname="Checking",
            balance_cents=100_000,
        ),
        SimpleNamespace(
            source_account_id="savings-1",
            account_type="savings",
            nickname="Savings",
            balance_cents=50_000,
        ),
    ]
    transactions = [
        transaction(amount_cents=100_000, kind="deposit", category="income"),
        transaction(amount_cents=-10_000, kind="purchase", category="groceries"),
        transaction(amount_cents=-20_000, kind="transfer", category="savings"),
        transaction(amount_cents=20_000, kind="transfer", category="savings"),
    ]
    monkeypatch.setattr(dashboard_service, "get_bank_connection", lambda *_: connection)
    monkeypatch.setattr(dashboard_service, "list_accounts", lambda *_: accounts)
    monkeypatch.setattr(dashboard_service, "list_transactions", lambda *_: transactions)
    monkeypatch.setattr(dashboard_service, "get_active_goal", lambda *_: None)

    dashboard = dashboard_service.build_dashboard(None, user_id="demo-player")

    assert dashboard.summary.income_last_30_days_cents == 100_000
    assert dashboard.summary.spending_last_30_days_cents == 10_000
    assert [(item.category, item.amount_cents) for item in dashboard.spending_by_category] == [
        ("groceries", 10_000)
    ]
    assert dashboard.import_summary.transaction_types == ["deposit", "purchase", "transfer"]
