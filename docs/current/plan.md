# Plan

Updated: 2025-02-14T00:00:00Z

## Intake
- retrieval.hit.1: routers/container_router.py:89 CreateRequest
- retrieval.hit.2: routers/container_router.py:171 api_create_container
- retrieval.hit.3: routers/container_router.py:296 api_container_action
- retrieval.hit.4: middleware/auth.py:53 _validate_token
- retrieval.hit.5: main.py:151 app.add_middleware(CORSMiddleware)
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- main.py:CSRFMiddleware.dispatch L163-L177 ~±2
- middleware/auth.py:_validate_token L53-L69 ~±28
- middleware/auth.py:get_current_user L72-L105 ~±8
- routers/container_router.py:CreateRequest L89-L100 ~±1
- routers/container_router.py:_parse_env_vars new helper near L127-L156 ~+20
- routers/container_router.py:api_create_container L235-L240 ~-4/+1
- routers/container_router.py:api_container_action L296-L336 ~±10
- routers/ws_router.py:_resolve_ws_token/ws_events/ws_container_logs L41-L97 ~-8
- frontend/src/hooks/useWebSocket.ts:connect L41-L91 ~-12
- BotShepherd/app/web_api/web_server.py:WebServer.__init__ L22-L37 ~±4
- docs/current/overview.md:new
- docs/current/plan.md:new
- docs/current/task.md:new
- docs/current/INTERFACE.md:new
- docs/current/TREE.md:new

## Constraints
- no_public_api_break_except_ws_query_token_removed: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- python-check: python -m py_compile main.py middleware/auth.py routers/container_router.py routers/ws_router.py
- frontend-build: npm run build
- diagnostics: IDE diagnostics on changed files

## Checkpoints
- cp1: main.py has no query_params.get("apikey") in CSRF middleware
- cp2: middleware/auth.py has no query API key channel and has permission refresh path
- cp3: routers/container_router.py validates env_vars and action enum
- cp4: frontend/src/hooks/useWebSocket.ts contains no ?token=
- cp5: routers/ws_router.py contains no Query(default="") token param
- cp6: BotShepherd/app/web_api/web_server.py contains no hardcoded secret_key

## Rollback
- command: git restore main.py middleware/auth.py routers/container_router.py routers/ws_router.py frontend/src/hooks/useWebSocket.ts BotShepherd/app/web_api/web_server.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md

