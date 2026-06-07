## services

Backend service modules live here.

These files own business logic, external process control, Docker orchestration, WebSocket integration, metrics, logging, and persistence helpers. Routers should call services instead of duplicating business logic.

High-priority large service files for future slimming:

- `botshepherd.py` should be split into process lifecycle, API client, config file operations, and log handling.
- `alert_manager.py` should be split by notification channel and rule evaluation.
- `docker_manager.py` / `docker_async.py` should keep Docker client concerns separate from container lifecycle policy.

Before changing a service, read this README, the target service file, and the router that calls it.
