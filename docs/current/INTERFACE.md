# INTERFACE

Updated: 2025-02-14T00:00:00Z

- main.py
  - CSRFMiddleware.dispatch(request: Request, call_next) -> Response
- middleware/auth.py
  - _validate_token(token: str) -> Optional[dict]
  - get_current_user(request: Request) -> dict
  - validate_token_value(token: str) -> Optional[dict]
- routers/container_router.py
  - _parse_env_vars(env_vars: list[str]) -> dict[str, str]
  - api_create_container(req: CreateRequest, request: Request, session: dict) -> dict
  - api_container_action(name: str, action: ContainerAction, node_id: str, delete_data: bool, request: Request, session: dict) -> dict
  - class ContainerAction(str, Enum): start|stop|restart|pause|unpause|kill|delete
- routers/ws_router.py
  - _resolve_ws_token(ws: WebSocket) -> str
  - ws_events(ws: WebSocket)
  - ws_container_logs(ws: WebSocket, name: str, node_id: str)
- frontend/src/hooks/useWebSocket.ts
  - useWebSocket<T>(options: UseWSOptions) -> { data, connected, send }
- BotShepherd/app/web_api/web_server.py
  - WebServer.__init__(config_manager, database_manager, proxy_server, logger, port=5100, loop=None)
  - env: BOTSHEPHERD_SECRET_KEY required

