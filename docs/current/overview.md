# Overview

Updated: 2025-02-14T00:00:00Z

## Goal
- scope: security-baseline-fixes-from-优化说明文档.md-latest-annotations
- modules: main.py,middleware/auth.py,routers/container_router.py,routers/ws_router.py,frontend/src/hooks/useWebSocket.ts,BotShepherd/app/web_api/web_server.py

## KPI
- cors_wildcard_with_credentials: 0
- api_key_query_channel: 0
- websocket_token_query_channel: 0
- session_permission_sync_window_seconds: <=300
- blocked_env_var_injection: enabled
- container_action_route_enum: enabled
- botshepherd_secret_key_hardcoded: 0

## Rollback
- python: git restore main.py middleware/auth.py routers/container_router.py routers/ws_router.py
- frontend: git restore frontend/src/hooks/useWebSocket.ts
- botshepherd: git restore BotShepherd/app/web_api/web_server.py
- docs: git restore docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md

