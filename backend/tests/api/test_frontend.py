from pathlib import Path

from fastapi.testclient import TestClient

from config import Settings
from main import create_app


def build_client(frontend_dist_path: Path) -> TestClient:
    settings = Settings(
        _env_file=None,
        app_env="test",
        database_url="sqlite:///:memory:",
        session_secret="test-only-session-secret",
        nessie_data_mode="fixture",
        frontend_dist_path=frontend_dist_path,
    )
    return TestClient(create_app(settings))


def test_serves_built_frontend_and_supports_client_side_routes(tmp_path: Path) -> None:
    assets_path = tmp_path / "assets"
    assets_path.mkdir()
    (tmp_path / "index.html").write_text("<main>SaveHaven</main>", encoding="utf-8")
    (assets_path / "app.js").write_text("console.log('SaveHaven')", encoding="utf-8")

    with build_client(tmp_path) as client:
        root_response = client.get("/")
        route_response = client.get("/town")
        asset_response = client.get("/assets/app.js")

    assert root_response.status_code == 200
    assert root_response.text == "<main>SaveHaven</main>"
    assert route_response.status_code == 200
    assert route_response.text == "<main>SaveHaven</main>"
    assert asset_response.status_code == 200
    assert asset_response.text == "console.log('SaveHaven')"


def test_missing_assets_and_api_routes_do_not_fall_back_to_frontend(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<main>SaveHaven</main>", encoding="utf-8")

    with build_client(tmp_path) as client:
        missing_asset_response = client.get("/assets/missing.js")
        missing_api_response = client.get("/api/missing")

    assert missing_asset_response.status_code == 404
    assert missing_api_response.status_code == 404
    assert missing_api_response.headers["content-type"].startswith("application/json")


def test_api_routes_take_priority_over_frontend_fallback(tmp_path: Path) -> None:
    (tmp_path / "index.html").write_text("<main>SaveHaven</main>", encoding="utf-8")

    with build_client(tmp_path) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
