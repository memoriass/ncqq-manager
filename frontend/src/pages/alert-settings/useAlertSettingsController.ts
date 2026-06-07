import { useEffect, useState } from 'react';
import { alertApi, containerApi, type AlertRule, type Container } from '../../services/api';
import { useTranslate } from '../../i18n';
import { useToast } from '../../components/Toast';
import {
    EMPTY_FORM, EMPTY_QQ_NOTIFY, EMPTY_SMTP, EMPTY_SMTP_NOTIFY,
    QQ_SMTP_DEFAULTS, SMTP_PROVIDER_PRESETS,
} from './constants';
import type { QqBotTarget } from './types';

export function useAlertSettingsController() {
    const t = useTranslate();
    const toast = useToast();
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [allowAllIp, setAllowAllIp] = useState(false);
    const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
    const [smtpForm, setSmtpForm] = useState({ ...EMPTY_SMTP });
    const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
    const [smtpAdvancedOpen, setSmtpAdvancedOpen] = useState(false);
    const [smtpProvider, setSmtpProvider] = useState('qq');
    // QQ 通知专用 Dialog
    const [qqNotifyOpen, setQqNotifyOpen] = useState(false);
    const [qqNotifyForm, setQqNotifyForm] = useState({ ...EMPTY_QQ_NOTIFY });
    const [qqNotifyEditId, setQqNotifyEditId] = useState<string | null>(null);
    const [smtpNotifyOpen, setSmtpNotifyOpen] = useState(false);
    const [smtpNotifyForm, setSmtpNotifyForm] = useState({ ...EMPTY_SMTP_NOTIFY });
    const [instances, setInstances] = useState<Container[]>([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const applyQqDefaultsIfMissing = (prev: typeof EMPTY_SMTP) => {
        if (prev.smtp_host && prev.smtp_port) return prev;
        return {
            ...prev,
            smtp_host: prev.smtp_host || QQ_SMTP_DEFAULTS.smtp_host,
            smtp_port: prev.smtp_port || QQ_SMTP_DEFAULTS.smtp_port,
            smtp_use_ssl: prev.smtp_use_ssl ?? QQ_SMTP_DEFAULTS.smtp_use_ssl,
            smtp_use_tls: prev.smtp_use_tls ?? QQ_SMTP_DEFAULTS.smtp_use_tls,
        };
    };

    const fetchData = async () => {
        try {
            const [rulesData, settingsData] = await Promise.all([
                alertApi.listRules(), alertApi.getSettings(),
            ]);
            setRules(rulesData.rules || []);
            setAllowAllIp(settingsData.allow_local_webhook ?? false);
            setWebhookBaseUrl(settingsData.webhook_base_url ?? '');
            setSmtpPasswordSet(settingsData.smtp_password_set ?? false);
            setSmtpForm({
                smtp_enabled: settingsData.smtp_enabled ?? false,
                smtp_host: settingsData.smtp_host || 'smtp.qq.com',
                smtp_port: Number(settingsData.smtp_port ?? 465) || 465,
                smtp_username: settingsData.smtp_username ?? '',
                smtp_password: '',
                smtp_auth_mode: settingsData.smtp_auth_mode ?? 'auto',
                smtp_sender: settingsData.smtp_sender ?? '',
                smtp_sender_name: settingsData.smtp_sender_name ?? 'NapCat Manager',
                smtp_reply_to: settingsData.smtp_reply_to ?? '',
                smtp_recipients: settingsData.smtp_recipients ?? '',
                smtp_use_ssl: settingsData.smtp_use_ssl ?? true,
                smtp_use_tls: settingsData.smtp_use_tls ?? false,
                smtp_verify_tls: settingsData.smtp_verify_tls ?? true,
                smtp_timeout_sec: Number(settingsData.smtp_timeout_sec ?? 15) || 15,
                smtp_qrcode: settingsData.smtp_qrcode ?? true,
                smtp_subject_prefix: settingsData.smtp_subject_prefix ?? '[NapCat 掉线告警]',
            });
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const loadInstances = async () => {
        try {
            const res = await containerApi.list();
            setInstances(res.containers.filter(c => c.name));
        } catch (e) { console.error(e); }
    };

    const openQqNotifyDialog = async (rule?: AlertRule) => {
        if (rule) {
            const cfg = rule.config as Record<string, unknown>;
            const bots = (cfg.sender_bots as string[] | undefined) ?? [];
            const targets = (cfg.targets as QqBotTarget[] | undefined) ?? [{ msg_type: 'private', target_id: '' }];
            const tgt = targets[0] ?? { msg_type: 'private', target_id: '' };
            setQqNotifyForm({ selectedNames: bots, msg_type: tgt.msg_type, target_id: tgt.target_id });
            setQqNotifyEditId(rule.id);
        } else {
            setQqNotifyForm({ ...EMPTY_QQ_NOTIFY });
            setQqNotifyEditId(null);
        }
        setQqNotifyOpen(true);
        await loadInstances();
    };

    const openSmtpNotifyDialog = async () => {
        setSmtpNotifyForm({ ...EMPTY_SMTP_NOTIFY });
        setSmtpNotifyOpen(true);
        await loadInstances();
    };

    const handleCreate = async () => {
        if (!form.name) return;
        try {
            await alertApi.createRule({
                name: form.name,
                type: form.type,
                config: {},
                webhook_url: form.webhook_url,
            });
            setCreateOpen(false);
            setForm({ ...EMPTY_FORM });
            fetchData();
        } catch (e) { console.error(e); }
    };

    const handleQqNotifySave = async () => {
        if (qqNotifyForm.selectedNames.length === 0 || !qqNotifyForm.target_id) return;
        const config = {
            sender_bots: qqNotifyForm.selectedNames,
            targets: [{ msg_type: qqNotifyForm.msg_type, target_id: qqNotifyForm.target_id }],
        };
        try {
            if (qqNotifyEditId) {
                await alertApi.updateRule(qqNotifyEditId, { config });
            } else {
                const autoName = `qq_notify_${qqNotifyForm.selectedNames[0]}_${Date.now()}`;
                await alertApi.createRule({ name: autoName, type: 'qq_bot', config, webhook_url: '' });
            }
            setQqNotifyOpen(false);
            setQqNotifyForm({ ...EMPTY_QQ_NOTIFY });
            setQqNotifyEditId(null);
            fetchData();
        } catch (e) { console.error(e); }
    };

    const handleSmtpNotifyCreate = async () => {
        if (smtpNotifyForm.selectedNames.length === 0 || !smtpNotifyForm.recipients) return;
        try {
            for (const name of smtpNotifyForm.selectedNames) {
                const config = { instance_name: name, smtp_recipients: smtpNotifyForm.recipients };
                await alertApi.createRule({ name: `smtp_email_${name}_${Date.now()}`, type: 'login_lost', config, webhook_url: '' });
            }
            setSmtpNotifyOpen(false);
            setSmtpNotifyForm({ ...EMPTY_SMTP_NOTIFY });
            fetchData();
        } catch (e) { console.error(e); }
    };

    const handleToggle = async (rule: AlertRule) => {
        await alertApi.updateRule(rule.id, { enabled: !rule.enabled });
        fetchData();
    };

    const handleDelete = (id: string) => {
        setDeleteConfirmId(id);
    };

    const confirmDelete = async () => {
        if (!deleteConfirmId) return;
        await alertApi.deleteRule(deleteConfirmId);
        setDeleteConfirmId(null);
        fetchData();
    };

    const handleAllowAllIpToggle = async () => {
        const newVal = !allowAllIp;
        setAllowAllIp(newVal);
        try {
            await alertApi.updateSettings({ allow_local_webhook: newVal });
        } catch (e) {
            console.error(e);
            setAllowAllIp(!newVal);
        }
    };

    const saveSmtpSettings = async () => {
        const payload: Record<string, unknown> = { ...smtpForm, webhook_base_url: webhookBaseUrl };
        // 简洁模式下未填写用户名时，默认使用发件邮箱作为 SMTP 登录用户名
        if (!smtpForm.smtp_username && smtpForm.smtp_sender) {
            payload.smtp_username = smtpForm.smtp_sender;
        }
        if (!smtpForm.smtp_password) delete payload.smtp_password;
        try {
            await alertApi.updateSettings(payload);
            toast.success(t('alerts.smtpSaved'));
            fetchData();
        } catch (e) {
            toast.error(t('alerts.saveFailed'));
            console.error(e);
        }
    };

    const applyProviderPreset = (provider: string) => {
        const preset = SMTP_PROVIDER_PRESETS[provider];
        if (!preset) return;
        setSmtpProvider(provider);
        setSmtpForm(prev => ({
            ...prev,
            smtp_host: preset.host,
            smtp_port: preset.port,
            smtp_use_ssl: preset.use_ssl,
            smtp_use_tls: preset.use_tls,
        }));
    };

    return {
        rules,
        loading,
        createOpen,
        setCreateOpen,
        form,
        setForm,
        allowAllIp,
        webhookBaseUrl,
        setWebhookBaseUrl,
        smtpForm,
        setSmtpForm,
        smtpPasswordSet,
        smtpAdvancedOpen,
        setSmtpAdvancedOpen,
        smtpProvider,
        qqNotifyOpen,
        setQqNotifyOpen,
        qqNotifyForm,
        setQqNotifyForm,
        qqNotifyEditId,
        setQqNotifyEditId,
        smtpNotifyOpen,
        setSmtpNotifyOpen,
        smtpNotifyForm,
        setSmtpNotifyForm,
        instances,
        deleteConfirmId,
        setDeleteConfirmId,
        applyQqDefaultsIfMissing,
        openQqNotifyDialog,
        openSmtpNotifyDialog,
        handleCreate,
        handleQqNotifySave,
        handleSmtpNotifyCreate,
        handleToggle,
        handleDelete,
        confirmDelete,
        handleAllowAllIpToggle,
        saveSmtpSettings,
        applyProviderPreset,
    };
}
