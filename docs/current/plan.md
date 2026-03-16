# Plan

Updated: 2026-03-16T10:20:55Z

## Intake
- retrieval.hit.1: frontend/src/App.tsx:17 OperationLogs lazy route -> ./pages/OperationLogsPage
- retrieval.hit.2: frontend/src/services/api.ts:82-86 OperationLog/OperationLogsQuery/OperationLogsResponse re-export
- retrieval.hit.3: frontend/src/services/api.ts:390-393 buildOperationLogsDownloadUrl/operationLogsApi re-export
- retrieval.hit.4: frontend/src/pages/OperationLogsPage.tsx:11-79 OperationLogsPage uses useOperationLogsFeed + OperationLogsToolbar + OperationLogsList
- retrieval.hit.5: frontend/src/hooks/useOperationLogsFeed.ts:24-150 buildOperationLogsQuery/useOperationLogsFeed
- retrieval.hit.6: frontend/src/services/operationLogs.ts:13-85 OperationLogsQuery/operationLogsApi/buildOperationLogsDownloadUrl
- retrieval.hit.7: frontend/src/pages/OperationLogs.tsx:24-381 legacy duplicate page implementation still present but route detached
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- frontend/src/App.tsx:OperationLogs lazy import L17-L17 ~±1
- frontend/src/services/api.ts:OperationLog/OperationLogsQuery/OperationLogsResponse re-export + operationLogsApi/buildOperationLogsDownloadUrl re-export L82-L86,L390-L393 ~±8
- frontend/src/services/operationLogs.ts:OperationLog/OperationLogsQuery/OperationLogsResponse/requestOperationLogs/operationLogsApi/buildOperationLogsDownloadUrl L1-L85 ~±85
- frontend/src/hooks/useOperationLogsFeed.ts:OperationLogsFilters/buildOperationLogsQuery/useOperationLogsFeed L5-L150 ~±153
- frontend/src/components/OperationLogsToolbar.tsx:OperationLogsToolbarProps/OperationLogsToolbar L4-L61 ~±63
- frontend/src/components/OperationLogsList.tsx:getOperationLogLevelColor/formatOperationLogText/OperationLogsList L8-L69 ~±71
- frontend/src/pages/OperationLogsPage.tsx:OperationLogsPage L11-L79 ~±81
- frontend/src/i18n.ts:opLogs.newLogsNotice zh/en L375-L396,L905-L912 ~±2
- docs/current/overview.md:update sections
- docs/current/plan.md:replace latest effective plan
- docs/current/task.md:append frontend-split intake/implement/verify/docs entries
- docs/current/INTERFACE.md:update frontend split signatures
- docs/current/TREE.md:refresh timestamp and frontend paths
- docs/current/优化说明文档.md:update batchC status lines

## Constraints
- no_public_api_break: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- frontend-build: npm run build
- diagnostics: IDE diagnostics on frontend/src/App.tsx, frontend/src/pages/OperationLogsPage.tsx, frontend/src/components/OperationLogsToolbar.tsx, frontend/src/components/OperationLogsList.tsx, frontend/src/hooks/useOperationLogsFeed.ts, frontend/src/services/operationLogs.ts, frontend/src/services/api.ts, frontend/src/i18n.ts
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
- batchC.frontend_split: completed via OperationLogs domain split + new page route + docs sync
- batchD.container_router_split: queued routers/container_router.py capability split

## Checkpoints
- cp1: frontend/src/services/api.ts keeps OperationLogs re-export compatibility for external imports
- cp2: frontend/src/services/operationLogs.ts owns OperationLogs query/response types and request/download helpers
- cp3: frontend/src/pages/OperationLogsPage.tsx composes hook + toolbar + list and export helper
- cp4: frontend/src/App.tsx routes admin/operation-logs to OperationLogsPage
- cp5: frontend/src/i18n.ts contains opLogs.newLogsNotice zh/en
- cp6: npm run build passes in frontend working directory
- cp7: diagnostics on changed frontend files returns 0

## Rollback
- command: git restore frontend/src/App.tsx frontend/src/services/api.ts frontend/src/services/operationLogs.ts frontend/src/hooks/useOperationLogsFeed.ts frontend/src/components/OperationLogsToolbar.tsx frontend/src/components/OperationLogsList.tsx frontend/src/pages/OperationLogsPage.tsx frontend/src/i18n.ts docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

