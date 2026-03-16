# Plan

Updated: 2025-02-14T00:20:00Z

## Intake
- retrieval.hit.1: docs/current/优化说明文档.md:157 operation-log-context-guidance
- retrieval.hit.2: routers/user_router.py:106 api_assign_instances
- retrieval.hit.3: routers/node_router.py:56 save_cluster_config
- retrieval.hit.4: services/cluster_manager.py:252 _proxy_to_node_async
- example.status: code-examples/ not found; aligned to existing same-layer implementation

## AffectedFiles
- routers/backup_router.py:_validate_zip_members/api_backup_download/api_restore_backup L46-L183 ~±55
- services/operation_log_context.py:build_operator_payload L10-L22 ~+22
- routers/user_router.py:api_create_user/api_edit_user/api_delete_user/api_assign_instances/api_regenerate_apikey L47-L156 ~±55
- routers/node_router.py:save_cluster_config/api_add_node/api_edit_node/api_delete_node/get_node_logs/proxy_node_request L57-L279 ~±70
- services/cluster_manager.py:proxy_to_node_async L252-L262 ~+11
- docs/current/overview.md:update sections
- docs/current/plan.md:update sections
- docs/current/task.md:append log entries
- docs/current/INTERFACE.md:update signatures
- docs/current/TREE.md:regenerate timestamp and paths

## Constraints
- no_public_api_break_except_proxy_method_wrapper_added: true
- no_test_files: true
- function_max_lines_target: <=180
- file_max_lines_target: <=800
- cross_layer_dependency_change: 0

## Commands
- python-check: python -m py_compile services/operation_log_context.py routers/user_router.py routers/node_router.py services/cluster_manager.py
- diagnostics: IDE diagnostics on changed files

## RemainingQueue
- batchA.backup_router: completed code changes; pending broader batch verification
- batchA.operation_log_context: completed helper and router integration
- batchA.user_router_audit: completed instances/apikey audit
- batchA.node_router_audit: completed cluster config + node edit audit + private proxy call cleanup
- batchB.operation_logs_query: services/operation_logger.py + routers/operation_logs_router.py + frontend log page wiring
- batchC.ws_manager: services/ws_manager.py lock-outside-send + routers/ws_router.py public count/hash optimization
- batchC.scheduler: services/scheduler.py running_tasks + timeout + result fields + retention

## Checkpoints
- cp1: services/operation_log_context.py provides build_operator_payload(request, session, extra)
- cp2: routers/user_router.py logs instances/apikey mutations without API key plaintext in payload
- cp3: routers/node_router.py logs cluster_config_save and node_edit
- cp4: routers/node_router.py contains no cluster_manager._proxy_to_node_async call site
- cp5: services/cluster_manager.py exposes proxy_to_node_async wrapper

## Rollback
- command: git restore routers/backup_router.py services/operation_log_context.py routers/user_router.py routers/node_router.py services/cluster_manager.py docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md

