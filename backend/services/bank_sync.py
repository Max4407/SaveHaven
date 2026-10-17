from datetime import UTC, datetime

from sqlalchemy.orm import Session

from config import Settings
from integrations.nessie import FixtureProfileStore, NessieClient, NessieRequestError
from models import BankConnection
from repository import (
    get_bank_connection,
    replace_financial_snapshot,
    upsert_bank_connection,
)
from schemas import FinancialSnapshot


class ProfileNotFoundError(LookupError):
    pass


class BankConnectionNotFoundError(LookupError):
    pass


class BankSyncError(RuntimeError):
    pass


class BankSyncService:
    def __init__(
        self,
        *,
        settings: Settings,
        fixture_store: FixtureProfileStore,
        nessie_client: NessieClient | None,
    ) -> None:
        self.settings = settings
        self.fixture_store = fixture_store
        self.nessie_client = nessie_client

    def connect(self, session: Session, *, user_id: str, profile_id: str) -> BankConnection:
        profile = self.fixture_store.get_profile(profile_id)
        if profile is None:
            raise ProfileNotFoundError(profile_id)
        return self._sync_snapshot(
            session,
            user_id=user_id,
            profile_id=profile_id,
            customer_id=profile.customer_id,
        )

    def sync_existing(self, session: Session, *, user_id: str) -> BankConnection:
        connection = get_bank_connection(session, user_id)
        if connection is None:
            raise BankConnectionNotFoundError(user_id)
        return self._sync_snapshot(
            session,
            user_id=user_id,
            profile_id=connection.profile_id,
            customer_id=connection.nessie_customer_id,
        )

    def _sync_snapshot(
        self,
        session: Session,
        *,
        user_id: str,
        profile_id: str,
        customer_id: str,
    ) -> BankConnection:
        snapshot, data_source = self._load_snapshot(profile_id, customer_id)
        synced_at = datetime.now(UTC)
        connection = upsert_bank_connection(
            session,
            user_id=user_id,
            profile_id=profile_id,
            customer_id=snapshot.customer_id,
            display_name=snapshot.customer_display_name,
            data_source=data_source,
            synced_at=synced_at,
        )
        replace_financial_snapshot(
            session,
            user_id=user_id,
            snapshot=snapshot,
            synced_at=synced_at,
        )
        session.commit()
        return connection

    def _load_snapshot(
        self,
        profile_id: str,
        customer_id: str,
    ) -> tuple[FinancialSnapshot, str]:
        if self.settings.nessie_data_mode == "live" and self.nessie_client is not None:
            try:
                return (
                    self.nessie_client.fetch_snapshot(
                        profile_id=profile_id,
                        customer_id=customer_id,
                    ),
                    "live",
                )
            except NessieRequestError as error:
                if not self.settings.nessie_allow_fixture_fallback:
                    raise BankSyncError(
                        "Unable to synchronize the selected Nessie profile"
                    ) from error

        snapshot = self.fixture_store.get_snapshot(profile_id)
        if snapshot is None:
            raise ProfileNotFoundError(profile_id)
        return snapshot, "fixture"
