# Plan

Updated: 2026-03-16T23:45:24.8821881+08:00

## Intake
- retrieval.hit.1: frontend/src/hooks/useWebSocket.ts:16-35 defines WSDisconnectReason and classifyClose
- retrieval.hit.2: frontend/src/hooks/useWebSocket.ts:63-71 reconnect uses exponential backoff + jitter
- retrieval.hit.3: frontend/src/hooks/usePublicWebSocket.ts:36-53 defines PublicWSDisconnectReason and classifyClose
- retrieval.hit.4: frontend/src/layouts/AdminLayout.tsx:43-51 consumes reconnectAttempt and lastDisconnectReason
- retrieval.hit.5: frontend/src/pages/UserDashboard.tsx:42-48 consumes reconnectAttempt and lastDisconnectReason
- retrieval.hit.6: docs/current/优化说明文档.md:694-703 6.7 target requires backoff/auth-network handling/reason exposure
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- frontend/src/hooks/useWebSocket.ts:useWebSocket L16-L147 ~+34/-9
- frontend/src/hooks/usePublicWebSocket.ts:usePublicWebSocket L36-L177 ~+42/-8
- frontend/src/layouts/AdminLayout.tsx:AdminLayout L43-L51,L156-L172 ~+22/-4
- frontend/src/pages/UserDashboard.tsx:UserDashboard L42-L48,L209-L223 ~+24/-2
- frontend/src/i18n.ts:admin keys L65-L77,L605-L617 ~+24/-0
- docs/current/overview.md:update sections
- docs/current/plan.md:replace latest effective plan
- docs/current/task.md:append batchF records
- docs/current/INTERFACE.md:update Updated and hook signature block
- docs/current/TREE.md:refresh timestamp
- docs/current/优化说明文档.md:update 6.7 completion mark

## Constraints
- no_bs_submodule_change: true
- no_public_api_break: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- frontend-build: npm run build
- diagnostics: IDE diagnostics on changed frontend/docs files
- timestamp: Get-Date -Format o

## Checkpoints
- cp1: useWebSocket/usePublicWebSocket both provide exponential backoff + jitter reconnect
- cp2: disconnect reason classification supports unauthorized/network/server/manual/unknown (+capacity_limited for public)
- cp3: hook return values include reconnectAttempt and lastDisconnectReason
- cp4: AdminLayout and UserDashboard render reconnect attempt and disconnect reason in UI
- cp5: i18n zh/en includes admin.wsRetry and admin.wsDisconnectReason.* keys
- cp6: build and diagnostics are green

## Rollback
- command: git restore frontend/src/hooks/useWebSocket.ts frontend/src/hooks/usePublicWebSocket.ts frontend/src/layouts/AdminLayout.tsx frontend/src/pages/UserDashboard.tsx frontend/src/i18n.ts docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

