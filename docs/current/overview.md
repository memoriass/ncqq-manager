# Overview

Updated: 2026-03-16T10:20:55Z

## Goal
- scope: batchC-frontend-split-completed-after-batchB-operation-logs-and-batchC-ws-scheduler-config
- modules: frontend/src/App.tsx,frontend/src/services/api.ts,frontend/src/services/operationLogs.ts,frontend/src/hooks/useOperationLogsFeed.ts,frontend/src/components/OperationLogsToolbar.tsx,frontend/src/components/OperationLogsList.tsx,frontend/src/pages/OperationLogsPage.tsx,frontend/src/i18n.ts,docs/current/overview.md,docs/current/plan.md,docs/current/task.md,docs/current/INTERFACE.md,docs/current/TREE.md,docs/current/优化说明文档.md

## KPI
- frontend_api_domain_split: enabled
- frontend_operation_logs_page_split: enabled
- frontend_route_to_operation_logs_page: enabled
- frontend_new_logs_notice_i18n: enabled
- frontend_build: pass
- frontend_diagnostics: 0
- operation_logs_query_filters: enabled
- operation_logs_query_pagination: enabled
- ws_broadcast_lock_outside_send: enabled
- ws_public_connection_counter_race: 0
- scheduler_running_task_reentry: 0
- config_reload_runtime_refresh: enabled
- docs_current_sync: enabled

## Rollback
- code: git restore frontend/src/App.tsx frontend/src/services/api.ts frontend/src/services/operationLogs.ts frontend/src/hooks/useOperationLogsFeed.ts frontend/src/components/OperationLogsToolbar.tsx frontend/src/components/OperationLogsList.tsx frontend/src/pages/OperationLogsPage.tsx frontend/src/i18n.ts
- docs: git restore docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

