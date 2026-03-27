# plan
- retrieval:
  - services/napcat_ws_service.py:1-165 NapCatWsService（新建）
  - routers/ws_router.py:219-346 _handle_ob11_event/_ob11_recv_loop/ws_napcat_named/ws_onebot_receiver
  - services/docker_async.py:153-186 AsyncLoginChecker.check_login_status（三级级联）
  - services/container_state.py:14-32 _trigger_bs_inject（新增辅助函数）
  - services/container_state.py:247-300 ContainerStateEngine._tick_once（WS快速路径）
  - services/docker_manager.py:820-828 _on_login_detected（BS端点更新为/ws/napcat/{name}）
- changes:
  - services/napcat_ws_service.py: 新建 NapCatWsService 注册表，_ConnEntry，check_via_bs(BS辅助+TTL缓存)
  - routers/ws_router.py: 新增 /ws/napcat/{name} 主端点；抽取 _handle_ob11_event/_ob11_recv_loop；兼容旧 /ws/onebot/v11/ws
  - services/docker_async.py: check_login_status 改为三级 WS→BS→HTTP，弱化 WebUI/日志检测
  - services/container_state.py: 新增 _trigger_bs_inject 辅助；_tick_once 优先走 WS 快速路径，跳过 TTL 检查
  - services/docker_manager.py: _on_login_detected BS target_endpoints 更新为 /ws/napcat/{name} 主路径
- verify:
  - python -m py_compile services/napcat_ws_service.py routers/ws_router.py services/docker_async.py services/container_state.py services/docker_manager.py → ALL_OK
- rollback:
  - git restore services/napcat_ws_service.py routers/ws_router.py services/docker_async.py services/container_state.py services/docker_manager.py docs/current/plan.md docs/current/task.md

