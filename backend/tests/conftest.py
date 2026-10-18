from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from config import Settings
from main import create_app


@pytest.fixture
def client() -> Iterator[TestClient]:
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite:///:memory:",
        session_secret="test-only-session-secret",
        nessie_data_mode="fixture",
    )
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def logged_in_client(client: TestClient) -> TestClient:
    response = client.post(
        "/api/auth/demo-login",
        json={
            "email": "jordan.lee@savehaven.demo",
            "password": "savehaven-demo",
        },
    )
    assert response.status_code == 200
    return client
