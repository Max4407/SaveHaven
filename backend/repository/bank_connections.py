from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import BankConnection


def get_bank_connection(session: Session, user_id: str) -> BankConnection | None:
    return session.scalar(select(BankConnection).where(BankConnection.user_id == user_id))


def upsert_bank_connection(
    session: Session,
    *,
    user_id: str,
    profile_id: str,
    customer_id: str,
    display_name: str,
    data_source: str,
    synced_at: datetime,
) -> BankConnection:
    connection = get_bank_connection(session, user_id)
    if connection is None:
        connection = BankConnection(
            user_id=user_id,
            profile_id=profile_id,
            nessie_customer_id=customer_id,
            display_name=display_name,
            data_source=data_source,
            created_at=synced_at,
            last_synced_at=synced_at,
        )
        session.add(connection)
    else:
        connection.profile_id = profile_id
        connection.nessie_customer_id = customer_id
        connection.display_name = display_name
        connection.data_source = data_source
        connection.last_synced_at = synced_at

    session.flush()
    return connection
