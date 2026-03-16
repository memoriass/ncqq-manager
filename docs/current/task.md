# Task Log

Updated: 2025-02-14T00:00:00Z

- ts: 2025-02-14T00:00:00Z
  phase: intake
  evidence:
    - docs/current/优化说明文档.md:929-952 batch-0-security-baseline
    - main.py:145-156 cors-origins-already-configured
    - middleware/auth.py:90-92 api-key-query-channel-present
    - frontend/src/hooks/useWebSocket.ts:51-55 ws-token-query-present
    - BotShepherd/app/web_api/web_server.py:34 hardcoded-secret-key
- ts: 2025-02-14T00:00:00Z
  phase: implement
  changes:
    - main.py:163-168 remove apikey query fallback from CSRFMiddleware
    - middleware/auth.py:15-18 add _PERMISSION_SYNC_INTERVAL
    - middleware/auth.py:53-97 add session permission/username refresh from users table
    - middleware/auth.py:72-105 remove request.query_params.get("apikey") auth channel
    - routers/container_router.py:30-50 add env validation constants and ContainerAction enum
    - routers/container_router.py:137-156 add _parse_env_vars
    - routers/container_router.py:272-274 create path uses _parse_env_vars
    - routers/container_router.py:329-372 action route uses ContainerAction
    - routers/ws_router.py:41-52 token source restricted to cookie only
    - routers/ws_router.py:87-94 logs websocket removes token query parameter
    - frontend/src/hooks/useWebSocket.ts:41-49 remove token query assembly
    - BotShepherd/app/web_api/web_server.py:31-38 secret key from env var
- ts: 2025-02-14T00:00:00Z
  phase: verify-pending
  commands:
    - python -m py_compile main.py middleware/auth.py routers/container_router.py routers/ws_router.py
    - cd frontend && npm run build
    - diagnostics changed files

