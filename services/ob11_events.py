"""
OneBot v11 结构化事件类型

参考 napcat-sdk 事件类型体系，为 ncqq-manager 提供轻量级事件解析。
仅覆盖管理器实际使用的事件类型，不追求 100% 覆盖。

用法：
    event = parse_ob11_event(raw_dict)
    if isinstance(event, HeartbeatEvent):
        ...
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


# ---------------------------------------------------------------------------
# 基础事件
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class OB11Event:
    """OneBot v11 事件基类"""
    post_type: str
    self_id: str  # 规范化为 str
    raw: Dict[str, Any] = field(repr=False)


# ---------------------------------------------------------------------------
# meta_event — 元事件
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class HeartbeatEvent(OB11Event):
    """心跳事件 (meta_event.heartbeat)"""
    interval: int = 30000  # ms
    online: bool = True
    status: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LifecycleEvent(OB11Event):
    """生命周期事件 (meta_event.lifecycle)"""
    sub_type: str = ""  # connect / disconnect / enable / disable


# ---------------------------------------------------------------------------
# notice — 通知事件
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class BotOfflineNotice(OB11Event):
    """Bot 离线通知 (notice.bot_offline)"""
    tag: str = ""
    message: str = ""


# ---------------------------------------------------------------------------
# message — 消息事件
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class MessageEvent(OB11Event):
    """消息事件基类"""
    message_type: str = ""  # private / group
    message_id: int = 0
    user_id: str = ""
    message: Any = ""  # str 或 list[segment]
    raw_message: str = ""
    time: int = 0
    sender: Dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class GroupMessageEvent(MessageEvent):
    """群消息事件 (message.group)"""
    group_id: str = ""
    anonymous: Optional[Dict[str, Any]] = None
    sub_type: str = "normal"  # normal / anonymous / notice


@dataclass(slots=True)
class PrivateMessageEvent(MessageEvent):
    """私聊消息事件 (message.private)"""
    sub_type: str = "friend"  # friend / group / other


# ---------------------------------------------------------------------------
# 其他通知事件（扩展用）
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class GroupNoticeEvent(OB11Event):
    """群通知事件（群成员变动、禁言等）"""
    notice_type: str = ""
    group_id: str = ""
    user_id: str = ""
    sub_type: str = ""


# ---------------------------------------------------------------------------
# 解析入口
# ---------------------------------------------------------------------------


def parse_ob11_event(data: Dict[str, Any], fallback_sid: str = "") -> Optional[OB11Event]:
    """将原始 dict 解析为结构化事件对象。

    Args:
        data: OneBot 事件原始 JSON dict
        fallback_sid: 当事件中无 self_id 时的备用值（来自 WS header）

    Returns:
        结构化事件对象，不可识别时返回 OB11Event 基类实例；
        完全无效数据返回 None。
    """
    if not isinstance(data, dict):
        return None

    post_type = data.get("post_type", "")
    if not post_type:
        return None

    raw_sid = data.get("self_id") or fallback_sid
    if not raw_sid:
        return None
    sid = str(raw_sid)
    if sid == "0":
        return None  # BS 探测哑值

    if post_type == "meta_event":
        meta_type = data.get("meta_event_type", "")
        if meta_type == "heartbeat":
            status_data = data.get("status", {})
            return HeartbeatEvent(
                post_type=post_type,
                self_id=sid,
                raw=data,
                interval=data.get("interval", 30000),
                online=bool(status_data.get("online", True)),
                status=status_data,
            )
        if meta_type == "lifecycle":
            return LifecycleEvent(
                post_type=post_type,
                self_id=sid,
                raw=data,
                sub_type=data.get("sub_type", ""),
            )

    elif post_type == "notice":
        notice_type = data.get("notice_type", "")
        if notice_type == "bot_offline":
            return BotOfflineNotice(
                post_type=post_type,
                self_id=sid,
                raw=data,
                tag=data.get("tag", ""),
                message=data.get("message", ""),
            )
        return GroupNoticeEvent(
            post_type=post_type,
            self_id=sid,
            raw=data,
            notice_type=notice_type,
            group_id=str(data.get("group_id", "")),
            user_id=str(data.get("user_id", "")),
            sub_type=data.get("sub_type", ""),
        )

    elif post_type == "message":
        message_type = data.get("message_type", "")
        base_kwargs = dict(
            post_type=post_type,
            self_id=sid,
            raw=data,
            message_type=message_type,
            message_id=data.get("message_id", 0),
            user_id=str(data.get("user_id", "")),
            message=data.get("message", ""),
            raw_message=data.get("raw_message", ""),
            time=data.get("time", 0),
            sender=data.get("sender", {}),
        )
        if message_type == "group":
            return GroupMessageEvent(
                **base_kwargs,
                group_id=str(data.get("group_id", "")),
                anonymous=data.get("anonymous"),
                sub_type=data.get("sub_type", "normal"),
            )
        if message_type == "private":
            return PrivateMessageEvent(
                **base_kwargs,
                sub_type=data.get("sub_type", "friend"),
            )
        # 未知消息类型，返回基类
        return MessageEvent(**base_kwargs)

    # 未识别的 post_type，返回基类
    return OB11Event(post_type=post_type, self_id=sid, raw=data)
