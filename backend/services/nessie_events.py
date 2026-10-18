from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from integrations.nessie import NessieClient, NessieRequestError
from integrations.nessie.description_metadata import format_demo_description
from repository import get_bank_connection, list_accounts
from schemas import NessieEventRequest, NessieEventResponse, NessieRecordReference
from services.bank_sync import BankConnectionNotFoundError, BankSyncError, BankSyncService
from services.dashboard import build_dashboard


class NessieEventError(RuntimeError):
    pass


@dataclass(frozen=True)
class NessieOperation:
    label: str
    account_id: str
    resource: str
    payload: dict[str, Any]


class NessieEventService:
    def __init__(self, *, client: NessieClient | None, bank_sync: BankSyncService) -> None:
        self.client = client
        self.bank_sync = bank_sync

    def run(
        self,
        session: Session,
        *,
        user_id: str,
        event: NessieEventRequest,
    ) -> NessieEventResponse:
        connection = get_bank_connection(session, user_id)
        if connection is None:
            raise BankConnectionNotFoundError(user_id)
        if connection.data_source != "live" or self.client is None:
            raise NessieEventError("Nessie Lab requires an active live Nessie connection")

        accounts = list_accounts(session, user_id)
        account_ids = {account.account_type: account.source_account_id for account in accounts}
        if "checking" not in account_ids:
            raise NessieEventError("The connected profile has no checking account")
        if event.event_type == "move_to_savings" and "savings" not in account_ids:
            raise NessieEventError("The connected profile has no savings account")

        operations = self._operations(event, account_ids)
        marker = f"[savehaven-demo:{event.idempotency_key}]"
        created: list[str] = []
        reused: list[str] = []
        remote_records: list[NessieRecordReference] = []
        created_remote_records: list[NessieRecordReference] = []
        try:
            for operation in operations:
                existing = self.client.list_account_records(
                    account_id=operation.account_id,
                    resource=operation.resource,
                )
                matching = next(
                    (
                        record
                        for record in existing
                        if str(record.get("description") or "").startswith(marker)
                    ),
                    None,
                )
                if matching is not None:
                    reused.append(operation.label)
                    remote_id = str(matching.get("_id") or matching.get("id") or "")
                    if remote_id:
                        remote_records.append(
                            NessieRecordReference(
                                resource=operation.resource,  # type: ignore[arg-type]
                                record_id=remote_id,
                            )
                        )
                    continue
                created_record = self.client.create_account_record(
                    account_id=operation.account_id,
                    resource=operation.resource,
                    payload=operation.payload,
                )
                created.append(operation.label)
                remote_id = str(
                    created_record.get("_id")
                    or created_record.get("id")
                    or (created_record.get("objectCreated") or {}).get("_id")
                    or ""
                )
                if remote_id:
                    reference = NessieRecordReference(
                        resource=operation.resource,  # type: ignore[arg-type]
                        record_id=remote_id,
                    )
                    remote_records.append(reference)
                    created_remote_records.append(reference)
        except NessieRequestError as error:
            for reference in reversed(created_remote_records):
                try:
                    self.client.delete_account_record(
                        resource=reference.resource,
                        record_id=reference.record_id,
                    )
                except NessieRequestError:
                    pass
            raise NessieEventError("Nessie rejected the sandbox event") from error

        synced_connection = self.bank_sync.sync_existing(session, user_id=user_id)
        if synced_connection is not None and synced_connection.data_source != "live":
            raise BankSyncError(
                "The event was written, but the live Nessie resync failed. Retry with the same "
                "idempotency key."
            )
        return NessieEventResponse(
            event_type=event.event_type,
            idempotency_key=event.idempotency_key,
            created_records=created,
            reused_records=reused,
            remote_records=remote_records,
            dashboard=build_dashboard(session, user_id=user_id),
        )

    def _operations(
        self, event: NessieEventRequest, account_ids: dict[str, str]
    ) -> list[NessieOperation]:
        amount = event.amount_cents // 100
        checking = account_ids["checking"]
        if event.event_type == "paycheck":
            return [
                self._operation(
                    label="paycheck deposit",
                    account_id=checking,
                    resource="deposits",
                    event=event,
                    amount=amount,
                    kind="deposit",
                    category="income",
                    plan_status="neutral",
                    merchant="Northstar Studio",
                    description="Demo paycheck",
                )
            ]
        if event.event_type == "recurring_bill":
            return [
                self._operation(
                    label="recurring bill",
                    account_id=checking,
                    resource="withdrawals",
                    event=event,
                    amount=amount,
                    kind="bill",
                    category="housing",
                    plan_status="planned",
                    merchant="Recurring Bills",
                    description="Simulated recurring weekly bills",
                )
            ]
        if event.event_type in {"planned_purchase", "unplanned_purchase"}:
            planned = event.event_type == "planned_purchase"
            return [
                self._operation(
                    label="planned purchase" if planned else "unplanned purchase",
                    account_id=checking,
                    resource="withdrawals",
                    event=event,
                    amount=amount,
                    kind="purchase",
                    category="groceries" if planned else "discretionary",
                    plan_status="planned" if planned else "unplanned",
                    merchant="Fresh Basket" if planned else "Impulse Electronics",
                    description=(
                        "Planned weekly purchase"
                        if planned
                        else "Unplanned discretionary purchase"
                    ),
                )
            ]
        return [
            self._operation(
                label="checking withdrawal",
                account_id=checking,
                resource="withdrawals",
                event=event,
                amount=amount,
                kind="transfer",
                category="savings",
                plan_status="planned",
                merchant="Goal Savings",
                description="Weekly savings transfer",
            ),
            self._operation(
                label="savings deposit",
                account_id=account_ids["savings"],
                resource="deposits",
                event=event,
                amount=amount,
                kind="transfer",
                category="savings",
                plan_status="planned",
                merchant="Checking",
                description="Weekly savings transfer",
            ),
        ]

    def _operation(
        self,
        *,
        label: str,
        account_id: str,
        resource: str,
        event: NessieEventRequest,
        amount: int,
        kind: str,
        category: str,
        plan_status: str,
        merchant: str,
        description: str,
    ) -> NessieOperation:
        encoded = format_demo_description(
            event_id=event.idempotency_key,
            kind=kind,
            category=category,
            plan_status=plan_status,
            merchant_name=merchant,
            description=description,
        )
        return NessieOperation(
            label=label,
            account_id=account_id,
            resource=resource,
            payload={
                "medium": "balance",
                "transaction_date": (event.occurred_at or date.today()).isoformat(),
                "status": "completed",
                "amount": amount,
                "description": encoded,
            },
        )
