export const EMPTY_FORM = {
    name: '',
    type: 'instance_offline',
    webhook_url: '',
};

export const EMPTY_SMTP = {
    smtp_enabled: false,
    smtp_host: 'smtp.qq.com',
    smtp_port: 465,
    smtp_username: '',
    smtp_password: '',
    smtp_auth_mode: 'auto',
    smtp_sender: '',
    smtp_sender_name: 'NapCat Manager',
    smtp_reply_to: '',
    smtp_recipients: '',
    smtp_use_ssl: true,
    smtp_use_tls: false,
    smtp_verify_tls: true,
    smtp_timeout_sec: 15,
    smtp_qrcode: true,
    smtp_subject_prefix: '[NapCat 掉线告警]',
};

export const QQ_SMTP_DEFAULTS = {
    smtp_host: 'smtp.qq.com',
    smtp_port: 465,
    smtp_use_ssl: true,
    smtp_use_tls: false,
};

export const SMTP_PROVIDER_PRESETS: Record<string, { host: string; port: number; use_ssl: boolean; use_tls: boolean }> = {
    qq: { host: 'smtp.qq.com', port: 465, use_ssl: true, use_tls: false },
    netease163: { host: 'smtp.163.com', port: 465, use_ssl: true, use_tls: false },
    gmail: { host: 'smtp.gmail.com', port: 587, use_ssl: false, use_tls: true },
    outlook: { host: 'smtp.office365.com', port: 587, use_ssl: false, use_tls: true },
};

export const EMPTY_QQ_NOTIFY = {
    selectedNames: [] as string[],
    msg_type: 'private' as string,
    target_id: '',
};

export const EMPTY_SMTP_NOTIFY = {
    selectedNames: [] as string[],
    recipients: '',
};
