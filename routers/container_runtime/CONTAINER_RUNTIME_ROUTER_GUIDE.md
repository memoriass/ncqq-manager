## Container Runtime Router Guide

`routers/container_runtime/` contains the runtime route surface that used to live in `routers/container_runtime_router.py`. The old file remains as a compatibility entrypoint for `main.py`; new code should read this package by concern.

## Files

- `__init__.py`: creates the aggregate `router` and includes all runtime subrouters.
- `common.py`: shared request models, enum values, request ID/error helpers, container name/scope validation, data directory cleanup helpers, snapshot helpers, and memory-state cleanup helpers.
- `data_recreate.py`: `DELETE /api/containers/{name}/data` and `POST /api/containers/{name}/recreate`. This is the highest-risk runtime flow because it stops containers, clears local data, deletes/recreates Docker containers, allocates ports, and records operation logs.
- `actions.py`: `POST /api/containers/{name}/action`. This handles start/stop/restart/pause/unpause/kill/delete and best-effort cleanup when local containers are deleted.
- `status.py`: `GET /api/containers/{name}/stats`, logs, log download, QR code lookup, and login status refresh. It reads Docker, cluster, instance subsystem, and NapCat WS state but should avoid mutating durable data.
- `internal.py`: `POST /api/internal/login-event` and `POST /api/internal/heartbeat`. These endpoints are called by internal container-side integrations and require `x-internal-key`.
- `events.py`: `GET /api/containers/{name}/events` SSE stream for local Docker lifecycle events.

## Dependencies

- Permission checks come from `middleware.auth`.
- Rate limits come from `middleware.rate_limiter`.
- Local Docker operations use `services.docker_async.async_docker_manager`.
- Remote node operations use `services.cluster_manager.cluster_manager`.
- Runtime snapshots and push updates use `services.container_state.state_engine`.
- Operation audit entries use `services.operation_logger` and `services.operation_log_context`.
- Login/QR status is read from `services.instance_subsystem` and `services.napcat_ws_service`.

## Maintenance Rules

- Keep route paths unchanged unless frontend API clients are updated in the same change.
- Put shared helpers in `common.py` only when used by multiple runtime submodules.
- Keep destructive operations in `data_recreate.py` or `actions.py`; status and event modules should stay read-oriented.
- When a route adds or changes a response contract, update `frontend/src/services/api/containerApi.ts` or `publicApi.ts` and add a smoke/contract test.
