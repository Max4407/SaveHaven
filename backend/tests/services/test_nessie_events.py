from collections import defaultdict

import pytest

from config import Settings
from database import Database
from integrations.nessie import FixtureProfileStore, NessieRequestError
from repository import seed_demo_users
from schemas import NessieEventRequest
from services import (
    BankConnectionNotFoundError,
    BankSyncService,
    NessieEventError,
    NessieEventService,
)


class FakeNessieClient:
    def __init__(self) -> None:
        self.records: defaultdict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
        self.fail_resource: str | None = None
        self.deleted: list[str] = []

    def list_account_records(self, *, account_id: str, resource: str):
        return list(self.records[(account_id, resource)])

    def create_account_record(self, *, account_id: str, resource: str, payload):
        if resource == self.fail_resource:
            raise NessieRequestError("injected failure")
        record = {"_id": f"record-{len(self.records[(account_id, resource)]) + 1}", **payload}
        self.records[(account_id, resource)].append(record)
        return record

    def delete_account_record(self, *, resource: str, record_id: str):
        self.deleted.append(record_id)
        for key, records in self.records.items():
            if key[1] == resource:
                self.records[key] = [record for record in records if record.get("_id") != record_id]


class NoopSync:
    def sync_existing(self, session, *, user_id: str):
        return None


def setup_service():
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite:///:memory:",
        session_secret="test-only-session-secret",
        nessie_data_mode="fixture",
    )
    database = Database(settings.database_url)
    database.create_schema()
    fixture_store = FixtureProfileStore(settings.nessie_fixture_path)
    with database.session_factory() as session:
        seed_demo_users(session)
        connection = BankSyncService(
            settings=settings,
            fixture_store=fixture_store,
            nessie_client=None,
        ).connect(session, user_id="demo-player", profile_id="steady-paycheck")
        connection.data_source = "live"
        session.commit()
    client = FakeNessieClient()
    service = NessieEventService(client=client, bank_sync=NoopSync())  # type: ignore[arg-type]
    return database, client, service


def test_transfer_retry_is_idempotent_and_completes_only_missing_side() -> None:
    database, client, service = setup_service()
    request = NessieEventRequest(
        event_type="move_to_savings",
        amount_cents=20_000,
        idempotency_key="transfer-demo-001",
    )

    with database.session_factory() as session:
        first = service.run(session, user_id="demo-player", event=request)
        second = service.run(session, user_id="demo-player", event=request)

    assert first.created_records == ["checking withdrawal", "savings deposit"]
    assert second.created_records == []
    assert second.reused_records == ["checking withdrawal", "savings deposit"]
    assert sum(len(records) for records in client.records.values()) == 2


def test_partial_transfer_recovery_creates_only_the_missing_deposit() -> None:
    database, client, service = setup_service()
    request = NessieEventRequest(
        event_type="move_to_savings",
        amount_cents=20_000,
        idempotency_key="partial-demo-001",
    )
    marker = "[savehaven-demo:partial-demo-001]"
    client.records[("jordan-checking", "withdrawals")].append(
        {"description": f"{marker} existing withdrawal"}
    )

    with database.session_factory() as session:
        result = service.run(session, user_id="demo-player", event=request)

    assert result.reused_records == ["checking withdrawal"]
    assert result.created_records == ["savings deposit"]


def test_partial_transfer_failure_compensates_created_remote_records() -> None:
    database, client, service = setup_service()
    client.fail_resource = "deposits"
    request = NessieEventRequest(
        event_type="move_to_savings",
        amount_cents=20_000,
        idempotency_key="failed-transfer-001",
    )

    with (
        database.session_factory() as session,
        pytest.raises(NessieEventError),
    ):
        service.run(session, user_id="demo-player", event=request)

    assert client.deleted == ["record-1"]
    assert sum(len(records) for records in client.records.values()) == 0


def test_lab_event_cannot_use_another_users_connection() -> None:
    database, _client, service = setup_service()
    request = NessieEventRequest(
        event_type="paycheck",
        amount_cents=185_000,
        idempotency_key="cross-user-demo-001",
    )

    with database.session_factory() as session, pytest.raises(BankConnectionNotFoundError):
        service.run(session, user_id="demo-reviewer", event=request)

