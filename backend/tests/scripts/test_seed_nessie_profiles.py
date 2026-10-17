import sys
from datetime import date
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPOSITORY_ROOT))

from scripts.seed_nessie_profiles import (  # noqa: E402
    FixtureAccount,
    FixtureProfile,
    FixtureTransaction,
    account_balance_adjustment,
    account_seed_balance,
)


def test_negative_reconstructed_balance_uses_an_excluded_adjustment() -> None:
    account = FixtureAccount(
        source_account_id="checking-1",
        account_type="checking",
        nickname="Checking",
        balance_cents=10_000,
    )
    profile = FixtureProfile(
        id="tight-budget",
        display_name="Demo Person",
        description="Fictional profile",
        income_pattern="Monthly",
        customer_id="customer-1",
        as_of=date(2026, 10, 17),
        accounts=[account],
        transactions=[
            FixtureTransaction(
                source_account_id="checking-1",
                source_id="paycheck-1",
                occurred_at=date(2026, 10, 1),
                signed_amount_cents=20_000,
                direction="inflow",
                kind="deposit",
                category="income",
            )
        ],
    )

    adjustment = account_balance_adjustment(profile, account)

    assert account_seed_balance(profile, account) == 0
    assert adjustment is not None
    assert adjustment.signed_amount_cents == -10_000
    assert adjustment.kind == "transfer"
