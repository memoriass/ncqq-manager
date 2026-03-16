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

- ts: 2025-02-14T00:20:00Z
  phase: intake
  evidence:
    - docs/current/优化说明文档.md:157-182 operation-log-context-guidance
    - routers/user_router.py:106-124 missing-user-audit-endpoints
    - routers/node_router.py:56-96 missing-node-audit-and-private-proxy-call-sites
- ts: 2025-02-14T00:21:00Z
  phase: implement
  target: services/operation_log_context.py,routers/user_router.py,routers/node_router.py,services/cluster_manager.py
  changes:
    - add services/operation_log_context.py build_operator_payload helper
    - routers/user_router.py switches existing user_create/user_edit/user_delete logs to helper payload
    - routers/user_router.py adds user_assign_instances and user_regenerate_apikey audit records
    - routers/node_router.py adds cluster_config_save and node_edit audit records
    - routers/node_router.py switches node_add/node_delete to helper payload
    - services/cluster_manager.py exposes proxy_to_node_async public wrapper
    - routers/node_router.py replaces direct _proxy_to_node_async call sites with proxy_to_node_async
  evidence:
    - services/operation_log_context.py:10-22 build_operator_payload
    - routers/user_router.py:115-156 instances-and-apikey-audit
    - routers/node_router.py:97-107 cluster-config-audit
    - routers/node_router.py:172-184 node-edit-audit
    - services/cluster_manager.py:252-262 proxy-to-node-public-wrapper
- ts: 2025-02-14T00:22:00Z
  phase: verify
  commands:
    - python -m py_compile services/operation_log_context.py routers/user_router.py routers/node_router.py services/cluster_manager.py => pass
    - diagnostics services/operation_log_context.py routers/user_router.py routers/node_router.py services/cluster_manager.py => pass
- ts: 2025-02-14T00:23:00Z
  phase: remeber
  items:
    - label: intake.scope
      fact: batchA focuses on audit baseline after backup_router security hardening
      impact: implementation remains within routers/services layer without frontend changes
      next: continue batchB operation logs query enhancement
    - label: intake.example
      fact: code-examples directory not found in workspace
      impact: aligned helper shape with existing router-level operation_logger payload conventions
      next: keep same-layer alignment for following batches
    - label: intake.risk
      fact: user apikey regeneration returns plaintext in API response but not in audit payload
      impact: avoids new log leakage while preserving existing response contract
      next: evaluate response contract hardening in later security batch
    - label: exec.user_router
      fact: user_assign_instances and user_regenerate_apikey now emit operation_logger records
      impact: closes missing audit coverage for user mutation endpoints
      next: query layer should support filtering these event types in batchB
    - label: exec.node_router
      fact: cluster_config_save and node_edit now share build_operator_payload helper
      impact: operator fields become consistent across critical node/config mutations
      next: migrate remaining routers with repeated operator fields opportunistically
    - label: exec.proxy_boundary
      fact: node_router no longer calls cluster_manager private proxy method directly
      impact: route/service boundary is cleaner and private API leakage is reduced
      next: consider internal callers migration to public wrapper for consistency
    - label: verify.syntax
      fact: py_compile passed for 4 changed python files
      impact: no syntax regression introduced in current batchA scope
      next: include broader runtime checks when batchB touches logger query stack
    - label: verify.ide
      fact: diagnostics returned no issues for changed files
      impact: current incremental gate is green
      next: proceed to operation_logs query enhancement
    - label: docs.plan
      fact: plan/overview/interface/tree updated to batchA scope and new signatures
      impact: rolling docs remain current and no duplicate doc files were created
      next: append subsequent batch records instead of forking docs
    - label: summary.1
      fact: backup_router, operation_log_context, user_router audit, node_router audit are implemented in code
      impact: batchA core code items are substantially complete
      next: finish broader verification when next batch starts
    - label: summary.2
      fact: build_operator_payload centralizes operator_name/operator_uuid/operator_ip assembly
      impact: lowers repeated code and future field drift risk
      next: reuse helper in image/auth/backup/container routers as follow-up refactor
    - label: summary.3
      fact: no audit payload contains regenerated API key plaintext
      impact: logging discipline gate remains green for current changes
      next: keep sensitive field blacklist explicit in future audit additions
    - label: summary.4
      fact: cluster_manager public wrapper shields route layer from private async proxy implementation
      impact: private method contract can evolve with lower router coupling
      next: assess renaming or deprecating internal underscore method later
    - label: summary.5
      fact: current gates passed at syntax and IDE diagnostics level
      impact: safe to continue batchB without reverting current batchA changes
      next: start services/operation_logger.py and routers/operation_logs_router.py enhancement

- ts: 2026-03-16T04:49:05Z
  phase: implement
  target: services/operation_logger.py,services/database.py,routers/operation_logs_router.py,frontend/src/services/api.ts,frontend/src/pages/OperationLogs.tsx,frontend/src/i18n.ts
  changes:
    - services/operation_logger.py adds limit/page/operator/type/level/start_time/end_time filters and returns logs + pagination + filters
    - services/database.py adds operation_logs_query_indexes migration and index definitions for operator_uuid/timestamp and type/timestamp
    - routers/operation_logs_router.py exposes page/operator/type/level/start_time/end_time on list and download endpoints
    - frontend/src/services/api.ts adds OperationLogsQuery/OperationLogsResponse and request query serialization
    - frontend/src/pages/OperationLogs.tsx wires operator/type/level filters, page state, pagination, and export query parity
    - frontend/src/i18n.ts adds opLogs.operator, opLogs.type, opLogs.allLevels labels
  evidence:
    - services/operation_logger.py:82-157 get-query-response-shape
    - routers/operation_logs_router.py:18-60 route-query-params-and-download-parity
    - frontend/src/services/api.ts:94-112 operation-log-types
    - frontend/src/pages/OperationLogs.tsx:27-118 query-state-and-fetch
- ts: 2026-03-16T04:49:05Z
  phase: verify
  commands:
    - python -m py_compile services/operation_logger.py services/database.py routers/operation_logs_router.py => pass
    - diagnostics services/operation_logger.py services/database.py routers/operation_logs_router.py frontend/src/services/api.ts frontend/src/pages/OperationLogs.tsx frontend/src/i18n.ts => pass
    - frontend build => user-confirmed completed
- ts: 2026-03-16T04:49:05Z
  phase: intake
  evidence:
    - docs/current/优化说明文档.md:96-111 ws-manager-lock-and-public-count-guidance
    - services/ws_manager.py:28-39 broadcast-held-lock-during-send
    - routers/ws_router.py:125-209 public-count-race-and-payload-hash
    - services/container_state.py:138-148 health_info-tick-available
    - services/instance_subsystem.py:89-115 paged-query-available
- ts: 2026-03-16T04:49:05Z
  phase: implement
  target: services/ws_manager.py,routers/ws_router.py
  changes:
    - services/ws_manager.py adds can_accept(limit) and connect_if_available(ws, limit)
    - services/ws_manager.py broadcast copies connection snapshot under lock and sends outside lock; dead sockets cleaned in follow-up lock section
    - routers/ws_router.py removes _public_ws_count state and delegates public capacity check to ws_manager.connect_if_available
    - routers/ws_router.py adds _build_public_version(sub_page, sub_page_size) using state_engine.health_info["tick"]
    - routers/ws_router.py replaces full payload hash comparison with (sub_page, sub_page_size, tick) version comparison
    - routers/ws_router.py finally branch disconnects via ws_manager.disconnect(ws)
  evidence:
    - services/ws_manager.py:28-56 connection-cap-and-lock-outside-send
    - routers/ws_router.py:40-42 public-version-helper
    - routers/ws_router.py:140-147 public-connect-limit-and-prev-version
    - routers/ws_router.py:167-199 tick-version-based-send
- ts: 2026-03-16T04:49:05Z
  phase: verify
  commands:
    - python -m py_compile services/ws_manager.py routers/ws_router.py => pass
    - diagnostics services/ws_manager.py routers/ws_router.py => pass
- ts: 2026-03-16T04:49:05Z
  phase: remeber
  items:
    - label: intake.scope
      fact: batchB completed backend filters, db indexes, and frontend log query wiring before batchC ws changes
      impact: current queue can move from query capability to websocket stability without reopening batchB code
      next: document batchB as completed in rolling docs
    - label: intake.example
      fact: code-examples directory still not present in workspace
      impact: ws changes aligned to existing ws_manager/ws_router patterns and available state_engine tick field
      next: continue same-layer alignment for scheduler batch
    - label: intake.risk
      fact: public websocket limit is now enforced after accept within connect_if_available
      impact: overflow clients may complete handshake before close code 4429 is sent
      next: keep current behavior unless protocol-level pre-accept gate is introduced later
    - label: exec.batchB.api
      fact: operation_logs list/download now share filter semantics for operator/type/level/time/page
      impact: frontend export and visible list remain query-consistent
      next: scheduler batch should preserve this response schema when adding retention metadata
    - label: exec.batchB.db
      fact: operation_logs_query_indexes adds composite indexes on operator_uuid,timestamp and type,timestamp
      impact: filtered time-desc queries have indexed access path in sqlite migration path
      next: monitor if level/time composite index becomes necessary after production profiling
    - label: exec.ws_manager
      fact: broadcast no longer awaits socket sends while holding the connection set lock
      impact: slow clients cannot stall connection registration and removal paths for all peers
      next: consider per-send timeout if future pressure data shows stuck sockets persist
    - label: exec.ws_public
      fact: ws_public removed unsynchronized _public_ws_count and uses tick-based version tuple
      impact: public connection cap logic is centralized and periodic payload hashing cost is removed
      next: reuse the same versioning pattern for other high-frequency push endpoints if added
    - label: verify.syntax
      fact: py_compile passed for services/ws_manager.py and routers/ws_router.py and batchB python files
      impact: current python changes are syntax-safe across query and websocket batches
      next: proceed to scheduler concurrency hardening
    - label: verify.ide
      fact: diagnostics returned no issues for ws files and batchB changed files
      impact: incremental static gate is green for completed batches B and C.ws_manager
      next: keep scheduler edits inside the same green gate pattern
    - label: docs.plan
      fact: overview/plan/interface/tree/task/优化说明文档 updated to reflect batchB complete and batchC ws scope complete
      impact: rolling docs remain single-source and match current modified symbols
      next: append scheduler evidence instead of rewriting completed batch history
    - label: summary.1
      fact: batchB operation log query enhancement is implemented across backend, db, and frontend
      impact: operator/type/level/time/page filtering is available end-to-end
      next: retain response compatibility while extending scheduler observability
    - label: summary.2
      fact: batchC ws_manager item is implemented with lock-outside-send and unified public connection registration
      impact: websocket fan-out path has lower contention and public count race is removed
      next: verify runtime behavior manually when scheduler batch is done
    - label: summary.3
      fact: state_engine.health_info tick is used as public push version source
      impact: repeated serialization hash work is eliminated from the 3-second loop
      next: add explicit version accessor only if more callers need tick semantics
    - label: summary.4
      fact: user confirmed frontend batchB build completed outside tool execution
      impact: frontend gate evidence is partial but accepted per user instruction
      next: rerun scripted build locally only if later frontend refactor changes same page again
    - label: summary.5
      fact: next remaining queued optimization is services/scheduler.py concurrency/timeout/result retention
      impact: queue is narrowed to scheduler-focused backend stabilization
      next: start scheduler intake from optimization document and current implementation

- ts: 2026-03-16T04:49:05Z
  phase: intake
  evidence:
    - docs/current/优化说明文档.md:376-404 scheduler-missing-reentry-result-timeout-retention
    - services/scheduler.py:103-128 check-and-run-without-running-guard-or-result-fields
    - routers/scheduler_router.py:30-55 list-route-returns-task-fields-directly
    - services/database.py:46-92 migration-framework-available-for-scheduled_tasks-columns
- ts: 2026-03-16T04:49:05Z
  phase: implement
  target: services/scheduler.py,services/database.py
  changes:
    - services/database.py adds scheduled_tasks_result_fields migration and scheduled_tasks schema columns last_result/last_error/run_count
    - services/scheduler.py adds _running_tasks set to guard task reentry while a task is executing
    - services/scheduler.py adds _record_result(task_id, last_run, result, error) and persists run_count increments
    - services/scheduler.py wraps backup/restart/cleanup execution with asyncio.wait_for timeout sourced from config.timeout or default 60s
    - services/scheduler.py adds _prune_auto_backups(keep_count) and runs it after auto backup creation
    - services/scheduler.py parse path now returns run_count/last_result/last_error for router list output
  evidence:
    - services/database.py:52-58 migration-list-add-scheduled-task-fields
    - services/database.py:88-111 scheduled-task-column-migration
    - services/scheduler.py:20-27 scheduler-running-set-and-constants
    - services/scheduler.py:119-158 reentry-guard-timeout-result-persistence
    - services/scheduler.py:160-182 backup-retention-prune
- ts: 2026-03-16T04:49:05Z
  phase: verify
  commands:
    - python -m py_compile services/scheduler.py services/database.py routers/scheduler_router.py => pass
    - diagnostics services/scheduler.py services/database.py routers/scheduler_router.py => pass
- ts: 2026-03-16T04:49:05Z
  phase: remeber
  items:
    - label: intake.scheduler.scope
      fact: scheduler optimization scope stayed inside services/scheduler.py and services/database.py with router contract preserved
      impact: UI list endpoint can consume new result fields without route signature change
      next: expose the new fields in frontend only if user requests scheduler page enhancement
    - label: intake.scheduler.example
      fact: code-examples directory remains absent for scheduler path as well
      impact: implementation followed existing sqlite migration and service-layer patterns in repo
      next: keep using in-repo migration conventions for config reload batch
    - label: intake.scheduler.risk
      fact: timeout wraps backup and cleanup via asyncio.to_thread and restart via existing async path
      impact: blocking file and docker operations no longer hold the scheduler loop indefinitely
      next: tune default timeout only after observing real task duration distribution
    - label: exec.scheduler.reentry
      fact: _running_tasks now suppresses duplicate execution of the same task id while prior run is active
      impact: long-running tasks cannot be retriggered by subsequent 60-second loop iterations
      next: consider surfacing currently running ids through read-only health endpoint later
    - label: exec.scheduler.result
      fact: scheduled_tasks rows now persist last_result, last_error, and run_count
      impact: scheduler_router list output gains execution observability without extra joins or tables
      next: frontend scheduler page can show recent status without parsing logs
    - label: exec.scheduler.retention
      fact: backup_db task prunes old .auto backups by keep_count after successful copy
      impact: automatic backup accumulation is bounded by count instead of growing unbounded
      next: add age-based retention only if operators request mixed policy
    - label: verify.scheduler.syntax
      fact: py_compile passed for scheduler.py, database.py, scheduler_router.py
      impact: migration and scheduler flow edits are syntax-safe
      next: keep same compile gate for config reload batch
    - label: verify.scheduler.ide
      fact: diagnostics returned no issues for scheduler/database/router files
      impact: incremental static gate remains green after scheduler hardening
      next: proceed to services/config.py semantic cleanup
    - label: docs.scheduler.plan
      fact: rolling docs were updated to mark batchC.scheduler complete and next queue item config_reload
      impact: task/plan/overview/interface/tree continue matching current repository state
      next: append config reload evidence rather than rewriting scheduler records
    - label: summary.1
      fact: scheduler now has reentry guard, result fields, timeout, and backup retention in code
      impact: batchC scheduler risk items from optimization document are closed at service layer
      next: verify runtime behavior during next manual operations window
    - label: summary.2
      fact: scheduled_tasks schema is backward-compatible through migration and forward-compatible in CREATE TABLE
      impact: both existing and fresh databases receive the same execution metadata fields
      next: avoid separate shadow tables unless history retention becomes necessary
    - label: summary.3
      fact: router contract was kept stable while list payload grew by parsed fields
      impact: no backend API break introduced for existing scheduler consumers
      next: document fields in UI contract if scheduler frontend work starts
    - label: summary.4
      fact: batchB and batchC ws/scheduler items are now all documented as completed
      impact: remaining queue narrows to config reload semantics and larger structural refactors
      next: start services/config.py intake on next turn if user continues
    - label: summary.5
      fact: next remaining queued optimization is services/config.py reload semantics convergence
      impact: optimization work can continue without revisiting completed ws or scheduler batches
      next: inspect services/config.py load_runtime/reload behavior and update docs accordingly
