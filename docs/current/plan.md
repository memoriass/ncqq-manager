# Plan

Updated: 2026-03-16T11:17:46Z

## Intake
- retrieval.hit.1: docs/current/优化说明文档.md:135-148 container_router capability split recommendation
- retrieval.hit.2: routers/container_router.py:160-163 admin routes start after public routes removal
- retrieval.hit.3: routers/container_router.py:496-548 config/file routes were extracted from monolithic router
- retrieval.hit.4: routers/container_public_router.py:13-48 extracted public routes
- retrieval.hit.5: routers/container_config_router.py:29-85 extracted config/file routes
- retrieval.hit.6: main.py:24-26 container router imports
- retrieval.hit.7: main.py:188-191 container router registrations
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- routers/container_public_router.py:api_public_containers/api_batch_qr_status/api_paged_containers L1-L50 ~±50
- routers/container_config_router.py:ConfigRequest/_safe_path/read_container_config/save_container_config/list_container_files L1-L85 ~±85
- routers/container_router.py:remove public/config/file routes and local helpers L1-L493 ~±120
- main.py:container_public_router/container_config_router imports + include_router registration L24-L26,L188-L191 ~±6
- docs/current/overview.md:update sections
- docs/current/plan.md:replace latest effective plan
- docs/current/task.md:append container-router-split slice records
- docs/current/INTERFACE.md:update container split signatures
- docs/current/TREE.md:refresh timestamp and new router paths
- docs/current/优化说明文档.md:update batchC container split progress line

## Constraints
- no_public_api_break: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- python-check-container-routers: python -m py_compile main.py routers/container_router.py routers/container_public_router.py routers/container_config_router.py
- diagnostics: IDE diagnostics on main.py, routers/container_router.py, routers/container_public_router.py, routers/container_config_router.py
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
- batchD.container_router_split.slice1: completed public router extraction
- batchD.container_router_split.slice2: completed config/file router extraction
- batchD.container_router_split.slice3: queued CRUD/runtime route extraction from routers/container_router.py

## Checkpoints
- cp1: /api/public/containers, /api/public/qr/batch, /api/public/containers/page served by routers/container_public_router.py
- cp2: /api/containers/{name}/config/{filename:path} read/write and /api/containers/{name}/files served by routers/container_config_router.py
- cp3: main.py registers container_public_router and container_config_router before container_router
- cp4: routers/container_router.py file size reduced after removing public/config/file route blocks
- cp5: python -m py_compile passes on main.py and split container routers
- cp6: diagnostics on changed container router files returns 0

## Rollback
- command: git restore main.py routers/container_router.py routers/container_public_router.py routers/container_config_router.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

