# INTERFACE.md
Updated: 2026-03-28T18:00:00Z

## Bot API 对外代理接口（routers/bot_api_router.py）

供 AstrBot 插件或外部系统查询/操作已连接 Bot 状态与 OneBot API。
认证方式与管理 API 一致（Cookie 或 API Key）。

```
GET  /api/bots
    → List[BotStatusItem]
    BotStatusItem: {name, uin, nickname, connected: bool, last_seen: float}

GET  /api/bots/{name}/status
    → BotStatusItem
    404 if Bot 未知或从未连接

POST /api/bots/{name}/call
    Body: {action: str, params: {}, timeout?: float=10.0}
    → {status: "ok", data: any}
    503 if Bot 未连接；502 if API 调用失败/超时

POST /api/bots/{name}/send
    Body: {msg_type: "private"|"group", target_id: str, message: str}
    → {status: "ok", message_id: int}
    503 if Bot 未连接；502 if 发送失败
```

## WS 端点（routers/ws_router.py）

```
WS /ws/napcat/{name}       NapCat 反向 WS 主路径（BS 代理长连接落脚点）
WS /ws/onebot/v11/ws       旧兼容路径（存量 BS 配置可继续使用）
WS /ws/logs                管理器实时日志推送
```

## 告警规则（services/alert_manager.py）

```
qq_bot 规则配置结构（v2，向后兼容 v1）：
{
  "type": "qq_bot",
  "enabled": true,
  "config": {
    "sender_bots": ["mili2", "mili3"],     # 哨兵数组，依次尝试（v2 新增）
    "sender_bot": "mili2",                  # 旧字段，兼容保留
    "targets": [                            # 多目标并发（v2 新增）
      {"msg_type": "private", "target_id": "12345678"},
      {"msg_type": "group",   "target_id": "87654321"}
    ],
    "msg_type": "private",                  # 旧字段，兼容保留
    "target_id": "12345678"                 # 旧字段，兼容保留
  }
}
```

## 全局配置项（app_config / services/config.py）

```
init_ws_client_enabled             bool    是否启用 WS 客户端自动注入
init_bs_enabled                    bool    是否启用 BotShepherd 自动接管
init_bs_napcat_host                str     宿主机 IP（NapCat 容器连 BS 用）
init_bs_client_base_port           int     BS 监听端口起始值
init_bs_targets                    str     额外 target_endpoints JSON 数组
init_ws_client_token               str     WS 鉴权 token
init_auto_join_groups_enabled      bool    登录后自动发群通知开关（默认 False）
init_auto_join_groups              str     登录后自动发通知的群号列表 JSON（如 ["123456"]）
manager_port                       int     管理器监听端口（默认 8000）
webhook_base_url                   str     Webhook 基础 URL（用于生成 QR 扫码链接）
```

## NapCatApiProxy（services/napcat_ws_service.py）

```python
# 通过反向 WS 连接主动调用 OneBot API
proxy = napcat_ws_service.get_proxy("mili")
data = await proxy.call_action("get_login_info")

# 发消息
await napcat_ws_service.send_message("mili", "private", "12345678", "Hello")
```

