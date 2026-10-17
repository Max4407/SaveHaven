from decimal import Decimal

from integrations.nessie.description_metadata import (
    format_demo_description,
    parse_description,
)
from integrations.nessie.normalize import dollars_to_cents, normalize_nessie_snapshot


def test_money_is_normalized_to_integer_cents_without_float_drift() -> None:
    assert dollars_to_cents(10.235) == 1024
    assert dollars_to_cents(Decimal("0.10")) == 10


def test_transfer_direction_uses_the_current_account_role() -> None:
    snapshot = normalize_nessie_snapshot(
        profile_id="transfer-test",
        customer_id="customer-1",
        customer={"first_name": "Demo", "last_name": "Person"},
        accounts=[
            {
                "_id": "checking-1",
                "type": "Checking",
                "nickname": "Checking",
                "balance": 100,
            }
        ],
        transactions_by_account={
            "checking-1": {
                "transfer": [
                    {
                        "_id": "incoming-transfer",
                        "payee_id": "checking-1",
                        "payer_id": "other-account",
                        "amount": 25,
                        "transaction_date": "2026-10-17",
                    }
                ]
            }
        },
    )

    assert snapshot.transactions[0].direction == "inflow"
    assert snapshot.transactions[0].signed_amount_cents == 2500


def test_demo_description_preserves_financial_classification() -> None:
    encoded = format_demo_description(
        event_id="steady-paycheck-20261024-0001-planned-purchase",
        kind="purchase",
        category="groceries",
        plan_status="planned",
        merchant_name="Fresh Basket",
        description="Weekly groceries",
    )

    metadata = parse_description(
        encoded,
        default_kind="withdrawal",
        default_category="cash",
    )

    assert metadata.kind == "purchase"
    assert metadata.category == "groceries"
    assert metadata.merchant_name == "Fresh Basket"
    assert metadata.plan_status == "planned"
    assert metadata.description == "Weekly groceries"


def test_normalization_recognizes_demo_purchase_metadata() -> None:
    encoded = format_demo_description(
        event_id="steady-paycheck-20261024-0001-unplanned-purchase",
        kind="purchase",
        category="discretionary",
        plan_status="unplanned",
        merchant_name="Impulse Electronics",
        description="Unplanned purchase",
    )
    snapshot = normalize_nessie_snapshot(
        profile_id="steady-paycheck",
        customer_id="customer-1",
        customer={"first_name": "Jordan", "last_name": "Lee"},
        accounts=[
            {
                "_id": "checking-1",
                "type": "Checking",
                "nickname": "Checking",
                "balance": 100,
            }
        ],
        transactions_by_account={
            "checking-1": {
                "withdrawal": [
                    {
                        "_id": "demo-purchase",
                        "amount": 150,
                        "transaction_date": "2026-10-24",
                        "description": encoded,
                    }
                ]
            }
        },
    )

    transaction = snapshot.transactions[0]
    assert transaction.kind == "purchase"
    assert transaction.category == "discretionary"
    assert transaction.merchant_name == "Impulse Electronics"
    assert transaction.description == "Unplanned purchase"
