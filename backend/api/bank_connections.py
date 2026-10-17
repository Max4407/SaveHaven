from fastapi import APIRouter, HTTPException, Request, status

from auth import CurrentDemoUser
from database.dependencies import DatabaseSession
from models import BankConnection
from schemas import BankConnectionResponse, ConnectBankRequest
from services import (
    BankConnectionNotFoundError,
    BankSyncError,
    ProfileNotFoundError,
)

router = APIRouter(prefix="/api/bank-connections", tags=["bank connections"])


def connection_response(connection: BankConnection) -> BankConnectionResponse:
    return BankConnectionResponse(
        profile_id=connection.profile_id,
        nessie_customer_id=connection.nessie_customer_id,
        display_name=connection.display_name,
        data_source=connection.data_source,
        last_synced_at=connection.last_synced_at,
    )


@router.post("", response_model=BankConnectionResponse)
def connect_bank(
    payload: ConnectBankRequest,
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> BankConnectionResponse:
    try:
        connection = request.app.state.bank_sync_service.connect(
            session,
            user_id=user.id,
            profile_id=payload.profile_id,
        )
    except ProfileNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The selected demo profile does not exist",
        ) from error
    except BankSyncError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
    return connection_response(connection)


@router.post("/sync", response_model=BankConnectionResponse)
def sync_bank(
    request: Request,
    user: CurrentDemoUser,
    session: DatabaseSession,
) -> BankConnectionResponse:
    try:
        connection = request.app.state.bank_sync_service.sync_existing(
            session,
            user_id=user.id,
        )
    except BankConnectionNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Connect a demo bank before synchronizing",
        ) from error
    except BankSyncError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error
    return connection_response(connection)
