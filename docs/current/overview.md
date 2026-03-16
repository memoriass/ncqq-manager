# Overview

Updated: 2026-03-16T04:49:05Z

## Goal
- scope: batchB-operation-logs-completed-and-batchC-ws-scheduler-config-increment-from-优化说明文档.md-latest-annotations
- modules: services/operation_logger.py,services/database.py,routers/operation_logs_router.py,frontend/src/services/api.ts,frontend/src/pages/OperationLogs.tsx,frontend/src/i18n.ts,services/ws_manager.py,routers/ws_router.py,services/scheduler.py,routers/scheduler_router.py,services/config.py,main.py

## KPI
- operation_logs_query_filters: enabled
- operation_logs_query_pagination: enabled
- operation_logs_query_indexes: enabled
- operation_logs_frontend_filters: enabled
- ws_broadcast_lock_outside_send: enabled
- ws_public_connection_counter_race: 0
- ws_public_payload_hash_loop: 0
- scheduler_running_task_reentry: 0
- scheduler_result_fields: enabled
- scheduler_execute_timeout: enabled
- scheduler_auto_backup_retention: enabled
- config_reload_runtime_refresh: enabled
- config_source_matrix_exposed: enabled

## Rollback
- code: git restore services/operation_logger.py services/database.py routers/operation_logs_router.py frontend/src/services/api.ts frontend/src/pages/OperationLogs.tsx frontend/src/i18n.ts services/ws_manager.py routers/ws_router.py services/scheduler.py routers/scheduler_router.py services/config.py main.py
- docs: git restore docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

