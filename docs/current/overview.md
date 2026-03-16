# Overview

Updated: 2026-03-17T00:05:39.9388881+08:00

## Goal
- scope: batchG-public-endpoint-rate-protection
- modules: middleware/rate_limiter.py,routers/container_public_router.py,routers/container_runtime_router.py,routers/backup_router.py,routers/node_router.py,routers/ws_router.py,docs/current/overview.md,docs/current/plan.md,docs/current/task.md,docs/current/INTERFACE.md,docs/current/TREE.md,docs/current/优化说明文档.md
- constraint.no_bs_submodule_change: true

## KPI
- public_http_rate_limit: public-containers,public-qr-batch,public-containers-page,container-qrcode
- admin_sensitive_rate_limit: backup-download,backup-upload,node-proxy
- public_ws_handshake_rate_limit: enabled
- rate_limiter_public_factory: public_speed_limit,websocket_public_speed_limit
- python_compile_changed_files: pass
- diagnostics_changed_files: 0
- docs_current_sync: enabled

## Rollback
- code: git restore middleware/rate_limiter.py routers/container_public_router.py routers/container_runtime_router.py routers/backup_router.py routers/node_router.py routers/ws_router.py
- docs: git restore docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md
