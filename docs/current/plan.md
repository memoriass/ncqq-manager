# Plan

Updated: 2026-03-16T04:49:05Z

## Intake
- retrieval.hit.1: docs/current/优化说明文档.md:96 ws-manager-lock-and-public-count-guidance
- retrieval.hit.2: services/ws_manager.py:28 broadcast-holds-lock-during-send
- retrieval.hit.3: routers/ws_router.py:125 ws_public-public-count-and-payload-hash
- retrieval.hit.4: services/container_state.py:138 health_info-tick-available
- retrieval.hit.5: services/instance_subsystem.py:89 query-page-page_size-available
- retrieval.hit.6: docs/current/优化说明文档.md:376 scheduler-missing-reentry-protection-and-result-recording
- retrieval.hit.7: services/scheduler.py:103 scheduler-check-and-run-without-running-set
- retrieval.hit.8: routers/scheduler_router.py:30 scheduler-list-route-returns-task-fields
- retrieval.hit.9: docs/current/优化说明文档.md:608 config-reload-semantics-gap
- retrieval.hit.10: services/config.py:88 load-runtime-once-only-and-reload-noop-risk
- retrieval.hit.11: main.py:58 lifespan-load-runtime-callsite
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- services/operation_logger.py:get/_normalize_limit/_normalize_page/_normalize_time_bound/_query_db/_filter_items L51-L250 ~±120
- services/database.py:migrations/_SCHEMA operation_logs indexes + scheduled_tasks result fields ~±40
- routers/operation_logs_router.py:get_operation_logs/download_operation_logs L18-L81 ~±35
- frontend/src/services/api.ts:OperationLogsQuery/OperationLogsResponse/operationLogsApi.list L94-L440 ~±40
- frontend/src/pages/OperationLogs.tsx:query-state/fetchLogs/export/pagination L27-L383 ~±95
- frontend/src/i18n.ts:opLogs.operator/opLogs.type/opLogs.allLevels ~±6
- services/ws_manager.py:can_accept/connect_if_available/broadcast L24-L56 ~±22
- routers/ws_router.py:_build_public_version/ws_public L40-L209 ~±20
- services/scheduler.py:_init_table/_record_result/_check_and_run/_execute/_do_backup/_prune_auto_backups/_parse L20-L210 ~±85
- services/config.py:_load_runtime_from_db/load_runtime_once/reload_runtime/load_runtime/reload/source_matrix L88-L164 ~±45
- main.py:lifespan uses load_runtime_once L58-L60 ~±1
- docs/current/overview.md:update sections
- docs/current/plan.md:update sections
- docs/current/task.md:append log entries
- docs/current/INTERFACE.md:update signatures
- docs/current/TREE.md:regenerate timestamp and paths
- docs/current/优化说明文档.md:update batch status lines

## Constraints
- no_public_api_break_except_optional-query-params-and-ws-manager-helper-methods: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- python-check-ws: python -m py_compile services/ws_manager.py routers/ws_router.py
- python-check-scheduler: python -m py_compile services/scheduler.py services/database.py routers/scheduler_router.py
- python-check-config: python -m py_compile services/config.py main.py
- diagnostics: IDE diagnostics on changed files and batchB files
- frontend-build: user-confirmed npm run build completed for batchB

## RemainingQueue
- batchA.backup_router: completed and documented
- batchA.operation_log_context: completed and documented
- batchA.user_router_audit: completed and documented
- batchA.node_router_audit: completed and documented
- batchB.operation_logs_query: completed and documented
- batchC.ws_manager: completed code changes and verified by py_compile + diagnostics
- batchC.scheduler: completed code changes and verified by py_compile + diagnostics
- batchC.config_reload: completed code changes and verified by py_compile + diagnostics
- batchC.frontend_split: queued frontend/src/services/api.ts and frontend/src/pages/OperationLogs.tsx structural split

## Checkpoints
- cp1: services/operation_logger.py returns logs + pagination + filters structure
- cp2: routers/operation_logs_router.py exposes page/operator/type/level/start_time/end_time on list and download
- cp3: frontend log page wires query filters and pagination with export parity
- cp4: services/ws_manager.py broadcast copies connection snapshot inside lock and sends outside lock
- cp5: routers/ws_router.py no longer maintains _public_ws_count
- cp6: routers/ws_router.py public updates compare (sub_page, sub_page_size, tick) instead of hashing payload
- cp7: services/scheduler.py guards reentry with _running_tasks and records last_result/last_error/run_count
- cp8: services/scheduler.py wraps task execution in timeout and prunes auto backup count
- cp9: services/config.py separates load_runtime_once and reload_runtime and makes reload perform actual refresh
- cp10: services/config.py exposes bootstrap/runtime source matrix metadata

## Rollback
- command: git restore services/operation_logger.py services/database.py routers/operation_logs_router.py frontend/src/services/api.ts frontend/src/pages/OperationLogs.tsx frontend/src/i18n.ts services/ws_manager.py routers/ws_router.py services/scheduler.py routers/scheduler_router.py services/config.py main.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

