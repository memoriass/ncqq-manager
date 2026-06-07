export const backup = {
    "title": "备份与恢复",
    "subtitle": "导出或恢复管理器配置与实例配置",
    "dbInfo": "配置备份信息",
    "size": "大小",
    "lastModified": "最后修改",
    "download": "下载配置备份",
    "restore": "恢复配置备份",
    "uploading": "上传中...",
    "confirmRestore": "恢复操作将覆盖当前 config/ 与 data/<实例>/config/，确定继续吗？",
    "restoreSuccess": "恢复成功，请重启服务生效",
    "restoreFailed": "恢复失败",
    "hint": "建议定期备份。备份仅包含管理器 config/ 与各实例 data/<实例>/config/，不包含 qq_data 和其他运行时资源。"
} as const;
