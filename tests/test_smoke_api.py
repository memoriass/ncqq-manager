from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

import services.database as database
from main import app
from middleware.auth import get_current_user, require_admin
from middleware.rate_limiter import rate_limiter
from routers import (
    auth_router,
    container_public_router,
    container_runtime_router,
    image_router,
    node_router,
    operation_logs_router,
    user_router,
)


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


def test_cluster_config_masks_and_preserves_api_key_on_save(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    app.dependency_overrides[get_current_user] = lambda: {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    app.dependency_overrides[require_admin] = lambda: {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    updates: list[dict] = []

    class FakeConfig:
        values = {
            "api_key": "real-cluster-key",
            "docker_image": "repo/old:latest",
            "webui_base_port": 6000,
            "http_base_port": 3000,
            "ws_base_port": 3001,
            "data_dir": "data",
        }

        def get(self, key: str, default=None):
            return self.values.get(key, default)

        def update(self, data: dict):
            updates.append(data.copy())
            self.values.update(data)

    sync_calls: list[bool] = []
    logs: list[tuple[str, dict]] = []

    monkeypatch.setattr(node_router, "app_config", FakeConfig())
    monkeypatch.setattr(node_router.cluster_manager, "sync_local_node_key", lambda: sync_calls.append(True))
    monkeypatch.setattr(node_router.operation_logger, "info", lambda event, payload: logs.append((event, payload)))

    get_response = client.get("/api/cluster/config")
    assert get_response.status_code == 200
    config = get_response.json()["config"]
    assert config["api_key"] == "***"
    assert config["has_api_key"] is True

    save_response = client.post(
        "/api/cluster/config",
        json={"api_key": "***", "docker_image": "repo/new:latest"},
    )

    assert save_response.status_code == 200
    assert updates == [{"docker_image": "repo/new:latest"}]
    assert sync_calls == []
    assert logs[0][0] == "cluster_config_save"
    assert "real-cluster-key" not in str(logs[0][1])


def test_cluster_apikey_regeneration_returns_one_time_token(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    app.dependency_overrides[get_current_user] = lambda: {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    app.dependency_overrides[require_admin] = lambda: {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    values = {"api_key": "old-key"}
    set_calls: list[tuple[str, str]] = []
    sync_calls: list[bool] = []
    logs: list[tuple[str, dict]] = []

    class FakeConfig:
        def get(self, key: str, default=None):
            return values.get(key, default)

        def set(self, key: str, value):
            values[key] = value
            set_calls.append((key, value))

    monkeypatch.setattr(node_router, "app_config", FakeConfig())
    monkeypatch.setattr(node_router.cluster_manager, "sync_local_node_key", lambda: sync_calls.append(True))
    monkeypatch.setattr(node_router.operation_logger, "info", lambda event, payload: logs.append((event, payload)))

    response = client.put("/api/cluster/config/api-key")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert len(payload["apiKey"]) == 32
    assert payload["has_api_key"] is True
    assert set_calls == [("api_key", payload["apiKey"])]
    assert sync_calls == [True]
    assert logs[0][0] == "cluster_api_key_regenerate"
    assert payload["apiKey"] not in str(logs[0][1])


def test_node_create_generates_api_key_when_blank(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    admin_session = {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    app.dependency_overrides[get_current_user] = lambda: admin_session
    app.dependency_overrides[require_admin] = lambda: admin_session
    captured: dict[str, str] = {}
    logs: list[tuple[str, dict]] = []

    class FakeClusterManager:
        def add_node(self, node_id: str, name: str, address: str, api_key: str):
            captured.update(
                {
                    "node_id": node_id,
                    "name": name,
                    "address": address,
                    "api_key": api_key,
                }
            )

    monkeypatch.setattr(node_router, "cluster_manager", FakeClusterManager())
    monkeypatch.setattr(node_router.operation_logger, "info", lambda event, payload: logs.append((event, payload)))

    response = client.post(
        "/api/nodes",
        json={"name": "remote", "address": "127.0.0.1:8001", "api_key": ""},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert len(payload["api_key"]) == 32
    assert captured["api_key"] == payload["api_key"]
    assert captured["name"] == "remote"
    assert captured["address"] == "127.0.0.1:8001"
    assert logs[0][0] == "node_add"
    assert payload["api_key"] not in str(logs[0][1])


def test_admin_node_detail_ensures_api_key_for_edit_dialog(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    admin_session = {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    app.dependency_overrides[get_current_user] = lambda: admin_session
    app.dependency_overrides[require_admin] = lambda: admin_session

    class FakeClusterManager:
        def ensure_node_api_key(self, node_id: str):
            assert node_id == "node-1"
            return {
                "id": "node-1",
                "name": "remote",
                "address": "127.0.0.1:8001",
                "api_key": "node-secret",
            }

    monkeypatch.setattr(node_router, "cluster_manager", FakeClusterManager())

    response = client.get("/api/nodes/node-1")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["node"]["api_key"] == "node-secret"


def test_cluster_manager_creates_missing_local_node_with_real_api_key(
    monkeypatch: pytest.MonkeyPatch,
):
    import services.cluster_manager as cluster_manager_module
    import services.config as config_module
    from services.cluster_manager import ClusterManager

    rows: dict[str, dict] = {}

    class FakeConfig:
        values = {"api_key": "***"}

        def get(self, key: str, default=None):
            return self.values.get(key, default)

        def set(self, key: str, value):
            self.values[key] = value

    fake_config = FakeConfig()

    def fake_fetchone(sql: str, params: tuple):
        return rows.get(params[0])

    def fake_execute(sql: str, params: tuple):
        if sql.startswith("INSERT INTO nodes"):
            node_id, name, address, api_key = params
            rows[node_id] = {
                "id": node_id,
                "name": name,
                "address": address,
                "api_key": api_key,
            }
        elif sql.startswith("UPDATE nodes SET api_key"):
            api_key, node_id = params
            rows[node_id]["api_key"] = api_key

        class Cursor:
            rowcount = 1

        return Cursor()

    monkeypatch.setattr(config_module, "app_config", fake_config)
    monkeypatch.setattr(cluster_manager_module.db, "fetchone", fake_fetchone)
    monkeypatch.setattr(cluster_manager_module.db, "row_to_dict", lambda row: row.copy() if row else None)
    monkeypatch.setattr(cluster_manager_module.db, "execute", fake_execute)
    monkeypatch.setattr(cluster_manager_module.db, "commit", lambda: None)

    manager = ClusterManager("test-config")
    node = manager.ensure_node_api_key("local")

    assert node is not None
    assert node["id"] == "local"
    assert node["api_key"] != "***"
    assert len(node["api_key"]) == 32
    assert rows["local"]["api_key"] == node["api_key"]
    assert fake_config.values["api_key"] == node["api_key"]


def test_image_pull_stream_keeps_progress_detail_and_no_buffer_headers(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    admin_session = {
        "uuid": "admin",
        "userName": "admin",
        "permission": 10,
    }
    app.dependency_overrides[require_admin] = lambda: admin_session
    app.dependency_overrides[get_current_user] = lambda: admin_session
    logs: list[tuple[str, dict]] = []

    async def fake_pull_image_stream(image_name: str):
        assert image_name == "repo/test:latest"
        yield {
            "id": "layer-1",
            "status": "Downloading",
            "progress": "5.0 MB / 10.0 MB",
            "progressDetail": {"current": 5_000_000, "total": 10_000_000},
        }
        yield {
            "id": "layer-1",
            "status": "Pull complete",
            "progressDetail": {"current": 10_000_000, "total": 10_000_000},
        }

    monkeypatch.setattr(image_router.async_docker_manager, "pull_image_stream", fake_pull_image_stream)
    monkeypatch.setattr(image_router.operation_logger, "info", lambda event, payload: logs.append((event, payload)))

    response = client.post("/api/images/pull/stream", json={"image": "repo/test:latest"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"
    assert response.headers["x-accel-buffering"] == "no"
    events = [json.loads(line) for line in response.text.splitlines()]
    assert events[0]["status"] == "Downloading"
    assert events[0]["progressDetail"] == {"current": 5_000_000, "total": 10_000_000}
    assert events[-1] == {"event": "done", "ok": True, "image": "repo/test:latest"}
    assert logs[0][0] == "image_pull"


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
        for route in container_runtime_router.router.routes
        for method in getattr(route, "methods", set())
    }

    assert expected_routes <= actual_routes
