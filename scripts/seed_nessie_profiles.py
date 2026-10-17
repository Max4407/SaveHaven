"""Seed SaveHaven's fictional demo profiles into the Nessie sandbox.

The script is a dry run unless --apply is provided. It reads the committed fixture,
creates or reuses matching Nessie customers and accounts, and replays fixture cash
flow as deposits and withdrawals. The Nessie API key is read from NESSIE_API_KEY,
including from backend/.env; it is never accepted as a command-line argument.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Literal

import httpx
from integrations.nessie.description_metadata import format_seed_description
from pydantic import BaseModel, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FIXTURE_PATH = REPOSITORY_ROOT / "data" / "fixtures" / "nessie_profiles.json"
DEFAULT_STATE_PATH = (
    REPOSITORY_ROOT / "data" / "fixtures" / "nessie_seed_state.local.json"
)


class SeedSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / "backend" / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    nessie_api_key: SecretStr | None = None
    nessie_base_url: str = "https://prod-api.nessieisreal.com"
    nessie_timeout_seconds: float = 10.0


class FixtureAccount(BaseModel):
    source_account_id: str
    account_type: str
    nickname: str
    balance_cents: int


class FixtureTransaction(BaseModel):
    source_account_id: str
    source_id: str
    occurred_at: date
    signed_amount_cents: int
    direction: Literal["inflow", "outflow"]
    kind: str
    merchant_name: str | None = None
    category: str
    description: str = ""

    @model_validator(mode="after")
    def validate_direction_and_sign(self) -> FixtureTransaction:
        expected_direction = "inflow" if self.signed_amount_cents > 0 else "outflow"
        if self.signed_amount_cents == 0:
            raise ValueError("fixture transactions must have a non-zero amount")
        if self.direction != expected_direction:
            raise ValueError(
                f"{self.source_id} direction does not match its signed amount"
            )
        return self


class FixtureProfile(BaseModel):
    id: str
    display_name: str
    description: str
    income_pattern: str
    customer_id: str
    as_of: date
    accounts: list[FixtureAccount]
    transactions: list[FixtureTransaction]

    @model_validator(mode="after")
    def validate_references(self) -> FixtureProfile:
        account_ids = [account.source_account_id for account in self.accounts]
        if len(account_ids) != len(set(account_ids)):
            raise ValueError(f"{self.id} has duplicate source account IDs")

        transaction_ids = [transaction.source_id for transaction in self.transactions]
        if len(transaction_ids) != len(set(transaction_ids)):
            raise ValueError(f"{self.id} has duplicate transaction source IDs")

        unknown_accounts = {
            transaction.source_account_id
            for transaction in self.transactions
            if transaction.source_account_id not in account_ids
        }
        if unknown_accounts:
            raise ValueError(
                f"{self.id} transactions reference unknown accounts: "
                f"{', '.join(sorted(unknown_accounts))}"
            )
        return self


class FixtureFile(BaseModel):
    profiles: list[FixtureProfile]


class NessieSeedError(RuntimeError):
    """Raised when the Nessie API cannot safely complete a seed operation."""


class NessieSeedClient:
    def __init__(self, *, api_key: str, base_url: str, timeout_seconds: float) -> None:
        self._client = httpx.Client(
            base_url=base_url.rstrip("/") + "/",
            timeout=timeout_seconds,
        )
        self._api_key = api_key

    def close(self) -> None:
        self._client.close()

    def get_list(self, path: str) -> list[dict[str, Any]]:
        payload = self._request("GET", path)
        if not isinstance(payload, list) or not all(
            isinstance(item, dict) for item in payload
        ):
            raise NessieSeedError(f"Nessie returned an unexpected list for {path}")
        return payload

    def post(self, path: str, payload: dict[str, Any]) -> None:
        self._request("POST", path, json_payload=payload)

    def _request(
        self,
        method: str,
        path: str,
        *,
        json_payload: dict[str, Any] | None = None,
    ) -> Any:
        try:
            response = self._client.request(
                method,
                path,
                params={"key": self._api_key},
                json=json_payload,
            )
        except httpx.HTTPError as error:
            raise NessieSeedError(f"Nessie {method} {path} could not be completed") from error

        if response.status_code not in {200, 201}:
            body = response.text.replace("\n", " ")[:400]
            raise NessieSeedError(
                f"Nessie {method} {path} returned {response.status_code}: {body}"
            )

        if not response.content:
            return None
        try:
            return response.json()
        except ValueError as error:
            raise NessieSeedError(
                f"Nessie {method} {path} returned invalid JSON"
            ) from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create SaveHaven's fictional demo profiles in Nessie."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Perform remote writes. Without this flag, only print the seed plan.",
    )
    parser.add_argument(
        "--profile",
        action="append",
        dest="profile_ids",
        metavar="PROFILE_ID",
        help="Seed only this fixture profile. Repeat to select more than one.",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE_PATH,
        help=f"Fixture JSON path (default: {DEFAULT_FIXTURE_PATH}).",
    )
    parser.add_argument(
        "--state-output",
        type=Path,
        default=DEFAULT_STATE_PATH,
        help=f"Local ID mapping written after seeding (default: {DEFAULT_STATE_PATH}).",
    )
    parser.add_argument(
        "--update-fixture-ids",
        action="store_true",
        help="Replace selected profiles' customer_id values with their Nessie IDs.",
    )
    return parser.parse_args()


def load_profiles(fixture_path: Path, selected_ids: list[str] | None) -> list[FixtureProfile]:
    with fixture_path.open(encoding="utf-8") as fixture_file:
        fixture = FixtureFile.model_validate(json.load(fixture_file))

    if not selected_ids:
        return fixture.profiles

    by_id = {profile.id: profile for profile in fixture.profiles}
    unknown_ids = sorted(set(selected_ids) - by_id.keys())
    if unknown_ids:
        raise ValueError(f"Unknown profile IDs: {', '.join(unknown_ids)}")
    return [by_id[profile_id] for profile_id in dict.fromkeys(selected_ids)]


def split_display_name(display_name: str) -> tuple[str, str]:
    name_parts = display_name.strip().split(maxsplit=1)
    if len(name_parts) != 2:
        raise ValueError(
            f"Demo display name must include first and last names: {display_name!r}"
        )
    return name_parts[0], name_parts[1]


def demo_address(profile_id: str) -> dict[str, str]:
    digest = hashlib.sha256(profile_id.encode("utf-8")).hexdigest()
    street_number = 100 + int(digest[:4], 16) % 800
    return {
        "street_number": str(street_number),
        "street_name": "SaveHaven Demo Way",
        "city": "Arlington",
        "state": "VA",
        "zip": "22201",
    }


def cents_to_nessie_dollars(cents: int) -> int:
    """Convert fixture cents to the whole-dollar integer required by Nessie v1."""
    dollars = Decimal(cents) / Decimal(100)
    return int(dollars.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def account_opening_balance(profile: FixtureProfile, account: FixtureAccount) -> int:
    final_balance = cents_to_nessie_dollars(account.balance_cents)
    net_history = sum(
        cents_to_nessie_dollars(transaction.signed_amount_cents)
        for transaction in profile.transactions
        if transaction.source_account_id == account.source_account_id
    )
    return final_balance - net_history


def account_type_for_nessie(account_type: str) -> str:
    normalized = account_type.strip().lower().replace("_", " ").replace("-", " ")
    account_types = {
        "checking": "Checking",
        "savings": "Savings",
        "credit card": "Credit Card",
    }
    try:
        return account_types[normalized]
    except KeyError as error:
        raise ValueError(f"Unsupported Nessie account type: {account_type}") from error


def object_id(resource: dict[str, Any]) -> str:
    return str(resource.get("_id") or resource.get("id") or "")


def customer_matches(customer: dict[str, Any], payload: dict[str, Any]) -> bool:
    customer_address = customer.get("address")
    return (
        customer.get("first_name") == payload["first_name"]
        and customer.get("last_name") == payload["last_name"]
        and isinstance(customer_address, dict)
        and all(
            customer_address.get(field) == value
            for field, value in payload["address"].items()
        )
    )


def find_or_create_customer(
    client: NessieSeedClient, profile: FixtureProfile
) -> tuple[str, bool]:
    first_name, last_name = split_display_name(profile.display_name)
    payload = {
        "first_name": first_name,
        "last_name": last_name,
        "address": demo_address(profile.id),
    }
    before = client.get_list("customers")
    matches = [customer for customer in before if customer_matches(customer, payload)]
    if len(matches) == 1 and object_id(matches[0]):
        return object_id(matches[0]), False
    if len(matches) > 1:
        raise NessieSeedError(
            f"Multiple Nessie customers match profile {profile.id}; refusing to guess"
        )

    before_ids = {object_id(customer) for customer in before}
    client.post("customers", payload)
    after = client.get_list("customers")
    created = [
        customer
        for customer in after
        if object_id(customer) not in before_ids and customer_matches(customer, payload)
    ]
    if len(created) != 1 or not object_id(created[0]):
        raise NessieSeedError(
            f"Could not uniquely resolve the Nessie customer created for {profile.id}"
        )
    return object_id(created[0]), True


def account_matches(account: dict[str, Any], payload: dict[str, Any]) -> bool:
    return account.get("type") == payload["type"] and account.get("nickname") == payload[
        "nickname"
    ]


def find_or_create_account(
    client: NessieSeedClient,
    *,
    customer_id: str,
    profile: FixtureProfile,
    account: FixtureAccount,
) -> tuple[str, bool]:
    payload = {
        "type": account_type_for_nessie(account.account_type),
        "nickname": account.nickname,
        "rewards": 0,
        "balance": account_opening_balance(profile, account),
    }
    path = f"customers/{customer_id}/accounts"
    before = client.get_list(path)
    matches = [candidate for candidate in before if account_matches(candidate, payload)]
    if len(matches) == 1 and object_id(matches[0]):
        return object_id(matches[0]), False
    if len(matches) > 1:
        raise NessieSeedError(
            f"Multiple Nessie accounts match {profile.id}/{account.source_account_id}"
        )

    before_ids = {object_id(candidate) for candidate in before}
    client.post(path, payload)
    after = client.get_list(path)
    created = [
        candidate
        for candidate in after
        if object_id(candidate) not in before_ids and account_matches(candidate, payload)
    ]
    if len(created) != 1 or not object_id(created[0]):
        raise NessieSeedError(
            f"Could not uniquely resolve account {profile.id}/{account.source_account_id}"
        )
    return object_id(created[0]), True


def transaction_marker(transaction: FixtureTransaction) -> str:
    return f"[savehaven:{transaction.source_id}]"


def transaction_description(transaction: FixtureTransaction) -> str:
    return format_seed_description(
        source_id=transaction.source_id,
        kind=transaction.kind,
        category=transaction.category,
        merchant_name=transaction.merchant_name,
        description=transaction.description or transaction.kind,
    )


def seed_transactions(
    client: NessieSeedClient,
    *,
    account_id: str,
    transactions: list[FixtureTransaction],
) -> tuple[int, int]:
    existing_descriptions: set[str] = set()
    for resource in ("deposits", "withdrawals"):
        existing_descriptions.update(
            str(record.get("description") or "")
            for record in client.get_list(f"accounts/{account_id}/{resource}")
        )

    created_count = 0
    reused_count = 0
    for transaction in sorted(transactions, key=lambda item: (item.occurred_at, item.source_id)):
        marker = transaction_marker(transaction)
        if any(description.startswith(marker) for description in existing_descriptions):
            reused_count += 1
            continue

        resource = "deposits" if transaction.direction == "inflow" else "withdrawals"
        description = transaction_description(transaction)
        payload = {
            "medium": "balance",
            "transaction_date": transaction.occurred_at.isoformat(),
            "status": "completed",
            "amount": abs(cents_to_nessie_dollars(transaction.signed_amount_cents)),
            "description": description,
        }
        client.post(f"accounts/{account_id}/{resource}", payload)
        existing_descriptions.add(description)
        created_count += 1
    return created_count, reused_count


def print_plan(profiles: list[FixtureProfile]) -> None:
    print("Dry run: no Nessie requests will be made.\n")
    for profile in profiles:
        print(
            f"{profile.id}: {profile.display_name} - "
            f"{len(profile.accounts)} accounts, {len(profile.transactions)} transactions"
        )
        for account in profile.accounts:
            transaction_count = sum(
                transaction.source_account_id == account.source_account_id
                for transaction in profile.transactions
            )
            opening = account_opening_balance(profile, account)
            final_balance = cents_to_nessie_dollars(account.balance_cents)
            print(
                f"  {account.nickname}: {account_type_for_nessie(account.account_type)}, "
                f"opening ${opening:,}, target ${final_balance:,}, "
                f"{transaction_count} transactions"
            )
    print("\nNessie v1 accepts integer dollar amounts; fixture cents are rounded half-up.")
    print("Run again with --apply to create or resume these fictional profiles.")


def write_state(state_path: Path, profiles: dict[str, dict[str, Any]]) -> None:
    state_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated_at": datetime.now(UTC).isoformat(),
        "source_fixture": str(DEFAULT_FIXTURE_PATH.relative_to(REPOSITORY_ROOT)),
        "profiles": profiles,
    }
    temporary_path = state_path.with_suffix(state_path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(state_path)


def update_fixture_customer_ids(
    fixture_path: Path, profile_results: dict[str, dict[str, Any]]
) -> None:
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    for profile in payload.get("profiles", []):
        result = profile_results.get(profile.get("id"))
        if result:
            profile["customer_id"] = result["customer_id"]

    temporary_path = fixture_path.with_suffix(fixture_path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(fixture_path)


def apply_seed(
    *,
    profiles: list[FixtureProfile],
    settings: SeedSettings,
    state_path: Path,
) -> dict[str, dict[str, Any]]:
    if settings.nessie_api_key is None:
        raise ValueError(
            "NESSIE_API_KEY is required for --apply; set it in backend/.env or the environment"
        )

    results: dict[str, dict[str, Any]] = {}
    client = NessieSeedClient(
        api_key=settings.nessie_api_key.get_secret_value(),
        base_url=settings.nessie_base_url,
        timeout_seconds=settings.nessie_timeout_seconds,
    )
    try:
        for profile in profiles:
            customer_id, customer_created = find_or_create_customer(client, profile)
            account_ids: dict[str, str] = {}
            accounts_created = 0
            transactions_created = 0
            transactions_reused = 0

            for account in profile.accounts:
                account_id, account_created = find_or_create_account(
                    client,
                    customer_id=customer_id,
                    profile=profile,
                    account=account,
                )
                account_ids[account.source_account_id] = account_id
                accounts_created += int(account_created)

                account_transactions = [
                    transaction
                    for transaction in profile.transactions
                    if transaction.source_account_id == account.source_account_id
                ]
                created, reused = seed_transactions(
                    client,
                    account_id=account_id,
                    transactions=account_transactions,
                )
                transactions_created += created
                transactions_reused += reused

            results[profile.id] = {
                "customer_id": customer_id,
                "account_ids": account_ids,
            }
            write_state(state_path, results)
            customer_action = "created" if customer_created else "reused"
            print(
                f"{profile.id}: customer {customer_action}; "
                f"{accounts_created} accounts created; "
                f"{transactions_created} transactions created; "
                f"{transactions_reused} transactions reused"
            )
    finally:
        client.close()

    return results


def main() -> int:
    args = parse_args()
    try:
        fixture_path = args.fixture.resolve()
        profiles = load_profiles(fixture_path, args.profile_ids)
        if not args.apply:
            if args.update_fixture_ids:
                raise ValueError("--update-fixture-ids requires --apply")
            print_plan(profiles)
            return 0

        results = apply_seed(
            profiles=profiles,
            settings=SeedSettings(),
            state_path=args.state_output.resolve(),
        )
        if args.update_fixture_ids:
            update_fixture_customer_ids(fixture_path, results)
            print(f"Updated customer IDs in {fixture_path}")
        print(f"Wrote Nessie ID mapping to {args.state_output.resolve()}")
        return 0
    except (OSError, ValueError, NessieSeedError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
