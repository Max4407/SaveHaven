from fastapi import APIRouter, Request

router = APIRouter(tags=["health"])


@router.get("/health")
def health(request: Request) -> dict[str, str | bool]:
    settings = request.app.state.settings
    return {
        "status": "ok",
        "data_mode": settings.nessie_data_mode,
        "nessie_configured": settings.nessie_api_key is not None,
    }
