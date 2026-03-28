# overview
- scope: BS优先 + 手写WS事件分发注册表（WS→BS→HTTP三级）+ NapCatApiProxy + QQ Bot通知渠道 + Bot对外API + 自动加群通知
- target: 登录/离线检测脱离NapCat内部接口；主路径WS直连心跳；次路径BS账号API；兜底OneBot HTTP；新增主动API调用（NapCatApiProxy echo机制）、手写OneBot事件分发（无外部依赖）、Bot掉线QQ消息通知（多哨兵轮询+多目标并发）、AstrBot插件对外查询API、登录后自动加群通知
- files:
  - services/napcat_ws_service.py（NapCatApiProxy + register/unregister_proxy + call_action + send_message）
  - routers/ws_router.py（手写OneBot事件分发 + echo路由 + proxy注册，无SDK依赖）
  - services/alert_manager.py（notify_via_bot + _dispatch_qq_bot_rules 多哨兵+多目标）
  - services/docker_async.py（check_login_status三级改写；check_login_webui/_detect_login_stage_from_logs 标记DEPRECATED）
  - services/container_state.py（WS快速路径+_trigger_bs_inject）
  - services/docker_manager.py（BS端点升级为/ws/napcat/{name}；init_auto_join_groups 自动加群通知）
  - routers/bot_api_router.py（新建：/api/bots 对外 Bot API 路由）
  - main.py（注册 bot_api_router）
  - INTERFACE.md（新建：接口签名文档）
- rollback: git restore services/napcat_ws_service.py routers/ws_router.py services/alert_manager.py services/docker_async.py services/container_state.py services/docker_manager.py routers/bot_api_router.py main.py INTERFACE.md
- updated: 2025-07-13T16:30:00Z

