## routers

FastAPI route modules live here.

Routers should define request/response boundaries, validation, authorization checks, and calls into `services/`. Keep domain logic in services where possible.

High-priority large router files for future slimming:

- `container_runtime_router.py` should be split by runtime logs/actions, file/config operations, and network injection endpoints.
- `ws_router.py` should be split by WebSocket channel and connection lifecycle concerns.

Before changing a route, read this README, the target router, and the service module it delegates to.
