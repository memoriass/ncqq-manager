# overview
- scope: 登录判定稳态化（WS→BS→HTTP）+ 注入触发门控（仅登录成功且有uin）+ BS辅助检测uin多源回退
- target: 解决“BS connected 但实例未登录”场景；将注入触发严格绑定登录判定结果；增强无uin时可观测性（reason=uin_unknown）
- files:
  - services/container_state.py（_trigger_bs_inject签名与门控；_tick_once调用点传入prev快照）
  - services/napcat_ws_service.py（_resolve_known_uin；check_via_bs回退instance_subsystem/login_cache）
  - docs/current/plan.md（本轮检索/变更/验证/回滚）
  - docs/current/task.md（本轮执行日志与证据）
  - INTERFACE.md（Updated时间戳刷新）
- rollback: git restore services/container_state.py services/napcat_ws_service.py docs/current/overview.md docs/current/plan.md docs/current/task.md INTERFACE.md
- updated: 2026-03-28T10:06:07Z

