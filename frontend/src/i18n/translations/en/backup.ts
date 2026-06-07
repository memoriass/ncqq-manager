export const backup = {
    "title": "Backup & Restore",
    "subtitle": "Export or restore manager config and instance config",
    "dbInfo": "Config Backup Info",
    "size": "Size",
    "lastModified": "Last Modified",
    "download": "Download Config Backup",
    "restore": "Restore Config Backup",
    "uploading": "Uploading...",
    "confirmRestore": "This will overwrite config/ and data/<instance>/config/. Continue?",
    "restoreSuccess": "Restore successful. Please restart to take effect.",
    "restoreFailed": "Restore failed",
    "hint": "Regular backups are recommended. Backup only includes manager config/ and each instance data/<instance>/config/, excluding qq_data and other runtime assets."
} as const;
