from decimal import Decimal

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
