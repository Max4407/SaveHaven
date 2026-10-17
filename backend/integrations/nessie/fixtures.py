import json
from datetime import date
from pathlib import Path

from pydantic import BaseModel

from schemas import (
    DemoProfileResponse,
    FinancialSnapshot,
    SnapshotAccount,
    SnapshotTransaction,
)


class FixtureProfile(BaseModel):
    id: str
    display_name: str
    description: str
    income_pattern: str
    customer_id: str
    as_of: date
    accounts: list[SnapshotAccount]
    transactions: list[SnapshotTransaction]


class FixtureFile(BaseModel):
    profiles: list[FixtureProfile]


class FixtureProfileStore:
    def __init__(self, fixture_path: Path) -> None:
        self.fixture_path = fixture_path
        self._profiles = self._load_profiles()

    def _load_profiles(self) -> dict[str, FixtureProfile]:
        with self.fixture_path.open(encoding="utf-8") as fixture_file:
            payload = json.load(fixture_file)
        profiles = FixtureFile.model_validate(payload).profiles
        return {profile.id: profile for profile in profiles}

    def list_profiles(self) -> list[DemoProfileResponse]:
        return [
            DemoProfileResponse(
                id=profile.id,
                display_name=profile.display_name,
                description=profile.description,
                income_pattern=profile.income_pattern,
            )
            for profile in self._profiles.values()
        ]

    def get_profile(self, profile_id: str) -> FixtureProfile | None:
        return self._profiles.get(profile_id)

    def get_snapshot(self, profile_id: str) -> FinancialSnapshot | None:
        profile = self.get_profile(profile_id)
        if profile is None:
            return None
        return FinancialSnapshot(
            profile_id=profile.id,
            customer_id=profile.customer_id,
            customer_display_name=profile.display_name,
            as_of=profile.as_of,
            accounts=profile.accounts,
            transactions=profile.transactions,
        )
