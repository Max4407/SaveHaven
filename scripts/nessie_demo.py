"""Run deterministic SaveHaven demo events against seeded Nessie profiles."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from integrations.nessie.description_metadata import format_demo_description
from seed_nessie_profiles import (
    DEFAULT_FIXTURE_PATH,
    DEFAULT_STATE_PATH,
    FixtureProfile,
    NessieSeedClient,
    NessieSeedError,
    SeedSettings,
    cents_to_nessie_dollars,
    load_profiles,
)

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DEMO_STATE_PATH = (
    REPOSITORY_ROOT / "data" / "fixtures" / "nessie_demo_state.local.json"
)


@dataclass(frozen=True)
class DemoOperation:
    label: str
    account_id: str
    resource: str
    payload: dict[str, Any]

    @property
    def path(self) -> str:
        return f"accounts/{self.account_id}/{self.resource}"


def positive_integer(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be a whole number") from error
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be greater than zero")
    return parsed


def common_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument(
        "--profile",
        required=True,
        metavar="PROFILE_ID",
        help="Fixture profile to change, such as steady-paycheck.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Perform the local or remote write. Without it, print a dry run.",
    )
    parser.add_argument(
        "--fixture",
        type=Path,
        default=DEFAULT_FIXTURE_PATH,
        help=f"Profile fixture path (default: {DEFAULT_FIXTURE_PATH}).",
    )
    parser.add_argument(
        "--seed-state",
        type=Path,
        default=DEFAULT_STATE_PATH,
        help=f"Nessie ID mapping from the seed script (default: {DEFAULT_STATE_PATH}).",
    )
    parser.add_argument(
        "--demo-state",
        type=Path,
        default=DEFAULT_DEMO_STATE_PATH,
        help=f"Local demo clock state (default: {DEFAULT_DEMO_STATE_PATH}).",
    )
    return parser


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Advance the demo clock or add fictional activity to Nessie."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    common = common_parser()

    advance = subparsers.add_parser(
        "advance-week",
        parents=[common],
        help="Advance the selected profile's local demo date.",
    )
    advance.add_argument(
        "--weeks",
        type=positive_integer,
        default=1,
        help="Number of seven-day periods to advance (default: 1).",
    )

    planned = subparsers.add_parser(
        "planned-purchase",
        parents=[common],
        help="Create a purchase intended to fit the spending plan.",
    )
    planned.add_argument("--amount", type=positive_integer, default=45)
    planned.add_argument("--merchant", default="Fresh Basket")
    planned.add_argument("--category", default="groceries")
    planned.add_argument("--description", default="Planned weekly purchase")

    unplanned = subparsers.add_parser(
        "unplanned-purchase",
        parents=[common],
        help="Create a larger discretionary purchase intended to exceed the plan.",
    )
    unplanned.add_argument("--amount", type=positive_integer, default=150)
    unplanned.add_argument("--merchant", default="Impulse Electronics")
    unplanned.add_argument("--category", default="discretionary")
    unplanned.add_argument("--description", default="Unplanned discretionary purchase")

    savings = subparsers.add_parser(
        "move-to-savings",
        parents=[common],
        help="Create matching checking withdrawal and savings deposit records.",
    )
    savings.add_argument("--amount", type=positive_integer, default=200)
    savings.add_argument("--description", default="Weekly savings transfer")

    paycheck = subparsers.add_parser(
        "paycheck",
        parents=[common],
        help="Create a paycheck deposit in checking.",
    )
    paycheck.add_argument(
        "--amount",
        type=positive_integer,
        help="Whole-dollar amount; defaults to the profile's latest fixture income.",
    )
    paycheck.add_argument(
        "--employer",
        help="Employer label; defaults to the latest fixture income source.",
    )
    paycheck.add_argument("--description", default="Demo paycheck")

    return parser


def parse_args(default_command: str | None, arguments: list[str] | None) -> argparse.Namespace:
    arguments = list(sys.argv[1:] if arguments is None else arguments)
    if default_command is not None:
        arguments.insert(0, default_command)
    return build_parser().parse_args(arguments)


def load_profile(fixture_path: Path, profile_id: str) -> FixtureProfile:
    return load_profiles(fixture_path, [profile_id])[0]


def load_json_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as source_file:
        payload = json.load(source_file)
    if not isinstance(payload, dict):
        raise TypeError(f"Expected a JSON object in {path}")
    return payload


def load_account_ids(
    *,
    state_path: Path,
    profile: FixtureProfile,
    required: bool,
) -> dict[str, str]:
    state = load_json_object(state_path)
    profile_state = state.get("profiles", {}).get(profile.id, {})
    account_ids = profile_state.get("account_ids", {})
    if isinstance(account_ids, dict) and account_ids:
        return {str(source_id): str(nessie_id) for source_id, nessie_id in account_ids.items()}
    if required:
        raise ValueError(
            f"No Nessie account mapping exists for {profile.id} in {state_path}. "
            "Run seed_nessie_profiles.py --apply first."
        )
    return {
        account.source_account_id: f"<nessie-id-for-{account.source_account_id}>"
        for account in profile.accounts
    }


def load_profile_clock(
    state: dict[str, Any], profile: FixtureProfile
) -> tuple[date, int]:
    profile_state = state.get("profiles", {}).get(profile.id, {})
    current_date = date.fromisoformat(profile_state.get("current_date", profile.as_of.isoformat()))
    next_event_number = int(profile_state.get("next_event_number", 1))
    if next_event_number < 1:
        raise ValueError("next_event_number must be at least 1")
    return current_date, next_event_number


def write_profile_clock(
    *,
    state_path: Path,
    state: dict[str, Any],
    profile_id: str,
    current_date: date,
    next_event_number: int,
) -> None:
    profiles = state.setdefault("profiles", {})
    if not isinstance(profiles, dict):
        raise TypeError(f"Invalid profiles object in {state_path}")
    profiles[profile_id] = {
        "current_date": current_date.isoformat(),
        "next_event_number": next_event_number,
    }
    state_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = state_path.with_suffix(state_path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(state_path)


def account_source_id(profile: FixtureProfile, account_type: str) -> str:
    matches = [
        account.source_account_id
        for account in profile.accounts
        if account.account_type.lower() == account_type
    ]
    if len(matches) != 1:
        raise ValueError(
            f"Profile {profile.id} must have exactly one {account_type} account; "
            f"found {len(matches)}"
        )
    return matches[0]


def account_id(
    profile: FixtureProfile, account_ids: dict[str, str], account_type: str
) -> str:
    source_id = account_source_id(profile, account_type)
    try:
        return account_ids[source_id]
    except KeyError as error:
        raise ValueError(f"Nessie mapping is missing account {source_id}") from error


def latest_paycheck(profile: FixtureProfile) -> tuple[int, str]:
    deposits = sorted(
        (
            transaction
            for transaction in profile.transactions
            if transaction.direction == "inflow"
        ),
        key=lambda transaction: (transaction.occurred_at, transaction.source_id),
        reverse=True,
    )
    if not deposits:
        raise ValueError(f"Profile {profile.id} has no fixture income for a paycheck default")
    latest = deposits[0]
    return (
        cents_to_nessie_dollars(latest.signed_amount_cents),
        latest.merchant_name or "Demo Employer",
    )


def transaction_payload(
    *,
    transaction_date: date,
    amount: int,
    description: str,
) -> dict[str, Any]:
    return {
        "medium": "balance",
        "transaction_date": transaction_date.isoformat(),
        "status": "completed",
        "amount": amount,
        "description": description,
    }


def build_operations(
    *,
    args: argparse.Namespace,
    profile: FixtureProfile,
    account_ids: dict[str, str],
    current_date: date,
    event_id: str,
) -> list[DemoOperation]:
    checking_id = account_id(profile, account_ids, "checking")

    if args.command in {"planned-purchase", "unplanned-purchase"}:
        plan_status = "planned" if args.command == "planned-purchase" else "unplanned"
        description = format_demo_description(
            event_id=event_id,
            kind="purchase",
            category=args.category,
            plan_status=plan_status,
            merchant_name=args.merchant,
            description=args.description,
        )
        return [
            DemoOperation(
                label=args.command,
                account_id=checking_id,
                resource="withdrawals",
                payload=transaction_payload(
                    transaction_date=current_date,
                    amount=args.amount,
                    description=description,
                ),
            )
        ]

    if args.command == "move-to-savings":
        savings_id = account_id(profile, account_ids, "savings")
        checking_description = format_demo_description(
            event_id=event_id,
            kind="transfer",
            category="savings",
            plan_status="planned",
            merchant_name="Goal Savings",
            description=args.description,
        )
        savings_description = format_demo_description(
            event_id=event_id,
            kind="transfer",
            category="savings",
            plan_status="planned",
            merchant_name="Checking",
            description=args.description,
        )
        return [
            DemoOperation(
                label="checking withdrawal",
                account_id=checking_id,
                resource="withdrawals",
                payload=transaction_payload(
                    transaction_date=current_date,
                    amount=args.amount,
                    description=checking_description,
                ),
            ),
            DemoOperation(
                label="savings deposit",
                account_id=savings_id,
                resource="deposits",
                payload=transaction_payload(
                    transaction_date=current_date,
                    amount=args.amount,
                    description=savings_description,
                ),
            ),
        ]

    if args.command == "paycheck":
        default_amount, default_employer = latest_paycheck(profile)
        description = format_demo_description(
            event_id=event_id,
            kind="deposit",
            category="income",
            plan_status="neutral",
            merchant_name=args.employer or default_employer,
            description=args.description,
        )
        return [
            DemoOperation(
                label="paycheck deposit",
                account_id=checking_id,
                resource="deposits",
                payload=transaction_payload(
                    transaction_date=current_date,
                    amount=args.amount or default_amount,
                    description=description,
                ),
            )
        ]

    raise ValueError(f"Unsupported demo command: {args.command}")


def print_operations(profile: FixtureProfile, current_date: date, operations: list[DemoOperation]) -> None:
    print(f"Dry run for {profile.id} on {current_date.isoformat()}: no Nessie writes will occur.")
    for operation in operations:
        print(
            f"  {operation.label}: POST /{operation.path} "
            f"${operation.payload['amount']:,} ({operation.payload['description']})"
        )
    print("Run again with --apply to create this fictional activity.")


def apply_operations(
    *,
    settings: SeedSettings,
    operations: list[DemoOperation],
    event_id: str,
) -> tuple[int, int]:
    if settings.nessie_api_key is None:
        raise ValueError(
            "NESSIE_API_KEY is required for --apply; set it in backend/.env or the environment"
        )

    marker = f"[savehaven-demo:{event_id}]"
    created = 0
    reused = 0
    client = NessieSeedClient(
        api_key=settings.nessie_api_key.get_secret_value(),
        base_url=settings.nessie_base_url,
        timeout_seconds=settings.nessie_timeout_seconds,
    )
    try:
        for operation in operations:
            records = client.get_list(operation.path)
            if any(str(record.get("description") or "").startswith(marker) for record in records):
                print(f"Reused existing {operation.label}")
                reused += 1
                continue
            client.post(operation.path, operation.payload)
            print(f"Created {operation.label}")
            created += 1
    finally:
        client.close()
    return created, reused


def run_advance_week(
    *,
    args: argparse.Namespace,
    profile: FixtureProfile,
    state_path: Path,
    state: dict[str, Any],
    current_date: date,
    next_event_number: int,
) -> int:
    advanced_date = current_date + timedelta(days=7 * args.weeks)
    if not args.apply:
        print(
            f"Dry run for {profile.id}: demo date would move from "
            f"{current_date.isoformat()} to {advanced_date.isoformat()}."
        )
        print("Run again with --apply to update the local demo clock.")
        return 0

    write_profile_clock(
        state_path=state_path,
        state=state,
        profile_id=profile.id,
        current_date=advanced_date,
        next_event_number=next_event_number,
    )
    print(
        f"Advanced {profile.id} demo date from {current_date.isoformat()} "
        f"to {advanced_date.isoformat()}."
    )
    print("Subsequent demo transactions will use the new date.")
    return 0


def main(
    default_command: str | None = None,
    arguments: list[str] | None = None,
) -> int:
    args = parse_args(default_command, arguments)
    try:
        fixture_path = args.fixture.resolve()
        state_path = args.demo_state.resolve()
        profile = load_profile(fixture_path, args.profile)
        demo_state = load_json_object(state_path)
        current_date, next_event_number = load_profile_clock(demo_state, profile)

        if args.command == "advance-week":
            return run_advance_week(
                args=args,
                profile=profile,
                state_path=state_path,
                state=demo_state,
                current_date=current_date,
                next_event_number=next_event_number,
            )

        account_ids = load_account_ids(
            state_path=args.seed_state.resolve(),
            profile=profile,
            required=args.apply,
        )
        event_id = (
            f"{profile.id}-{current_date.strftime('%Y%m%d')}-"
            f"{next_event_number:04d}-{args.command}"
        )
        operations = build_operations(
            args=args,
            profile=profile,
            account_ids=account_ids,
            current_date=current_date,
            event_id=event_id,
        )
        if not args.apply:
            print_operations(profile, current_date, operations)
            return 0

        created, reused = apply_operations(
            settings=SeedSettings(),
            operations=operations,
            event_id=event_id,
        )
        write_profile_clock(
            state_path=state_path,
            state=demo_state,
            profile_id=profile.id,
            current_date=current_date,
            next_event_number=next_event_number + 1,
        )
        print(f"Demo event complete: {created} records created, {reused} records reused.")
        print("Sync the connected bank profile in SaveHaven to display the changes.")
        return 0
    except (OSError, TypeError, ValueError, NessieSeedError, json.JSONDecodeError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
