import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.auth import router as auth_router
from api.bank_connections import router as bank_connections_router
from api.dashboard import router as dashboard_router
from api.demo import router as demo_router
from api.health import router as health_router
from auth import SessionManager
from config import Settings, get_settings
from database import Database
from integrations.nessie import FixtureProfileStore, NessieClient
from repository import seed_demo_users
from services import BankSyncService


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    database = Database(resolved_settings.database_url)
    fixture_store = FixtureProfileStore(resolved_settings.nessie_fixture_path)
    session_secret = (
        resolved_settings.session_secret.get_secret_value()
        if resolved_settings.session_secret is not None
        else secrets.token_urlsafe(48)
    )
    nessie_client = _build_nessie_client(resolved_settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        database.create_schema()
        with database.session_factory() as session:
            seed_demo_users(session)
        yield
        if nessie_client is not None:
            nessie_client.close()

    app = FastAPI(title=resolved_settings.app_name, lifespan=lifespan)
    app.state.settings = resolved_settings
    app.state.database = database
    app.state.fixture_store = fixture_store
    app.state.session_manager = SessionManager(
        session_secret,
        resolved_settings.session_max_age_seconds,
    )
    app.state.bank_sync_service = BankSyncService(
        settings=resolved_settings,
        fixture_store=fixture_store,
        nessie_client=nessie_client,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[resolved_settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    app.include_router(auth_router)
    app.include_router(demo_router)
    app.include_router(bank_connections_router)
    app.include_router(dashboard_router)
    return app


def _build_nessie_client(settings: Settings) -> NessieClient | None:
    if settings.nessie_api_key is None:
        return None
    return NessieClient(
        api_key=settings.nessie_api_key.get_secret_value(),
        base_url=settings.nessie_base_url,
        timeout_seconds=settings.nessie_timeout_seconds,
    )


app = create_app()
