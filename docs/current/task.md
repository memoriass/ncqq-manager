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


- ts: 2025-02-14T00:05:00Z
  phase: schedule
  backlog:
    - batchA.backup_router: in_progress
    - batchA.operation_log_context: queued
    - batchA.user_router_audit: queued
    - batchA.node_router_audit: queued
    - batchB.operation_logs_query: queued
    - batchC.ws_manager: queued
    - batchC.scheduler: queued
- ts: 2025-02-14T00:06:00Z
  phase: implement
  target: routers/backup_router.py
  changes:
    - add PurePosixPath + BackgroundTask imports
    - add _ALLOWED_BACKUP_ROOTS and _CHUNK_SIZE
    - add _cleanup_file and _validate_zip_members helpers
    - backup download adds response background cleanup for tmp zip
    - backup upload switches from whole-file read to chunked temp-file write
    - backup upload validates zip roots and total uncompressed size before extractall
  evidence:
    - routers/backup_router.py:37-59 helper-functions
    - routers/backup_router.py:95-101 file-response-background-cleanup
    - routers/backup_router.py:129-169 chunked-upload-and-zip-validation
