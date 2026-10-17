import pytest

from config import Settings
from database import Database
from integrations.nessie import FixtureProfileStore, NessieRequestError
from repository import list_transactions, seed_demo_users
from services import BankSyncError, BankSyncService


class UnavailableNessieClient:
    def fetch_snapshot(self, *, profile_id: str, customer_id: str) -> None:
        raise NessieRequestError("simulated Nessie outage")


def build_service(*, allow_fallback: bool) -> tuple[Database, BankSyncService]:
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite:///:memory:",
        session_secret="test-only-session-secret",
        nessie_api_key="test-only-key",
        nessie_data_mode="live",
        nessie_allow_fixture_fallback=allow_fallback,
    )
    database = Database(settings.database_url)
    database.create_schema()
    service = BankSyncService(
        settings=settings,
        fixture_store=FixtureProfileStore(settings.nessie_fixture_path),
        nessie_client=UnavailableNessieClient(),  # type: ignore[arg-type]
    )
    return database, service


def test_unavailable_nessie_uses_fixture_so_the_demo_can_continue() -> None:
    database, service = build_service(allow_fallback=True)

    with database.session_factory() as session:
        seed_demo_users(session)
        connection = service.connect(
            session,
            user_id="demo-player",
            profile_id="steady-paycheck",
        )

        assert connection.data_source == "fixture"
        assert len(list_transactions(session, "demo-player")) == 7


def test_disabled_fallback_surfaces_live_sync_failure() -> None:
    database, service = build_service(allow_fallback=False)

    with database.session_factory() as session:
        seed_demo_users(session)
        with pytest.raises(BankSyncError):
            service.connect(
                session,
                user_id="demo-player",
                profile_id="steady-paycheck",
            )
