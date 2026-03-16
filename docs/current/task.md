# Task Log

Updated: 2026-03-16T22:53:54.6362059+08:00

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

- ts: 2026-03-16T04:49:05Z
  phase: intake
  evidence:
    - docs/current/优化说明文档.md:608-623 config-reload-semantics-gap
    - services/config.py:88-147 load-runtime-once-plus-noop-reload
    - main.py:58-60 lifespan-runtime-load-callsite
    - routers/node_router.py:34-45,96,171 runtime-config-read-write-call-sites
- ts: 2026-03-16T04:49:05Z
  phase: implement
  target: services/config.py,main.py
  changes:
    - services/config.py extracts _load_runtime_from_db(persist_missing_defaults)
    - services/config.py adds load_runtime_once() for startup-only runtime hydration
    - services/config.py adds reload_runtime() for forced in-memory refresh from SQLite
    - services/config.py keeps load_runtime() as compatibility alias to load_runtime_once()
    - services/config.py reload() now always performs bootstrap reload plus runtime refresh when called
    - services/config.py exposes bootstrap_keys/runtime_keys/source_matrix metadata for source-boundary documentation
    - main.py lifespan startup switches to app_config.load_runtime_once()
  evidence:
    - services/config.py:88-117 load-runtime-once-and-reload-runtime
    - services/config.py:147-164 source-matrix-and-real-reload
    - main.py:58-60 startup-load-runtime-once
- ts: 2026-03-16T04:49:05Z
  phase: verify
  commands:
    - python -m py_compile services/config.py main.py => pass
    - diagnostics services/config.py main.py => pass
- ts: 2026-03-16T04:49:05Z
  phase: remeber
  items:
    - label: intake.config.scope
      fact: config reload cleanup stayed within services/config.py and main.py startup call site
      impact: existing route-level get/set/update contracts remain stable while reload semantics become explicit
      next: structural frontend split can proceed without config contract churn
    - label: intake.config.example
      fact: code-examples directory is still absent for config center work
      impact: implementation followed in-repo AppConfig API style and current startup ordering in main.py
      next: keep documenting source boundaries in current rolling docs
    - label: intake.config.risk
      fact: reload_runtime now reads from SQLite without re-persisting defaults
      impact: forced refresh will not overwrite externally modified settings during reload
      next: add version/event hooks only if multi-process config writers appear later
    - label: exec.config.reload
      fact: reload() now executes bootstrap json reload plus actual runtime refresh instead of calling a once-only loader
      impact: callers no longer get false confidence from a noop reload path
      next: use reload() rather than manual bootstrap/db reads if future admin endpoint is added
    - label: exec.config.boundary
      fact: source_matrix/bootstrap_keys/runtime_keys now expose config-source ownership in code
      impact: bootstrap/runtime field boundaries are inspectable and easier to document accurately
      next: surface matrix in docs or health endpoint if operators need runtime introspection
    - label: exec.config.startup
      fact: main.py now calls load_runtime_once() explicitly during lifespan startup
      impact: startup semantics are self-descriptive and no longer rely on ambiguous load_runtime naming
      next: migrate any future startup call sites to the explicit method names
    - label: verify.config.syntax
      fact: py_compile passed for services/config.py and main.py
      impact: config-center semantic cleanup is syntax-safe
      next: preserve compile gate during next structural split batch
    - label: verify.config.ide
      fact: diagnostics returned no issues for services/config.py and main.py
      impact: incremental static gate remains green after config changes
      next: continue to frontend structural split with same gate discipline
    - label: docs.config.plan
      fact: rolling docs were updated to mark batchC.config_reload complete and queue frontend split next
      impact: current documentation matches actual remaining scope
      next: append frontend split records rather than editing completed config history
    - label: summary.1
      fact: config center now distinguishes one-time runtime load and forced runtime reload in code
      impact: reload semantics match method names and optimization document requirements
      next: add admin-triggered reload only if there is a real operator workflow
    - label: summary.2
      fact: compatibility method load_runtime() remains available and delegates to load_runtime_once()
      impact: existing callers are preserved while new code can use explicit APIs
      next: gradually migrate old callers to explicit names when touching those files
    - label: summary.3
      fact: source boundary metadata is now available without creating duplicate documentation files
      impact: bootstrap/runtime ownership can be reused by docs and debugging tools
      next: include matrix in future interface refresh if config fields expand
    - label: summary.4
      fact: batchC ws_manager, scheduler, and config_reload items are all completed and documented
      impact: remaining work moves from backend stability into structural refactor batches
      next: start frontend api.ts/OperationLogs.tsx split if user continues
    - label: summary.5
      fact: next remaining queued optimization is frontend/src/services/api.ts and frontend/src/pages/OperationLogs.tsx structural split
      impact: subsequent work will primarily be frontend/module organization rather than backend semantics
      next: inspect current OperationLogs.tsx extraction seams and api.ts domain boundaries

- ts: 2026-03-16T10:20:55Z
  phase: intake
  changes:
    - frontend split retrieval confirmed App route, api re-export, domain service, hook, toolbar, list, and page composition
    - code-examples directory not present; aligned with existing frontend same-layer implementation
    - legacy frontend/src/pages/OperationLogs.tsx remains in repository but detached from App route
  evidence:
    - frontend/src/App.tsx:17 OperationLogs lazy route -> ./pages/OperationLogsPage
    - frontend/src/services/api.ts:82-86 type re-export
    - frontend/src/services/api.ts:390-393 helper re-export
    - frontend/src/pages/OperationLogsPage.tsx:20-73 page composition
    - frontend/src/hooks/useOperationLogsFeed.ts:24-150 query-build and feed lifecycle
- ts: 2026-03-16T10:20:55Z
  phase: implement
  changes:
    - frontend/src/App.tsx routes admin operation-logs page to OperationLogsPage
    - frontend/src/i18n.ts adds opLogs.newLogsNotice in zh/en sections
    - frontend split files remain active: operationLogs.ts, useOperationLogsFeed.ts, OperationLogsToolbar.tsx, OperationLogsList.tsx, OperationLogsPage.tsx
    - docs/current overview/plan/interface/tree/优化说明文档 synchronized to frontend split completion state
  evidence:
    - frontend/src/App.tsx:17 lazy import OperationLogsPage
    - frontend/src/pages/OperationLogsPage.tsx:25-33 export download helper usage
    - frontend/src/components/OperationLogsToolbar.tsx:19-61 toolbar props and controls
    - frontend/src/components/OperationLogsList.tsx:17-69 list formatting and rendering
    - frontend/src/services/operationLogs.ts:78-85 list helper and download URL helper
- ts: 2026-03-16T10:20:55Z
  phase: verify
  commands:
    - npm run build => pass
    - diagnostics frontend/src/App.tsx frontend/src/pages/OperationLogsPage.tsx frontend/src/components/OperationLogsToolbar.tsx frontend/src/components/OperationLogsList.tsx frontend/src/hooks/useOperationLogsFeed.ts frontend/src/services/operationLogs.ts frontend/src/services/api.ts frontend/src/i18n.ts => pass
- ts: 2026-03-16T10:20:55Z
  phase: remeber
  items:
    - label: intake.frontend.route
      fact: App.tsx now lazy-loads ./pages/OperationLogsPage for admin operation-logs route
      impact: page split is live without changing route path semantics
      next: keep legacy OperationLogs.tsx only as detached compatibility artifact until separately cleaned
    - label: intake.frontend.example
      fact: code-examples directory is absent for frontend split work
      impact: implementation aligned to existing frontend component/hook/service patterns already in repo
      next: continue same-layer alignment for container_router split if user proceeds
    - label: intake.frontend.compat
      fact: services/api.ts re-exports OperationLog types and operationLogsApi helpers from services/operationLogs.ts
      impact: external imports can remain stable while domain code moves out of api.ts
      next: preserve re-export boundary for future domain extractions
    - label: exec.frontend.domain
      fact: services/operationLogs.ts now owns query types, request helper, and download URL builder
      impact: OperationLogs domain logic is isolated from the monolithic api.ts file
      next: evaluate whether unauthorized branch should share AuthError only when circular dependency risk is eliminated
    - label: exec.frontend.page
      fact: OperationLogsPage composes useOperationLogsFeed, OperationLogsToolbar, and OperationLogsList
      impact: page responsibilities are split into domain hook and presentational components
      next: collapse legacy OperationLogs.tsx in a dedicated cleanup batch if import graph audit is requested
    - label: exec.frontend.i18n
      fact: i18n zh/en sections both include opLogs.newLogsNotice
      impact: pending new log notice renders without missing translation keys
      next: keep new split component labels synchronized when toolbar/list copy changes
    - label: verify.frontend.build
      fact: npm run build passed and emitted dist/assets/OperationLogsPage-*.js bundle
      impact: current frontend split is build-safe and route chunk generation is confirmed
      next: preserve build gate after each remaining structural batch
    - label: verify.frontend.ide
      fact: diagnostics returned 0 issues for changed frontend files
      impact: incremental static validation remained green after route and docs sync
      next: run same diagnostics scope after any legacy page cleanup
    - label: docs.frontend.scope
      fact: overview/plan/task/INTERFACE/TREE/优化说明文档 were updated to reflect batchC.frontend_split completion
      impact: rolling docs now match actual frontend split state and next queue
      next: start routers/container_router.py capability split as next optimization batch
    - label: summary.1
      fact: batchC.frontend_split is completed in active route path and documented
      impact: optimization queue now advances beyond operation logs frontend restructuring
      next: move to container_router capability-domain split
    - label: summary.2
      fact: OperationLogs domain now has dedicated service, hook, toolbar, list, and page files
      impact: future operation logs changes no longer require editing one large page file only
      next: keep service/page separation for other oversized frontend modules
    - label: summary.3
      fact: api.ts remains a compatibility export layer instead of a sole domain owner
      impact: domain extraction can continue incrementally without breaking imports
      next: consider next safe extraction candidate only after queue reprioritization
    - label: summary.4
      fact: build and diagnostics gates are green for the frontend split batch
      impact: current code state meets local acceptance gates used in this pass
      next: reuse same gates on next optimization item
    - label: summary.5
      fact: next remaining queued optimization is routers/container_router.py capability split
      impact: work focus shifts from frontend structure back to backend route modularization
      next: begin with codebase retrieval on container_router if user continues

- ts: 2026-03-16T22:20:33+08:00
  phase: intake
  evidence:
    - docs/current/优化说明文档.md:145-148 container_router split target routers
    - main.py:24-27 container split imports active
    - main.py:190-193 container split registration active
    - routers/container_config_router.py:31-85 config/file routes present
    - routers/container_crud_router.py:94-143 crud routes present
    - routers/container_runtime_router.py:38-147 runtime routes present
    - routers/container_router.py:absent legacy file removed
- ts: 2026-03-16T22:20:33+08:00
  phase: implement
  target: docs/current/INTERFACE.md,docs/current/TREE.md,docs/current/优化说明文档.md,docs/current/overview.md
  changes:
    - docs/current/INTERFACE.md updates Updated timestamp and appends container_public/container_config/container_crud/container_runtime route signatures
    - docs/current/TREE.md refreshes timestamp and includes container split router files
    - docs/current/优化说明文档.md marks container_router capability split as completed with four router files and main registration switch
    - docs/current/overview.md marks batchD container router split status as completed
- ts: 2026-03-16T22:20:33+08:00
  phase: verify
  commands:
    - python -m py_compile main.py routers/container_public_router.py routers/container_config_router.py routers/container_crud_router.py routers/container_runtime_router.py
    - diagnostics main.py routers/container_public_router.py routers/container_config_router.py routers/container_crud_router.py routers/container_runtime_router.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md
- ts: 2026-03-16T22:20:33+08:00
  phase: remeber
  items:
    - label: intake.scope
      fact: container router split now uses four routers and main.py no longer references container_router
      impact: monolithic route aggregation risk is removed from active registration path
      next: keep runtime behavior observation in next maintenance cycle
    - label: intake.example
      fact: code-examples directory remains absent in workspace
      impact: split signatures and route behaviors were aligned against existing in-repo router conventions
      next: continue same-layer alignment for any future router refactor
    - label: intake.risk
      fact: container_crud_router and container_runtime_router currently keep one-line condensed handler implementations
      impact: readability is reduced though behavior remains equivalent
      next: schedule formatting/readability cleanup as a non-functional task
    - label: docs.interface
      fact: INTERFACE now includes signatures for container_public/config/crud/runtime routers
      impact: API surface documentation aligns with active registered modules
      next: keep signature list synchronized with any route parameter change
    - label: docs.tree
      fact: TREE now lists container split router files with fresh timestamp
      impact: structure doc reflects current workspace layout for batchD completion
      next: regenerate tree on next structural change only
    - label: docs.optimization
      fact: optimization doc batchC line now marks container_router split completed with explicit extracted files
      impact: optimization backlog no longer misreports split as pending
      next: move focus to next queued non-completed optimization item
    - label: summary.1
      fact: batchD container router capability split is completed in active route registration
      impact: container API responsibilities are separated by public/config/crud/runtime domains
      next: monitor route-level runtime logs for one release window
    - label: summary.2
      fact: legacy routers/container_router.py is absent while main.py compiles against split routers
      impact: duplicate route source risk and accidental double registration risk are reduced
      next: keep rollback path documented via git restore
    - label: summary.3
      fact: docs/current overview/plan/interface/tree/task/优化说明文档 were updated in-place without duplicate files
      impact: rolling documentation remains single-source and synchronized
      next: append only incremental logs in future tasks
    - label: summary.4
      fact: acceptance verification commands are prepared for immediate execution after doc sync
      impact: gate results can be recorded in same batch log with reproducible commands
      next: run py_compile and diagnostics and update KPI status
    - label: summary.5
      fact: next queue after batchD is runtime stability observation plus long-term docker sync/async convergence
      impact: scope stays controlled and avoids mixing structural split with deep service migration
      next: start new batch only after user confirms priority

- ts: 2026-03-16T22:53:54.6362059+08:00
  phase: intake
  evidence:
    - main.py:223-241 health-check ws_public uses routers.ws_router._public_ws_count
    - services/ws_manager.py:58-60 ws_manager.connection_count available
    - services/operation_logger.py:18-20 operation_logger._buffer available
    - services/scheduler.py:48-50 scheduler.list_tasks available with result fields
    - services/botshepherd.py:137-143 botshepherd_manager.status summary fields available
    - docs/current/优化说明文档.md:632-643 health extension targets
    - code-examples: not found; aligned to same-layer implementation
- ts: 2026-03-16T22:53:54.6362059+08:00
  phase: implement
  target: main.py
  changes:
    - main.py:223-283 health_check replaces ws source from routers.ws_router._public_ws_count to services.ws_manager.ws_manager.connection_count
    - main.py:253-283 health_check adds operation_logger_buffer/scheduler/botshepherd summary fields
    - main.py:241-255 health_check adds degraded_reasons and status=degraded|ok decision
  evidence:
    - main.py:229-231 ws_manager/scheduler/botshepherd imports
    - main.py:233-236 scheduler task summary aggregation
    - main.py:241-251 degraded reasons enumeration
    - main.py:260-282 expanded health payload
- ts: 2026-03-16T22:53:54.6362059+08:00
  phase: verify
  commands:
    - python -m py_compile main.py => pass
    - diagnostics main.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md => pass
- ts: 2026-03-16T22:53:54.6362059+08:00
  phase: remeber
  items:
    - label: intake.scope
      fact: queue moved to health endpoint observability extension after batchD router split closure
      impact: current code change remained single runtime entrypoint in main.py
      next: keep endpoint contract backward-compatible while adding optional fields
    - label: intake.example
      fact: code-examples directory is absent in workspace
      impact: implementation aligned with existing services imports and response dict style in main.py
      next: continue same-layer alignment for follow-up stability queue
    - label: intake.risk
      fact: health degraded now depends on async_docker/state_engine/scheduler/botshepherd signals
      impact: status may flip to degraded in environments where optional subsystem is intentionally stopped
      next: monitor production signal noise and tune degraded rules if needed
    - label: exec.ws_source
      fact: ws_public now uses ws_manager.connection_count instead of ws_router module variable
      impact: health endpoint no longer depends on route-local counter state
      next: keep ws public health source centralized in service layer
    - label: exec.scheduler_summary
      fact: scheduler summary now exposes total/failed/timeout and last_task snapshot
      impact: operators can inspect scheduler outcome without opening scheduler API separately
      next: consider adding run_count aggregates only if requested
    - label: exec.botshepherd_summary
      fact: botshepherd status fields are included in health payload as compact subset
      impact: subsystem lifecycle visibility is available from unified health endpoint
      next: keep field list stable to avoid frontend parser drift
    - label: verify.syntax
      fact: py_compile passed for main.py
      impact: health endpoint changes are syntax-safe
      next: preserve compile gate for every queue iteration
    - label: verify.ide
      fact: diagnostics returned no issues for changed code/docs files
      impact: incremental static gate remains green
      next: continue queue with same diagnostics scope discipline
    - label: docs.scope
      fact: overview/plan/task/INTERFACE/TREE/优化说明文档 updated in-place for batchE health extension
      impact: rolling docs remain single-source with no duplicated files
      next: append only incremental task logs in next queue step
    - label: summary.1
      fact: /api/health payload expanded with operation logger, scheduler and botshepherd summaries
      impact: observability coverage now matches optimization-doc 6.1 target list
      next: monitor response size and keep fields concise
    - label: summary.2
      fact: health status now supports degraded and degraded_reasons
      impact: infra probes can distinguish partial degradation from full failure
      next: define alert mapping per degraded reason if user asks
    - label: summary.3
      fact: ws_public metric source migrated to service-level connection_count
      impact: avoids reliance on ws router private module variable
      next: keep private-router symbol usage out of cross-module health APIs
    - label: summary.4
      fact: local gates (py_compile + diagnostics) are green for this batch
      impact: current queue step is safe to continue without rollback
      next: proceed to next runtime stability queue item
    - label: summary.5
      fact: docs/current/优化说明文档.md 6.1 section now includes completed marker and concrete field list
      impact: optimization backlog reflects current completion status
      next: select next non-completed queue item from doc section 6.x

- ts: 2026-03-16T23:45:24.8821881+08:00
  phase: intake
  evidence:
    - frontend/src/hooks/useWebSocket.ts:16-35 disconnect-reason-union-and-classify
    - frontend/src/hooks/useWebSocket.ts:63-71 exponential-backoff-with-jitter
    - frontend/src/hooks/usePublicWebSocket.ts:36-53 public-disconnect-reason-union-and-classify
    - frontend/src/layouts/AdminLayout.tsx:43-51 admin-layout-hook-return-consume
    - frontend/src/pages/UserDashboard.tsx:42-48 public-dashboard-hook-return-consume
    - frontend/src/i18n.ts:67-77,607-617 ws-retry-and-disconnect-reason-keys
    - docs/current/优化说明文档.md:694-703 ws-hook-resilience-target
    - code-examples: not found; aligned to same-layer implementation
- ts: 2026-03-16T23:45:24.8821881+08:00
  phase: implement
  target: frontend/src/hooks/useWebSocket.ts,frontend/src/hooks/usePublicWebSocket.ts,frontend/src/layouts/AdminLayout.tsx,frontend/src/pages/UserDashboard.tsx,frontend/src/i18n.ts,docs/current/*.md
  changes:
    - useWebSocket adds WSDisconnectReason, classifyClose, reconnectAttempt, lastDisconnectReason and exponential backoff+jitter reconnect scheduling
    - usePublicWebSocket adds PublicWSDisconnectReason, classifyClose, reconnectAttempt, lastDisconnectReason and exponential backoff+jitter reconnect scheduling
    - AdminLayout consumes wsReconnectAttempt/wsLastDisconnectReason and renders retry count + disconnect reason in sidebar status line
    - UserDashboard consumes wsReconnectAttempt/wsLastDisconnectReason and renders retry count + disconnect reason in header status line
    - i18n zh/en adds admin.wsRetry and admin.wsDisconnectReason.{unauthorized|capacity_limited|heartbeat_timeout|network_error|server_closed|manual_close|unknown}
    - docs/current/优化说明文档.md 6.7 marked completed with concrete file:line evidence and completion timestamp
    - docs/current/overview.md plan.md INTERFACE.md TREE.md updated to batchF ws-hook-resilience scope
    - no file under BotShepherd/ was modified in this batch
  evidence:
    - frontend/src/hooks/useWebSocket.ts:16-23,63-71,147
    - frontend/src/hooks/usePublicWebSocket.ts:36-42,81-89,176
    - frontend/src/layouts/AdminLayout.tsx:44-49,162-170
    - frontend/src/pages/UserDashboard.tsx:42-48,213-221
    - docs/current/优化说明文档.md:694-716
- ts: 2026-03-16T23:45:24.8821881+08:00
  phase: verify
  commands:
    - npm run build (frontend) => pass (vite build complete; built in 31.68s)
    - diagnostics frontend/src/hooks/useWebSocket.ts frontend/src/hooks/usePublicWebSocket.ts frontend/src/layouts/AdminLayout.tsx frontend/src/pages/UserDashboard.tsx frontend/src/i18n.ts docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md => pass
- ts: 2026-03-16T23:45:24.8821881+08:00
  phase: remeber
  items:
    - label: intake.scope
      fact: scope is limited to frontend ws hook resilience and rolling docs sync
      impact: no backend runtime contract or bs submodule code changed
      next: continue non-BS queue item only after 6.7 docs closure
    - label: intake.example
      fact: code-examples directory is absent in repository
      impact: implementation aligned against existing frontend hook/layout/dashboard patterns
      next: keep same-layer alignment for following frontend batches
    - label: intake.risk
      fact: ws disconnect reason rendering depends on i18n key completeness
      impact: missing key would show fallback text and reduce operability
      next: keep zh/en keys synchronized when reason enum expands
    - label: exec.hook.contract
      fact: both hooks now expose reconnectAttempt and lastDisconnectReason while retaining existing fields
      impact: consumers can adopt incremental UI enhancement without API break
      next: keep hook return object backward-compatible for existing callers
    - label: exec.reconnect.policy
      fact: fixed interval reconnect was replaced by capped exponential backoff plus jitter
      impact: reduces reconnect storm pressure during service outage windows
      next: tune max interval/jitter only if production reconnect latency requires adjustment
    - label: exec.ui.visibility
      fact: admin and user dashboards now show disconnected retry count and reason
      impact: front-end observable state improves troubleshooting without opening browser devtools
      next: if needed, surface last connected timestamp in a later enhancement
    - label: verify.frontend.build
      fact: frontend npm run build completed successfully
      impact: ts/react integration and bundle generation remain valid after hook contract expansion
      next: preserve build gate for each queued frontend change
    - label: verify.ide
      fact: diagnostics returned no issues for all changed frontend and docs files
      impact: static quality gate is green for this batch
      next: continue queue with same diagnostics scope discipline
    - label: docs.optimization67
      fact: optimization doc section 6.7 now contains completed marker with timestamp and evidence lines
      impact: backlog status is synchronized with actual implemented code
      next: mark next completed item only after evidence and gates are recorded
    - label: summary.1
      fact: batchF frontend websocket hook resilience target is implemented
      impact: reconnect behavior and disconnect observability meet optimization-doc 6.7 goals
      next: proceed to next non-BS optimization candidate
    - label: summary.2
      fact: no BotShepherd submodule source file changed in this batch
      impact: change boundary follows user constraint exactly
      next: keep explicit no-BS flag in plan for next rounds
    - label: summary.3
      fact: i18n ws retry/reason keys were added in both zh and en locales
      impact: UI reason labels are translatable and avoid hardcoded strings
      next: maintain key parity when adding new disconnect reasons
    - label: summary.4
      fact: local quality gates are green (frontend build + diagnostics)
      impact: batch can be merged without rollback
      next: retain rollback command in overview/plan for safety
    - label: summary.5
      fact: rolling docs overview/plan/task/interface/tree/optimization are updated in-place
      impact: single-source documentation remains current without duplicate files
      next: append incremental task logs only in future iterations
