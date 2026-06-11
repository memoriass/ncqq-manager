from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import services.database as database
from main import app
from middleware.auth import require_admin
from middleware.rate_limiter import rate_limiter
from routers import auth_router, container_public_router, operation_logs_router, user_router


@pytest.fixture(autouse=True)
def isolate_fastapi_state():
    app.dependency_overrides.clear()
    rate_limiter._records.clear()
    yield
    app.dependency_overrides.clear()
    rate_limiter._records.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health_endpoint_keeps_release_contract(client: TestClient):
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] in {"ok", "degraded"}
    assert isinstance(payload["degraded_reasons"], list)
    assert isinstance(payload["docker"], bool)
    assert isinstance(payload["uptime"], (int, float))
    assert "state_engine" in payload
    assert "async_docker" in payload
    assert "metrics" in payload
    assert "botshepherd" in payload


def test_setup_status_uses_safe_defaults_without_real_database(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    settings = {
        "initialized": False,
        "data_dir": "",
        "port": 8000,
    }

    def fake_get(key: str, default=None):
        return settings.get(key, default)

    def fake_set(key: str, value):
        settings[key] = value

    monkeypatch.setattr(auth_router.app_config, "get", fake_get)
    monkeypatch.setattr(auth_router.app_config, "set", fake_set)
    monkeypatch.setattr(auth_router, "_get_local_ip", lambda: "127.0.0.1")
    monkeypatch.setattr(database, "fetchone", lambda *args, **kwargs: None)

    response = client.get("/api/setup/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "status": "ok",
        "initialized": False,
        "local_ip": "127.0.0.1",
        "default_data_dir": "",
        "default_port": 8000,
    }


def test_public_containers_returns_state_engine_snapshot(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        container_public_router.state_engine,
        "get_containers",
        lambda: [
            {
                "id": "abc123",
                "name": "napcat-test",
                "status": "running",
                "node_id": "local",
                "uin": "10001",
                "bot_online": True,
                "bot_heartbeat_ts": 123456,
                "bot_avatar": "/resource/avatar.jpg",
            }
        ],
    )

    response = client.get("/api/public/containers")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["containers"] == [
        {
            "id": "abc123",
            "name": "napcat-test",
            "status": "running",
            "node_id": "local",
            "uin": "10001",
            "bot_online": True,
            "bot_heartbeat_ts": 123456,
            "bot_avatar": "/resource/avatar.jpg",
        }
    ]


def test_public_container_page_delegates_to_instance_subsystem(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    captured = {}

    def fake_query(**kwargs):
        captured.update(kwargs)
        return {
            "status": "ok",
            "items": [],
            "total": 0,
            "page": kwargs["page"],
            "page_size": kwargs["page_size"],
        }

    monkeypatch.setattr(container_public_router.instance_subsystem, "query", fake_query)

    response = client.get("/api/public/containers/page?page=2&page_size=10&status=running&keyword=test")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert captured == {
        "status": "running",
        "keyword": "test",
        "page": 2,
        "page_size": 10,
    }


def test_operation_logs_query_is_admin_contract(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    app.dependency_overrides[require_admin] = lambda: {
        "uuid": "admin",
        "userName": "admin",
        "permission": 2,
    }

    def fake_get(**kwargs):
        assert kwargs["limit"] == 5
        assert kwargs["page"] == 2
        assert kwargs["operation_type"] == "container"
        return {
            "items": [
                {
                    "id": "log-1",
                    "type": "container",
                    "level": "info",
                    "message": "started",
                }
            ],
            "total": 1,
            "page": kwargs["page"],
            "limit": kwargs["limit"],
        }

    monkeypatch.setattr(operation_logs_router.operation_logger, "get", fake_get)

    response = client.get("/api/operation_logs?limit=5&page=2&type=container")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["total"] == 1
    assert payload["items"][0]["id"] == "log-1"


def test_user_apikey_regeneration_returns_one_time_token(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    app.dependency_overrides[require_admin] = lambda: {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    captured: dict[str, str] = {}
    logs: list[tuple[str, dict]] = []

    def fake_edit_user(user_uuid: str, **kwargs):
        captured["user_uuid"] = user_uuid
        captured.update(kwargs)
        return True

    monkeypatch.setattr(user_router.user_manager, "edit_user", fake_edit_user)
    monkeypatch.setattr(user_router.operation_logger, "info", lambda event, payload: logs.append((event, payload)))

    response = client.put("/api/users/test-user/apikey")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert len(payload["apiKey"]) == 32
    assert captured == {"user_uuid": "test-user", "apiKey": payload["apiKey"]}
    assert logs[0][0] == "user_regenerate_apikey"
    assert payload["apiKey"] not in str(logs[0][1])


def test_container_runtime_split_routes_stay_registered():
    expected_routes = {
        ("DELETE", "/api/containers/{name}/data"),
        ("POST", "/api/containers/{name}/recreate"),
        ("POST", "/api/containers/{name}/action"),
        ("GET", "/api/containers/{name}/stats"),
        ("GET", "/api/containers/{name}/logs"),
        ("GET", "/api/containers/{name}/logs/download"),
        ("GET", "/api/containers/{name}/qrcode"),
        ("POST", "/api/containers/{name}/refresh-login"),
        ("POST", "/api/internal/login-event"),
        ("POST", "/api/internal/heartbeat"),
        ("GET", "/api/containers/{name}/events"),
    }

    actual_routes = {
        (method, route.path)
        for route in app.routes
        for method in getattr(route, "methods", set())
    }

    assert expected_routes <= actual_routes
