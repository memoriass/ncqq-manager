# task
- ts: 2025-02-14T00:00:00Z
- intake:
  - codebase-retrieval: login state, qr state, async login chain, logs, frontend QR consumer
  - code-examples: missing
- remeber.intake.1: label=scope | fact=后端检测与前端展示均需改 | impact=跨前后端 | next=实现状态分层
- remeber.intake.2: label=signal | fact=已有异步日志接口 services/docker_async.py:416-428 | impact=可融合日志特征检测 | next=接入 check_login_webui
- remeber.intake.3: label=risk | fact=现有注入仍依赖 logged_in+uin | impact=本次先优化检测与展示不改事件主链 | next=后续推进方案1

# task-bs-sdk 2025
- ts: 2025-07-13T12:00:00Z
- commit: [pending]
- diff: +275/-70（napcat_ws_service新建165l；ws_router+127l；docker_async+18l；container_state+20l；docker_manager+2l）
- commands: py_compile×5 → ALL_OK
- evidence: services/napcat_ws_service.py:48-165; routers/ws_router.py:219-346; services/docker_async.py:153-186; services/container_state.py:14-32,247-300; services/docker_manager.py:820-828
- remeber.exec.1: label=arch | fact=新建 napcat_ws_service 注册表（WS→BS→HTTP三级）| impact=登录检测不再依赖NapCat内部路径 | next=部署验证心跳
- remeber.exec.2: label=endpoint | fact=/ws/napcat/{name}主路径+/ws/onebot/v11/ws兼容 | impact=BS target_endpoints自动更新为新路径 | next=NapCat容器预配置
- remeber.exec.3: label=fallback | fact=HTTP轮询降级为第3优先兜底，WebUI/日志检测不再调用 | impact=不依赖版本敏感接口 | next=存量容器手动触发一次注入
- remeber.exec.4: label=inject | fact=_trigger_bs_inject替代内联to_thread调用；BS端点升级为/ws/napcat/{name} | impact=注入链路完整可追溯 | next=监控首次login_detected日志
- remeber.exec.5: label=compat | fact=旧/ws/onebot/v11/ws保留；bs_cache TTL=10s；宽限期15s | impact=存量BS配置无需改动仍可用 | next=灰度验证后可退役兼容路径

# bugfix-bs-account-id 2025-07-13
- ts: 2025-07-13T13:00:00Z
- commit: [pending]
- diff: +14/-7（napcat_ws_service.py L120-L170）
- commands: py_compile → compile_result=0
- evidence: services/napcat_ws_service.py:138-153
- remeber.fix.1: label=root-cause | fact=check_via_bs(name)将容器名"mili"作为BS account_id传入，BS API要求QQ号(uin) | impact=BS辅助检测始终返回404/错误，logged_in=False | next=WS连接时on_connect写入uin后BS检测恢复正常
- remeber.fix.2: label=fix | fact=先从_table取known_uin；若uin未知直接降级waiting，跳过BS请求 | impact=消除错误参数；加_error响应过滤 | next=验证WS连接后uin写入注册表
- remeber.fix.3: label=flow | fact=check_via_bs仅在WS未连接时调用；WS断开宽限期15s内走get_login_result(ws_grace)，不走BS | impact=BS检测属于第二级兜底，uin依赖WS首次握手 | next=若WS从未连接过则需HTTP兜底

# bugfix-bs-probe-sid 2025-07-13
- ts: 2025-07-13T14:00:00Z
- commit: [pending]
- diff: +4/-2（ws_router.py L241-L243 + L330-L331）
- commands: py_compile → result=0
- evidence: routers/ws_router.py:241-244,329-332
- remeber.probe.1: label=root-cause | fact=BS probe_target_endpoint 握手头 X-Self-ID=0（哑值），管理器端点将"0"写入注册表 uin，污染 check_via_bs 的 known_uin | impact=后续 BS 辅助检测用 uin="0" 查 BS API → 404 → logged_in=False
- remeber.probe.2: label=fix | fact=ws_napcat_named 预注册时过滤 header_sid=="0"；_handle_ob11_event 分发时过滤 sid=="0" | impact=双重防护：连接握手层+事件分发层均拦截 BS 探测哑值
- remeber.probe.3: label=flow | fact=BS probe 短连后立即断开；不影响 BS 真正的代理长连接；NapCat 直连时 X-Self-ID 为真实 QQ 号 | impact=过滤后仍兼容 BS 代理长连与 NapCat 直连两条路径

# sdk-integration 2025-07-13
- ts: 2025-07-13T15:00:00Z
- diff: napcat_ws_service.py +76（NapCatApiProxy+register/unregister_proxy+call_action+send_message）；ws_router.py +67/-30（SDK import+match/case+echo路由+proxy注册）；alert_manager.py +56（notify_via_bot+_dispatch_qq_bot_rules）
- commands: py_compile×3 → ALL_OK=0；行数 255/350/287（均<800）
- evidence: services/napcat_ws_service.py:30-118,174-234; routers/ws_router.py:1-40,241-362,365-393; services/alert_manager.py:223-287
- remeber.sdk.1: label=api-proxy | fact=NapCatApiProxy 复用反向WS连接发 OneBot RPC（echo机制），无需额外连接 | impact=管理器可主动调用任意 OneBot API | next=配置 qq_bot 规则测试发消息
- remeber.sdk.2: label=event-parse | fact=ws_router 引入 NapCatEvent.from_dict + match/case；SDK 不可用时自动回退手写兜底 | impact=BotOfflineEvent.tag 可记录掉线原因 | next=扩展消息/请求类事件处理
- remeber.sdk.3: label=qq-notify | fact=alert_manager 新增 qq_bot 规则类型，哨兵Bot掉线时发QQ消息通知 | impact=QQ消息通知比Webhook更直达；需哨兵Bot在线 | next=见下方"Bot掉线通知设计意见"

