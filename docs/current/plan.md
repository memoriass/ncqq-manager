# plan
- retrieval:
  - services/container_state.py:19-39 _trigger_bs_inject(name, result, prev)
  - services/container_state.py:247-311 ContainerStateEngine._tick_once 登录判定与注入触发点
  - services/napcat_ws_service.py:267-350 _resolve_known_uin + check_via_bs
  - services/docker_lifecycle.py:40-70 _on_login_detected 幂等注入门控
  - services/docker_login.py:24-33 read_login_cache 只读缓存入口
- changes:
  - services/container_state.py: _trigger_bs_inject 改为“仅依赖登录判定结果(result.logged_in+uin)”触发；调用点传入检测前 prev_login_state，避免读取已更新 inst 导致 prev 失真
  - services/napcat_ws_service.py: 新增 _resolve_known_uin(name)；BS 辅助检测在 WS 无 uin 时，回退 instance_subsystem.uin 与 login_cache.uin
  - services/napcat_ws_service.py: uin 未解析时返回 method=bs_api, reason=uin_unknown，便于生产定位
- verify:
  - python -m py_compile services/container_state.py services/napcat_ws_service.py services/docker_lifecycle.py services/docker_async.py → OK
- rollback:
  - git restore services/container_state.py services/napcat_ws_service.py docs/current/plan.md docs/current/task.md docs/current/overview.md INTERFACE.md

