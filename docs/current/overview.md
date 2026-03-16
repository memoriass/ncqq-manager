# Overview

Updated: 2026-03-16T11:17:46Z

## Goal
- scope: batchD-container-router-split-in-progress-after-batchC-frontend-split
- modules: main.py,routers/container_router.py,routers/container_public_router.py,routers/container_config_router.py,docs/current/overview.md,docs/current/plan.md,docs/current/task.md,docs/current/INTERFACE.md,docs/current/TREE.md,docs/current/优化说明文档.md

## KPI
- container_router_public_routes_extracted: enabled
- container_router_config_routes_extracted: enabled
- container_router_route_registration_split: enabled
- container_router_single_file_size_reduced: enabled
- python_compile_main_container_routes: pass
- diagnostics_main_container_routes: 0
- docs_current_sync: enabled

## Rollback
- code: git restore main.py routers/container_router.py routers/container_public_router.py routers/container_config_router.py
- docs: git restore docs/current/overview.md docs/current/plan.md docs/current/task.md docs/current/INTERFACE.md docs/current/TREE.md docs/current/优化说明文档.md

