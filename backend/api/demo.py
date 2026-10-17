from fastapi import APIRouter, Request

from auth import CurrentDemoUser
from schemas import DemoProfileResponse

router = APIRouter(prefix="/api/demo", tags=["demo"])


@router.get("/nessie-profiles", response_model=list[DemoProfileResponse])
def list_nessie_profiles(
    request: Request,
    _user: CurrentDemoUser,
) -> list[DemoProfileResponse]:
    return request.app.state.fixture_store.list_profiles()
