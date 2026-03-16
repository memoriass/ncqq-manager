# Plan

Updated: 2026-03-16T22:20:33+08:00

## Intake
- retrieval.hit.1: docs/current/优化说明文档.md:135-148 container_router capability split recommendation
- retrieval.hit.2: routers/container_public_router.py:13-48 extracted public routes
- retrieval.hit.3: routers/container_config_router.py:17-85 extracted config/file routes
- retrieval.hit.4: routers/container_crud_router.py:31-143 extracted list/create/inject routes
- retrieval.hit.5: routers/container_runtime_router.py:28-147 extracted action/stats/logs/qrcode/refresh/internal routes
- retrieval.hit.6: main.py:24-27 split router imports
- retrieval.hit.7: main.py:190-193 split router registrations
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- routers/container_public_router.py:api_public_containers/api_batch_qr_status/api_paged_containers L1-L50 ~±50
- routers/container_config_router.py:ConfigRequest/_safe_path/read_container_config/save_container_config/list_container_files L1-L87 ~±87
- routers/container_crud_router.py:CreateRequest/_parse_env_vars/_generate_onebot11_config_with_ws_client/api_list_containers/api_create_container/api_inject_ws_client L1-L145 ~±145
- routers/container_runtime_router.py:ContainerAction/api_container_action/get_container_stats/get_container_logs/download_container_logs/get_qr_code/refresh_login_status/receive_login_event L1-L149 ~±149
- main.py:container router imports + include_router registration L24-L27,L190-L193 ~±8
- docs/current/overview.md:update sections
- docs/current/plan.md:replace latest effective plan
- docs/current/task.md:append container-router-split completion records
- docs/current/INTERFACE.md:update container split signatures
- docs/current/TREE.md:refresh timestamp and new router paths
- docs/current/优化说明文档.md:update batchC container split completion line

## Constraints
- no_public_api_break: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- python-check-container-routers: python -m py_compile main.py routers/container_public_router.py routers/container_config_router.py routers/container_crud_router.py routers/container_runtime_router.py
- diagnostics: IDE diagnostics on main.py, routers/container_public_router.py, routers/container_config_router.py, routers/container_crud_router.py, routers/container_runtime_router.py
- timestamp: Get-Date -Format o

## RemainingQueue
- batchA.backup_router: completed and documented
- batchA.operation_log_context: completed and documented
- batchA.user_router_audit: completed and documented
- batchA.node_router_audit: completed and documented
- batchB.operation_logs_query: completed and documented
- batchC.ws_manager: completed and documented
- batchC.scheduler: completed and documented
- batchC.config_reload: completed and documented
- batchC.frontend_split: completed and documented
- batchD.container_router_split: completed public/config/crud/runtime extraction and main registration switch
- next.queue: observe runtime stability and keep docker sync/async convergence as independent long-term task

## Checkpoints
- cp1: /api/public/containers, /api/public/qr/batch, /api/public/containers/page served by routers/container_public_router.py
- cp2: /api/containers/{name}/config/{filename:path} read/write and /api/containers/{name}/files served by routers/container_config_router.py
- cp3: /api/containers and /api/containers/{name}/inject-ws-client served by routers/container_crud_router.py
- cp4: /api/containers/{name}/action|stats|logs|logs/download|qrcode|refresh-login and /api/internal/login-event served by routers/container_runtime_router.py
- cp5: main.py registers container_public_router/container_config_router/container_crud_router/container_runtime_router and no longer references container_router
- cp6: legacy routers/container_router.py is absent from workspace
- cp7: py_compile and diagnostics must both stay green

## Rollback
- command: git restore main.py routers/container_public_router.py routers/container_config_router.py routers/container_crud_router.py routers/container_runtime_router.py routers/container_router.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

