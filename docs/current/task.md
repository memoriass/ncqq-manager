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

# sdk-move+split 2026-03-28
- ts: 2026-03-28T15:24:00Z
- diff: +480/-422（docker_login.py新建313l；docker_lifecycle.py新建167l；docker_manager.py -422l精简为518l）
- commands: py_compile×5 → ALL_COMPILE=0；_verify.py → ALL CHECKS PASSED
- evidence: services/docker_login.py:1-333; services/docker_lifecycle.py:1-167; services/docker_manager.py L26,L58（class DockerManager(LoginMixin,LifecycleMixin)）
- remeber.exec.1: label=move | fact=napcat-sdk robocopy /MOVE → c:\git\napcat-sdk，165文件，源目录已清除 | impact=项目目录零残留，ws_router.py L26注释为唯一引用（无代码依赖）| next=无
- remeber.exec.2: label=split | fact=docker_manager.py 988→518行(-47%)；登录检测→docker_login.py LoginMixin；BS注入+自动通知→docker_lifecycle.py LifecycleMixin | impact=单文件≤800行规范全满足 | next=无
- remeber.exec.3: label=mro | fact=DockerManager(LoginMixin,LifecycleMixin)，23个方法全部可解析；update_login_cache懒加载避免循环导入 | impact=对外接口不变，read_login_cache/check_login_status等调用方无感 | next=部署验证


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

# multi-target-api 2025-07-13
- ts: 2025-07-13T16:00:00Z
- diff: alert_manager.py +63/-24（_dispatch_qq_bot_rules 多哨兵+多目标+BugFix）；bot_api_router.py 新建122l；main.py +2（注册bot_api_router）；docker_async.py +8（DEPRECATED注释）；docker_manager.py +37（init_auto_join_groups 自动加群通知）；INTERFACE.md 新建
- commands: py_compile×5 → ALL_OK=0；行数 360/122/349/624/987（均通过）
- evidence: services/alert_manager.py:259-321; routers/bot_api_router.py:1-122; main.py:36-37,219-220; services/docker_async.py:74-81,238-242; services/docker_manager.py:857-895
- remeber.multi.1: label=qq-notify-v2 | fact=_dispatch_qq_bot_rules 支持 sender_bots 数组轮询（任一成功即止）+ targets 数组并发发送（私聊+群聊同时） | impact=哨兵轮询消除单点失败；并发多目标无额外等待 | next=配置 targets 数组验证
- remeber.multi.2: label=bot-api | fact=新建 /api/bots 路由：GET列表/状态、POST代理call/send；认证同管理API；复用NapCatApiProxy | impact=AstrBot插件可查询Bot状态并发指令；无额外连接开销 | next=AstrBot插件对接 GET /api/bots
- remeber.multi.3: label=auto-join | fact=init_auto_join_groups 配置群号数组，登录后延迟5s等WS代理就绪，向各群发上线通知；Bot不在群内时静默忽略错误 | impact=通知管理员Bot已上线；实际加群仍需管理员操作（OneBot无主动加群API） | next=部署后配置 init_auto_join_groups=["群号"]

# sdk-remove 2025-07-13
- ts: 2025-07-13T16:30:00Z
- diff: routers/ws_router.py -40行（移除 sys/os import + SDK import块13l + SDK分发路径28l；去掉 fallback 日志标记；手写分发成唯一路径）
- commands: py_compile routers/ws_router.py → result=0；行数 369（<800）
- evidence: routers/ws_router.py:11-26（import简化）; ws_router.py:227-279（_handle_ob11_event 纯手写）
- remeber.sdk-rm.1: label=root-cause | fact=napcat-sdk 不可用，_SDK_AVAILABLE 永远 False，双路径 if/else 仅增加代码噪声 | impact=移除后逻辑更清晰，无任何功能损失 | next=无需回退
- remeber.sdk-rm.2: label=change | fact=删除 sys/os import + SDK try/import块 + if _SDK_AVAILABLE 整块；手写路径去掉 (fallback) 标记成正式路径；bot_offline 补充 tag/message 字段读取 | impact=ws_router 零外部依赖，启动时无 ImportWarning | next=可确认日志不再出现 SDK 警告
- remeber.sdk-rm.3: label=preserved | fact=NapCatApiProxy（echo机制）、register/unregister_proxy、_ob11_recv_loop echo路由、ws_napcat_named proxy注册 全部保留完整 | impact=主动 API 调用能力不受影响 | next=验证 /api/bots/{name}/call 仍正常

# frontend-qq-bot-switch 2026-03-28
- ts: 2026-03-28T16:00:00Z
- diff: +106/-15（AlertSettings.tsx+77l；ClusterSettings.tsx+25l；i18n.ts+32l；config.py+3l；docker_lifecycle.py+2l）
- commands: py_compile×2 → PY_COMPILE=0；tsc --noEmit → TSC=0
- evidence: frontend/src/pages/AlertSettings.tsx L87-105（qq_bot类型+辅助函数）L215-311（Dialog动态表单）; frontend/src/pages/ClusterSettings.tsx L14-45（接口/默认值）L405-453（自动通知卡片）; services/config.py L29-35,L56-60; services/docker_lifecycle.py L143-146
- remeber.exec.1: label=alert-qq-bot | fact=AlertSettings.tsx 新增 qq_bot 类型选项；Dialog 根据 type 动态渲染哨兵Bot列表+通知目标列表（+/-行可增删）；handleCreate 组装 sender_bots+targets 到 config | impact=前端首次支持完整 qq_bot 告警规则创建，与后端 _dispatch_qq_bot_rules 结构对齐 | next=部署验证新建规则后告警触发
- remeber.exec.2: label=auto-join-switch | fact=init_auto_join_groups_enabled 新注册运行时键（默认False）；docker_lifecycle.py L143 加 enabled 检查提前 return；ClusterSettings.tsx 新增可折叠开关卡片+多行群号编辑器 | impact=避免 Bot 不在群内时的错误日志；用户可按需启用 | next=启用时确保 Bot 已在对应群内
- remeber.exec.3: label=i18n | fact=中英文 alerts 块各新增 9 个键（typeQqBot/senderBots/targets/msgType等）；clusterConfig 块新增 5 个键（autoJoinGroupsTitle等）| impact=中英文切换均正常；tsc 类型检查通过 | next=无

# frontend-ui-refactor 2026-03-28
- ts: 2026-03-28T17:00:00Z
- diff: +60/-20（ClusterSettings.tsx: autoGroupsText→autoGroups string[]，卡片+mt:3，textarea→Stack逐行列表；AlertSettings.tsx: 双卡片布局+allowAllIp整合；i18n.ts: +webhookSection/qqBotSection/autoJoinGroupsAdd中英文键）
- commands: tsc --noEmit → TSC=0；npm run build → BUILD=0，✓ built in 29.05s
- evidence: ClusterSettings-BguiI9Rx.js 16.37kB；AlertSettings-CMzbvHN8.js 10.43kB；i18n.ts depth=0（花括号平衡），webhookSection count=2，qqBotSection count=2，autoJoinGroupsAdd count=2
- remeber.exec.1: label=cluster-ui | fact=ClusterSettings autoGroups改为string[]列表；卡片加mt:3间距；Stack逐行输入+删除+添加按钮（仿bsTargets模式） | impact=群号输入准确性提升，间距符合视觉规范 | next=无
- remeber.exec.2: label=alert-cards | fact=AlertSettings重构为双卡片：Webhook告警卡（含allowAllIp开关+container_stop/high_cpu规则列表）+ QQ Bot哨兵卡（qq_bot规则列表）；规则按type过滤分流 | impact=页面结构清晰，哨兵配置独立可见 | next=无
- remeber.exec.3: label=i18n-fix | fact=新增webhookSection/qqBotSection/autoJoinGroupsAdd中英文键；修复重复botshepherd块（L1138-1139重复→删除）导致的花括号不平衡（depth:1→0）；EOL统一LF | impact=tsc=0, BUILD=0 | next=无


# frontend-sentinel-uin 2026-03-28
- ts: 2026-03-28T18:00:00Z
- diff: +110/-80（AlertSettings.tsx: 全量重写419l；api.ts: +14l（BotStatusItem+botApi.list）；i18n.ts: +4l（addSentinel/noOnlineBots中英文）)
- commands: tsc --noEmit → TSC=0；npm run build → BUILD=0，✓ built in 29.32s
- evidence: AlertSettings-BQp9SO3o.js 12.14kB；i18n.ts depth=0，addSentinel count=2（zh+en），noOnlineBots count=1（zh）、count=1（en）
- remeber.exec.1: label=uin-id | fact=sender_bots 由昵称字符串改为 uin（QQ号）字符串数组；EMPTY_SENTINEL.selectedUins: string[]；handleSentinelCreate 直接传 sentinelForm.selectedUins | impact=消除昵称变动导致的哨兵失配；唯一标识稳定 | next=存量规则 sender_bots 如有昵称需手动迁移
- remeber.exec.2: label=sentinel-dialog | fact=QQ Bot哨兵卡片独立"添加哨兵"按钮（#7c3aed，SmartToyIcon）打开专用Dialog；顶部"新增规则"仅保留webhook逻辑；alertTypes移除qq_bot条目 | impact=两种规则创建路径完全分离，用户操作路径清晰 | next=无
- remeber.exec.3: label=bot-select | fact=openSentinelDialog调用botApi.list()→过滤connected&&uin→setOnlineBots；Select multiple+OutlinedInput+Checkbox多选显示uin+nickname；renderValue拼接uin列表 | impact=用户从在线Bot列表勾选，无需手动输入；空列表显示noOnlineBots提示 | next=部署后验证在线Bot列表加载


# login-stabilization-inject-gate 2026-03-28
- ts: 2026-03-28T10:06:07Z
- commit: [pending]
- diff: +73/-26（container_state.py +16/-5；napcat_ws_service.py +37/-8；plan/overview/INTERFACE 更新时间与内容刷新）
- commands: python -m py_compile services/container_state.py services/napcat_ws_service.py services/docker_lifecycle.py services/docker_async.py → PY_COMPILE=0
- evidence: services/container_state.py:19-39,267-277,301-311; services/napcat_ws_service.py:267-350; docs/current/plan.md:1-16; docs/current/overview.md:1-12; INTERFACE.md:1-2
- remeber.exec.1: label=inject-gate | fact=_trigger_bs_inject(name,result,prev) 增加 result.logged_in + result.uin 双门控 | impact=注入触发严格依赖登录判定，避免未登录误触发 | next=观察首次登录注入日志
- remeber.exec.2: label=prev-snapshot | fact=_tick_once 两处调用点均传入检测前 prev_login_state，不再由已更新 inst 反推 prev | impact=修复状态更新时序导致的 prev 失真，幂等比较可靠 | next=验证重复登录不重复注入
- remeber.exec.3: label=bs-uin-resolve | fact=check_via_bs 新增 _resolve_known_uin：WS表→instance_subsystem→login_cache 回退链 | impact=降低“BS connected 但实例未登录”的 uin 缺失概率 | next=线上检查 reason=uin_unknown 比例
- remeber.docs.1: label=plan | fact=docs/current/plan.md 覆盖为本轮检索/改动/验证/回滚 | impact=执行证据链完整 | next=提交后补 commit id
- remeber.docs.2: label=overview | fact=docs/current/overview.md 更新 scope/target/files/updated | impact=文档与当前改动一致 | next=后续版本继续滚动更新
- remeber.docs.3: label=interface | fact=INTERFACE.md 仅刷新 Updated 时间戳 | impact=满足 update-style 约束且不复制正文 | next=接口签名变更时再增补段落
- remeber.summary.1: label=root-cause | fact=BS API 查询依赖 uin 非容器名 | impact=无 uin 时只能 waiting | next=加强 name↔uin 建立
- remeber.summary.2: label=fix-core | fact=注入触发改为判定结果驱动并绑定 prev 快照 | impact=注入链路稳定可解释 | next=灰度观察
- remeber.summary.3: label=observability | fact=返回 reason=uin_unknown/method=bs_api | impact=可快速定位归属缺失 | next=接入日志统计
- remeber.summary.4: label=quality | fact=py_compile 四文件全绿 | impact=基础语法门通过 | next=上线前做场景回归
- remeber.summary.5: label=rollback | fact=单条 git restore 可回滚代码与文档 | impact=变更可逆 | next=发布窗口执行
