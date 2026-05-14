import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Paper, IconButton, Switch,
    useTheme, CircularProgress, Dialog, DialogTitle, DialogContent,
    DialogActions, Select, MenuItem, FormControl, InputLabel,
    Card, CardContent, FormControlLabel, Stack,
    Checkbox, OutlinedInput, ListItemIcon, ListItemText, Avatar, Grid,
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EmailIcon from '@mui/icons-material/Email';

import { alertApi, containerApi, type AlertRule, type Container } from '../services/api';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';

interface QqBotTarget { msg_type: string; target_id: string; }

const EMPTY_FORM = {
    name: '',
    type: 'instance_offline',
    webhook_url: '',
};

const EMPTY_SMTP = {
    smtp_enabled: false,
    smtp_host: '',
    smtp_port: 465,
    smtp_username: '',
    smtp_password: '',
    smtp_sender: '',
    smtp_sender_name: 'NapCat Manager',
    smtp_recipients: '',
    smtp_use_ssl: true,
    smtp_use_tls: false,
    smtp_subject_prefix: '[NapCat 掉线告警]',
};

const EMPTY_QQ_NOTIFY = {
    selectedNames: [] as string[],
    msg_type: 'private' as string,
    target_id: '',
};

const EMPTY_SMTP_NOTIFY = {
    selectedNames: [] as string[],
    recipients: '',
};

export default function AlertSettings() {
    const theme = useTheme();
    const t = useTranslate();
    const toast = useToast();
    const isDark = theme.palette.mode === 'dark';
    const glass = {
        background: isDark ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(16px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
    };

    const [rules, setRules] = useState<AlertRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ ...EMPTY_FORM });
    const [allowAllIp, setAllowAllIp] = useState(false);
    const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
    const [smtpForm, setSmtpForm] = useState({ ...EMPTY_SMTP });
    const [smtpPasswordSet, setSmtpPasswordSet] = useState(false);
    // QQ 通知专用 Dialog
    const [qqNotifyOpen, setQqNotifyOpen] = useState(false);
    const [qqNotifyForm, setQqNotifyForm] = useState({ ...EMPTY_QQ_NOTIFY });
    const [qqNotifyEditId, setQqNotifyEditId] = useState<string | null>(null);
    const [smtpNotifyOpen, setSmtpNotifyOpen] = useState(false);
    const [smtpNotifyForm, setSmtpNotifyForm] = useState({ ...EMPTY_SMTP_NOTIFY });
    const [instances, setInstances] = useState<Container[]>([]);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
                smtp_host: settingsData.smtp_host ?? '',
                smtp_port: Number(settingsData.smtp_port ?? 465),
                smtp_username: settingsData.smtp_username ?? '',
                smtp_password: '',
                smtp_sender: settingsData.smtp_sender ?? '',
                smtp_sender_name: settingsData.smtp_sender_name ?? 'NapCat Manager',
                smtp_recipients: settingsData.smtp_recipients ?? '',
                smtp_use_ssl: settingsData.smtp_use_ssl ?? true,
                smtp_use_tls: settingsData.smtp_use_tls ?? false,
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
        if (!smtpForm.smtp_password) delete payload.smtp_password;
        try {
            await alertApi.updateSettings(payload);
            toast.success('SMTP 设置已保存');
            fetchData();
        } catch (e) {
            toast.error('保存失败');
            console.error(e);
        }
    };

    const alertTypes: Record<string, string> = {
        instance_offline: t('alerts.typeInstanceOffline') || '实例停止/离线',
        login_lost: t('alerts.typeLoginLost') || '账号掉线/需扫码',
        instance_online: t('alerts.typeInstanceOnline') || '实例上线',
        container_stop: t('alerts.typeContainerStop'),
        high_cpu: t('alerts.typeHighCpu'),
        high_mem: t('alerts.typeHighMem'),
        login_failure: t('alerts.typeLoginFailure'),
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

    const qqBotRules = rules.filter(r => r.type === 'qq_bot');
    const webhookRules = rules.filter(r => r.type !== 'qq_bot' && !(r.type === 'login_lost' && (r.config as Record<string, unknown>)?.smtp_recipients && !r.webhook_url));
    const smtpRules = rules.filter(r => r.type === 'login_lost' && (r.config as Record<string, unknown>)?.smtp_recipients && !r.webhook_url);

    const rowSx = {
        p: 2, borderRadius: 2,
        bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* 页面标题 */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.1)', display: 'flex' }}>
                    <NotificationsActiveIcon sx={{ fontSize: 28, color: '#f59e0b' }} />
                </Box>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>告警设置</Typography>
                    <Typography variant="body2" color="text.secondary">{t('alerts.subtitle')}</Typography>
                </Box>
            </Box>

            {/* ── QQ 通知 section ── */}
            <Card elevation={0} sx={{ borderRadius: 3, mb: 3, ...glass }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>QQ 通知</Typography>
                        <Button variant="outlined" size="small" startIcon={<AddIcon />}
                            onClick={() => openQqNotifyDialog()}
                            sx={{ borderRadius: 2, borderColor: '#7c3aed', color: '#7c3aed', textTransform: 'none',
                                '&:hover': { borderColor: '#6d28d9', bgcolor: 'rgba(124,58,237,0.06)' } }}>
                            添加 QQ 通知
                        </Button>
                    </Box>

                    {qqBotRules.length === 0 ? (
                        <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
                            {t('alerts.noRules')}
                        </Typography>
                    ) : (
                        <Grid container spacing={2}>
                            {qqBotRules.map(rule => {
                                const cfg = rule.config as Record<string, unknown>;
                                const bots = (cfg.sender_bots as string[] | undefined) ?? [];
                                const targets = (cfg.targets as QqBotTarget[] | undefined) ?? [];
                                const tgt = targets[0];
                                const isGroup = tgt?.msg_type === 'group';
                                const avatarUrl = tgt
                                    ? isGroup
                                        ? `/api/resource/group_avatar/${tgt.target_id}`
                                        : `/api/resource/avatar/${tgt.target_id}`
                                    : undefined;
                                return (
                                    <Grid item key={rule.id} xs={6} sm={4} md={3} lg={2}>
                                        <Paper elevation={0} onClick={() => openQqNotifyDialog(rule)}
                                            sx={{
                                                p: 1.5, borderRadius: 2, cursor: 'pointer', textAlign: 'center',
                                                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                                                transition: 'all 0.15s',
                                                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                            }}>
                                            <Box sx={{
                                                p: 0.5, borderRadius: '50%',
                                                border: `2.5px solid ${rule.enabled ? '#22c55e' : '#6b7280'}`,
                                            }}>
                                                <Avatar src={avatarUrl} sx={{ width: 48, height: 48 }}>
                                                    {tgt?.target_id?.[0] ?? '?'}
                                                </Avatar>
                                            </Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', mt: 0.5 }}>
                                                {tgt?.target_id ?? '-'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', lineHeight: 1.2 }}>
                                                {bots[0] ?? '-'}
                                            </Typography>
                                            <IconButton size="small" sx={{ color: 'error.main', mt: 0.5, p: 0.25 }}
                                                onClick={e => { e.stopPropagation(); handleDelete(rule.id); }}>
                                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        </Paper>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    )}
                </CardContent>
            </Card>

            {/* ── Webhook 告警 section ── */}
            <Card elevation={0} sx={{ borderRadius: 3, mb: 3, ...glass }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            {t('alerts.webhookSection')}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <FormControlLabel
                                control={<Switch checked={allowAllIp} onChange={handleAllowAllIpToggle} color="primary" />}
                                label={<Box sx={{ textAlign: 'right' }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('alerts.allowAllIp')}</Typography>
                                    <Typography variant="caption" color="text.secondary">{t('alerts.allowAllIpHint')}</Typography>
                                </Box>}
                                labelPlacement="start"
                                sx={{ mr: 0, alignItems: 'flex-start' }}
                            />
                            <Button variant="contained" size="small" startIcon={<AddIcon />}
                                onClick={() => setCreateOpen(true)}
                                sx={{ borderRadius: 2, background: '#2563eb', boxShadow: 'none', textTransform: 'none' }}>
                                {t('alerts.addRule')}
                            </Button>
                        </Box>
                    </Box>
                    {webhookRules.length === 0 ? (
                        <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
                            {t('alerts.noRules')}
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {webhookRules.map(rule => (
                                <Paper key={rule.id} elevation={0} sx={rowSx}>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{rule.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {alertTypes[rule.type] || rule.type}
                                            {rule.webhook_url ? ` · ${rule.webhook_url.substring(0, 45)}...` : null}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Switch checked={rule.enabled} onChange={() => handleToggle(rule)} size="small" />
                                        <IconButton size="small" onClick={() => handleDelete(rule.id)} sx={{ color: 'error.main' }}>
                                            <DeleteOutlineIcon fontSize="small" />
                                        </IconButton>
                                    </Box>
                                </Paper>
                            ))}
                        </Stack>
                    )}
                </CardContent>
            </Card>

            {/* ── SMTP 邮箱通知 section ── */}
            <Card elevation={0} sx={{ borderRadius: 3, mb: 3, ...glass }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EmailIcon sx={{ color: '#059669' }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>SMTP 邮箱通知</Typography>
                        </Box>
                        <FormControlLabel
                            control={<Switch checked={smtpForm.smtp_enabled} onChange={e => setSmtpForm({ ...smtpForm, smtp_enabled: e.target.checked })} color="primary" />}
                            label="启用 SMTP"
                            labelPlacement="start"
                            sx={{ mr: 0 }}
                        />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                        先保存统一 SMTP 发件服务；再点击"添加 SMTP 邮箱通知"，把指定容器的掉线通知分配给指定邮箱。
                    </Typography>

                    {/* SMTP 服务配置 */}
                    <Stack spacing={1.5} sx={{ mb: 2 }}>
                        <TextField size="small" label="面板公网地址 / Base URL" placeholder="https://nc.example.com" value={webhookBaseUrl}
                            onChange={e => setWebhookBaseUrl(e.target.value)} helperText="用于掉线邮件里的扫码链接，可留空" />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField size="small" fullWidth label="SMTP Host" placeholder="smtp.qq.com" value={smtpForm.smtp_host}
                                onChange={e => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })} />
                            <TextField size="small" sx={{ width: 120 }} label="端口" type="number" value={smtpForm.smtp_port}
                                onChange={e => setSmtpForm({ ...smtpForm, smtp_port: Number(e.target.value || 465) })} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField size="small" fullWidth label="SMTP 用户名" value={smtpForm.smtp_username}
                                onChange={e => setSmtpForm({ ...smtpForm, smtp_username: e.target.value })} />
                            <TextField size="small" fullWidth label="SMTP 密码/授权码" type="password"
                                placeholder={smtpPasswordSet ? '已保存，留空不修改' : ''}
                                value={smtpForm.smtp_password}
                                onChange={e => setSmtpForm({ ...smtpForm, smtp_password: e.target.value })} />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField size="small" fullWidth label="发件邮箱" value={smtpForm.smtp_sender}
                                onChange={e => setSmtpForm({ ...smtpForm, smtp_sender: e.target.value })} />
                            <TextField size="small" fullWidth label="发件名称" value={smtpForm.smtp_sender_name}
                                onChange={e => setSmtpForm({ ...smtpForm, smtp_sender_name: e.target.value })} />
                        </Box>
                        <TextField size="small" label="默认收件人（可选）" placeholder="仅作为无规则收件人时的兜底；规则测试会发给规则里的邮箱" value={smtpForm.smtp_recipients}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_recipients: e.target.value })} />
                        <TextField size="small" label="邮件标题前缀" value={smtpForm.smtp_subject_prefix}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_subject_prefix: e.target.value })} />
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <FormControlLabel control={<Switch checked={smtpForm.smtp_use_ssl} onChange={e => setSmtpForm({ ...smtpForm, smtp_use_ssl: e.target.checked, smtp_use_tls: e.target.checked ? false : smtpForm.smtp_use_tls })} />} label="SSL" />
                            <FormControlLabel control={<Switch checked={smtpForm.smtp_use_tls} onChange={e => setSmtpForm({ ...smtpForm, smtp_use_tls: e.target.checked, smtp_use_ssl: e.target.checked ? false : smtpForm.smtp_use_ssl })} />} label="STARTTLS" />
                        </Box>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button variant="contained" onClick={saveSmtpSettings} sx={{ borderRadius: 2, background: '#059669' }}>保存 SMTP 设置</Button>
                        </Box>
                    </Stack>

                    {/* SMTP 邮箱通知规则列表 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>SMTP 邮箱通知规则</Typography>
                        <Button variant="outlined" size="small" startIcon={<EmailIcon />}
                            onClick={openSmtpNotifyDialog}
                            sx={{ borderRadius: 2, borderColor: '#059669', color: '#059669', textTransform: 'none',
                                '&:hover': { borderColor: '#047857', bgcolor: 'rgba(5,150,105,0.06)' } }}>
                            添加 SMTP 邮箱通知
                        </Button>
                    </Box>
                    {smtpRules.length === 0 ? (
                        <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
                            暂无 SMTP 邮箱通知规则
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {smtpRules.map(rule => {
                                const cfg = rule.config as Record<string, unknown>;
                                return (
                                    <Paper key={rule.id} elevation={0} sx={rowSx}>
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{cfg.instance_name as string || rule.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">掉线通知邮箱: {cfg.smtp_recipients as string}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Button size="small" variant="outlined" onClick={async () => {
                                                await saveSmtpSettings();
                                                const ret = await alertApi.testSmtp({
                                                    recipients: String(cfg.smtp_recipients || ''),
                                                    subject: `SMTP 通知测试: ${cfg.instance_name || rule.name}`,
                                                    message: `这是一封 SMTP 邮箱通知规则测试邮件。\n监听账号/容器: ${cfg.instance_name || rule.name}\n收件邮箱: ${cfg.smtp_recipients || ''}`,
                                                });
                                                if (ret.status !== 'ok') toast.error(ret.message || 'SMTP 测试失败');
                                                else toast.success('测试邮件已发送到该规则邮箱');
                                            }} sx={{ borderRadius: 2 }}>测试</Button>
                                            <Switch checked={rule.enabled} onChange={() => handleToggle(rule)} size="small" />
                                            <IconButton size="small" onClick={() => handleDelete(rule.id)} sx={{ color: 'error.main' }}>
                                                <DeleteOutlineIcon fontSize="small" />
                                            </IconButton>
                                        </Box>
                                    </Paper>
                                );
                            })}
                        </Stack>
                    )}
                </CardContent>
            </Card>

            {/* ── Webhook 创建规则对话框 ── */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 460 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{t('alerts.addRule')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                    <TextField size="small" label={t('alerts.ruleName')} value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                    <FormControl size="small">
                        <InputLabel>{t('common.type') || 'Type'}</InputLabel>
                        <Select label={t('common.type') || 'Type'} value={form.type}
                            onChange={e => setForm({ ...form, type: e.target.value })}
                            sx={{ borderRadius: 2 }}>
                            {Object.entries(alertTypes).map(([k, v]) => (
                                <MenuItem key={k} value={k}>{v}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField size="small" label="Webhook URL" placeholder="http://<IP>:60071/common-webhook"
                        value={form.webhook_url}
                        onChange={e => setForm({ ...form, webhook_url: e.target.value })}
                        helperText={t('alerts.webhookHint')}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setCreateOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={handleCreate} disabled={!form.name} variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#2563eb' }}>{t('alerts.addRule')}</Button>
                </DialogActions>
            </Dialog>

            {/* ── QQ 通知专用对话框（创建/编辑） ── */}
            <Dialog open={qqNotifyOpen} onClose={() => { setQqNotifyOpen(false); setQqNotifyEditId(null); }}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 480 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{qqNotifyEditId ? '编辑 QQ 通知' : '添加 QQ 通知'}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                    {/* 多选 sender bots */}
                    <FormControl size="small">
                        <InputLabel>{t('alerts.senderBots')}</InputLabel>
                        <Select multiple value={qqNotifyForm.selectedNames}
                            onChange={e => setQqNotifyForm({ ...qqNotifyForm, selectedNames: e.target.value as string[] })}
                            input={<OutlinedInput label={t('alerts.senderBots')} sx={{ borderRadius: 2 }} />}
                            renderValue={selected => (selected as string[]).join(', ')}
                            sx={{ borderRadius: 2 }}>
                            {instances.length === 0 ? (
                                <MenuItem disabled>
                                    <Typography variant="caption" color="text.secondary">暂无可用实例</Typography>
                                </MenuItem>
                            ) : instances.map(inst => (
                                <MenuItem key={inst.name} value={inst.name}>
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Checkbox checked={qqNotifyForm.selectedNames.includes(inst.name)} size="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <span>{inst.name}</span>
                                                <Box component="span" sx={{
                                                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                                                    bgcolor: inst.bot_online ? 'success.main' : 'text.disabled', ml: 0.5,
                                                }} />
                                            </Box>
                                        }
                                        secondary={inst.uin ? `QQ: ${inst.uin}` : undefined}
                                    />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {/* msg_type 单选 */}
                    <FormControl size="small">
                        <InputLabel>{t('alerts.msgType') || '消息类型'}</InputLabel>
                        <Select label={t('alerts.msgType') || '消息类型'} value={qqNotifyForm.msg_type}
                            onChange={e => setQqNotifyForm({ ...qqNotifyForm, msg_type: e.target.value })}
                            sx={{ borderRadius: 2 }}>
                            <MenuItem value="private">{t('alerts.msgTypePrivate')}</MenuItem>
                            <MenuItem value="group">{t('alerts.msgTypeGroup')}</MenuItem>
                        </Select>
                    </FormControl>

                    {/* target_id 输入 */}
                    <TextField size="small" fullWidth
                        label={qqNotifyForm.msg_type === 'group' ? '群号' : 'QQ 号'}
                        placeholder={qqNotifyForm.msg_type === 'group' ? '请输入群号' : '请输入 QQ 号'}
                        value={qqNotifyForm.target_id}
                        onChange={e => setQqNotifyForm({ ...qqNotifyForm, target_id: e.target.value })}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => { setQqNotifyOpen(false); setQqNotifyEditId(null); }} color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={handleQqNotifySave}
                        disabled={qqNotifyForm.selectedNames.length === 0 || !qqNotifyForm.target_id}
                        variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#7c3aed' }}>
                        {qqNotifyEditId ? '保存' : '添加 QQ 通知'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── SMTP 邮箱通知专用对话框 ── */}
            <Dialog open={smtpNotifyOpen} onClose={() => setSmtpNotifyOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 480 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>添加 SMTP 邮箱通知</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                    <FormControl size="small">
                        <InputLabel>监听账号/容器</InputLabel>
                        <Select multiple value={smtpNotifyForm.selectedNames}
                            onChange={e => setSmtpNotifyForm({ ...smtpNotifyForm, selectedNames: e.target.value as string[] })}
                            input={<OutlinedInput label="监听账号/容器" sx={{ borderRadius: 2 }} />}
                            renderValue={selected => (selected as string[]).join(', ')}
                            sx={{ borderRadius: 2 }}>
                            {instances.length === 0 ? (
                                <MenuItem disabled>
                                    <Typography variant="caption" color="text.secondary">暂无可用实例</Typography>
                                </MenuItem>
                            ) : instances.map(inst => (
                                <MenuItem key={inst.name} value={inst.name}>
                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                        <Checkbox checked={smtpNotifyForm.selectedNames.includes(inst.name)} size="small" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                <span>{inst.name}</span>
                                                <Box component="span" sx={{
                                                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                                                    bgcolor: inst.bot_online ? 'success.main' : 'text.disabled', ml: 0.5,
                                                }} />
                                            </Box>
                                        }
                                        secondary={inst.uin ? `QQ: ${inst.uin}` : undefined}
                                    />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mt: 0.5 }}>
                        通知邮箱
                    </Typography>
                    <TextField size="small" fullWidth
                        placeholder="邮箱地址，如 123@qq.com；多个邮箱用逗号分隔"
                        value={smtpNotifyForm.recipients}
                        onChange={e => setSmtpNotifyForm({ ...smtpNotifyForm, recipients: e.target.value })}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setSmtpNotifyOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={handleSmtpNotifyCreate} disabled={smtpNotifyForm.selectedNames.length === 0 || !smtpNotifyForm.recipients}
                        variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#059669' }}>添加 SMTP 邮箱通知</Button>
                </DialogActions>
            </Dialog>

            {/* ── 删除确认对话框 ── */}
            <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 360, ...glass } }}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DeleteOutlineIcon sx={{ color: 'error.main' }} />
                    确认删除
                </DialogTitle>
                <DialogContent sx={{ pt: '8px !important' }}>
                    <Typography variant="body2" color="text.secondary">
                        删除后无法恢复，确认要删除这条规则吗？
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteConfirmId(null)} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('admin.cancelText')}
                    </Button>
                    <Button onClick={confirmDelete} variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#dc2626', '&:hover': { background: '#b91c1c' } }}>
                        删除
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
