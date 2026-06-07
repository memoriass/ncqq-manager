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

import { alertApi } from '../services/api';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';
import { useAlertSettingsController } from './alert-settings/useAlertSettingsController';
import type { QqBotTarget } from './alert-settings/types';

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

    const {
        rules, loading, createOpen, setCreateOpen, form, setForm, allowAllIp, webhookBaseUrl, setWebhookBaseUrl,
        smtpForm, setSmtpForm, smtpPasswordSet, smtpAdvancedOpen, setSmtpAdvancedOpen, smtpProvider,
        qqNotifyOpen, setQqNotifyOpen, qqNotifyForm, setQqNotifyForm, qqNotifyEditId, setQqNotifyEditId,
        smtpNotifyOpen, setSmtpNotifyOpen, smtpNotifyForm, setSmtpNotifyForm, instances, deleteConfirmId,
        setDeleteConfirmId, applyQqDefaultsIfMissing, openQqNotifyDialog, openSmtpNotifyDialog, handleCreate,
        handleQqNotifySave, handleSmtpNotifyCreate, handleToggle, handleDelete, confirmDelete,
        handleAllowAllIpToggle, saveSmtpSettings, applyProviderPreset,
    } = useAlertSettingsController();

    const alertTypes: Record<string, string> = {
        instance_offline: t('alerts.typeInstanceOffline'),
        login_lost: t('alerts.typeLoginLost'),
        instance_online: t('alerts.typeInstanceOnline'),
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
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('alerts.pageTitle')}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('alerts.subtitle')}</Typography>
                </Box>
            </Box>

            {/* ── QQ 通知 section ── */}
            <Card elevation={0} sx={{ borderRadius: 3, mb: 3, ...glass }}>
                <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('alerts.qqNotifySection')}</Typography>
                        <Button variant="outlined" size="small" startIcon={<AddIcon />}
                            onClick={() => openQqNotifyDialog()}
                            sx={{ borderRadius: 2, borderColor: '#7c3aed', color: '#7c3aed', textTransform: 'none',
                                '&:hover': { borderColor: '#6d28d9', bgcolor: 'rgba(124,58,237,0.06)' } }}>
                            {t('alerts.addQqNotify')}
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
                            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('alerts.smtpSection')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setSmtpAdvancedOpen(true)}
                                sx={{ borderRadius: 2, textTransform: 'none' }}
                            >
                                {t('alerts.smtpAdvancedMode')}
                            </Button>
                            <FormControlLabel
                                control={<Switch checked={smtpForm.smtp_enabled} onChange={e => {
                                    const enabled = e.target.checked;
                                    setSmtpForm(prev => {
                                        const next = { ...prev, smtp_enabled: enabled };
                                        return enabled ? applyQqDefaultsIfMissing(next) : next;
                                    });
                                }} color="primary" />}
                                label={t('alerts.enableSmtp')}
                                labelPlacement="start"
                                sx={{ mr: 0 }}
                            />
                        </Box>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                        {t('alerts.smtpGuide')}
                    </Typography>

                    {/* SMTP 基础配置 */}
                    <Stack spacing={1.5} sx={{ mb: 2 }}>
                        <TextField size="small" label={t('alerts.baseUrlLabel')} placeholder="https://nc.example.com" value={webhookBaseUrl}
                            onChange={e => setWebhookBaseUrl(e.target.value)} helperText={t('alerts.baseUrlHint')} />
                        <TextField size="small" fullWidth label={t('alerts.smtpPassword')} type="password"
                            placeholder={smtpPasswordSet ? t('alerts.smtpPasswordPlaceholder') : ''}
                            value={smtpForm.smtp_password}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_password: e.target.value })} />
                        <TextField size="small" fullWidth label={t('alerts.smtpSender')} value={smtpForm.smtp_sender}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_sender: e.target.value })} />
                        <TextField size="small" fullWidth label={t('alerts.smtpSenderName')} value={smtpForm.smtp_sender_name}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_sender_name: e.target.value })} />
                        <TextField size="small" label={t('alerts.smtpSubjectPrefix')} value={smtpForm.smtp_subject_prefix}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_subject_prefix: e.target.value })} />
                        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                            <FormControlLabel control={<Switch checked={smtpForm.smtp_use_ssl} onChange={e => setSmtpForm({ ...smtpForm, smtp_use_ssl: e.target.checked, smtp_use_tls: e.target.checked ? false : smtpForm.smtp_use_tls })} />} label="SSL" />
                            <FormControlLabel control={<Switch checked={smtpForm.smtp_use_tls} onChange={e => setSmtpForm({ ...smtpForm, smtp_use_tls: e.target.checked, smtp_use_ssl: e.target.checked ? false : smtpForm.smtp_use_ssl })} />} label="STARTTLS" />
                            <FormControlLabel control={<Switch checked={smtpForm.smtp_qrcode} onChange={e => setSmtpForm({ ...smtpForm, smtp_qrcode: e.target.checked })} />} label={t('alerts.smtpQrcode')} />
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            {t('alerts.smtpQqDefaultHint')}
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                            <Button variant="contained" onClick={saveSmtpSettings} sx={{ borderRadius: 2, background: '#059669' }}>{t('alerts.saveSmtp')}</Button>
                        </Box>
                    </Stack>

                    {/* SMTP 邮箱通知规则列表 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2, mb: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{t('alerts.smtpRulesTitle')}</Typography>
                        <Button variant="outlined" size="small" startIcon={<EmailIcon />}
                            onClick={openSmtpNotifyDialog}
                            sx={{ borderRadius: 2, borderColor: '#059669', color: '#059669', textTransform: 'none',
                                '&:hover': { borderColor: '#047857', bgcolor: 'rgba(5,150,105,0.06)' } }}>
                            {t('alerts.addSmtpNotify')}
                        </Button>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                        {t('alerts.smtpRulesHint')}
                    </Typography>
                    {smtpRules.length === 0 ? (
                        <Typography color="text.secondary" variant="body2" sx={{ textAlign: 'center', py: 2 }}>
                            {t('alerts.noSmtpRules')}
                        </Typography>
                    ) : (
                        <Stack spacing={1}>
                            {smtpRules.map(rule => {
                                const cfg = rule.config as Record<string, unknown>;
                                return (
                                    <Paper key={rule.id} elevation={0} sx={rowSx}>
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{cfg.instance_name as string || rule.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">{t('alerts.smtpRecipientLabel')}: {cfg.smtp_recipients as string}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Button size="small" variant="outlined" onClick={async () => {
                                                await saveSmtpSettings();
                                                const ret = await alertApi.testSmtp({
                                                    recipients: String(cfg.smtp_recipients || ''),
                                                    subject: `${t('alerts.testSmtpSubject')}: ${cfg.instance_name || rule.name}`,
                                                    message: `${t('alerts.testSmtpBody')}\n${t('alerts.monitorInstances')}: ${cfg.instance_name || rule.name}\n${t('alerts.notifyEmail')}: ${cfg.smtp_recipients || ''}`,
                                                });
                                                if (ret.status !== 'ok') toast.error(ret.message || t('alerts.testSmtpFailed'));
                                                else toast.success(t('alerts.testSmtpSuccess'));
                                            }} sx={{ borderRadius: 2 }}>{t('alerts.testBtn')}</Button>
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

            {/* ── SMTP 高级模式弹窗 ── */}
            <Dialog
                open={smtpAdvancedOpen}
                onClose={() => setSmtpAdvancedOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 520 } }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>{t('alerts.smtpAdvancedMode')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '8px !important' }}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <TextField
                            size="small"
                            fullWidth
                            label="SMTP Host"
                            placeholder="smtp.qq.com"
                            value={smtpForm.smtp_host}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_host: e.target.value })}
                        />
                        <TextField
                            size="small"
                            sx={{ width: 140 }}
                            label={t('alerts.smtpPort')}
                            type="number"
                            value={smtpForm.smtp_port}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_port: Number(e.target.value || 465) })}
                        />
                    </Box>
                    <TextField
                        size="small"
                        label={t('alerts.smtpUsername')}
                        value={smtpForm.smtp_username}
                        onChange={e => setSmtpForm({ ...smtpForm, smtp_username: e.target.value })}
                    />
                    <FormControl size="small">
                        <InputLabel>{t('alerts.smtpProviderPreset')}</InputLabel>
                        <Select
                            label={t('alerts.smtpProviderPreset')}
                            value={smtpProvider}
                            onChange={e => applyProviderPreset(String(e.target.value))}
                            sx={{ borderRadius: 2 }}
                        >
                            <MenuItem value="qq">QQ Mail</MenuItem>
                            <MenuItem value="netease163">163 Mail</MenuItem>
                            <MenuItem value="gmail">Gmail</MenuItem>
                            <MenuItem value="outlook">Outlook / Office365</MenuItem>
                        </Select>
                    </FormControl>
                    <FormControl size="small">
                        <InputLabel>{t('alerts.smtpAuthMode')}</InputLabel>
                        <Select
                            label={t('alerts.smtpAuthMode')}
                            value={smtpForm.smtp_auth_mode}
                            onChange={e => setSmtpForm({ ...smtpForm, smtp_auth_mode: String(e.target.value) })}
                            sx={{ borderRadius: 2 }}
                        >
                            <MenuItem value="auto">{t('alerts.smtpAuthAuto')}</MenuItem>
                            <MenuItem value="login">{t('alerts.smtpAuthLogin')}</MenuItem>
                            <MenuItem value="none">{t('alerts.smtpAuthNone')}</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        size="small"
                        label={t('alerts.smtpSenderName')}
                        value={smtpForm.smtp_sender_name}
                        onChange={e => setSmtpForm({ ...smtpForm, smtp_sender_name: e.target.value })}
                    />
                    <TextField
                        size="small"
                        label={t('alerts.smtpReplyTo')}
                        value={smtpForm.smtp_reply_to}
                        onChange={e => setSmtpForm({ ...smtpForm, smtp_reply_to: e.target.value })}
                    />
                    <TextField
                        size="small"
                        label={t('alerts.smtpSubjectPrefix')}
                        value={smtpForm.smtp_subject_prefix}
                        onChange={e => setSmtpForm({ ...smtpForm, smtp_subject_prefix: e.target.value })}
                    />
                    <TextField
                        size="small"
                        label={t('alerts.smtpTimeoutSec')}
                        type="number"
                        value={smtpForm.smtp_timeout_sec}
                        onChange={e => setSmtpForm({ ...smtpForm, smtp_timeout_sec: Number(e.target.value || 15) })}
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <FormControlLabel
                            control={<Switch checked={smtpForm.smtp_use_ssl} onChange={e => setSmtpForm({ ...smtpForm, smtp_use_ssl: e.target.checked, smtp_use_tls: e.target.checked ? false : smtpForm.smtp_use_tls })} />}
                            label="SSL"
                        />
                        <FormControlLabel
                            control={<Switch checked={smtpForm.smtp_use_tls} onChange={e => setSmtpForm({ ...smtpForm, smtp_use_tls: e.target.checked, smtp_use_ssl: e.target.checked ? false : smtpForm.smtp_use_ssl })} />}
                            label="STARTTLS"
                        />
                        <FormControlLabel
                            control={<Switch checked={smtpForm.smtp_qrcode} onChange={e => setSmtpForm({ ...smtpForm, smtp_qrcode: e.target.checked })} />}
                            label={t('alerts.smtpQrcode')}
                        />
                        <FormControlLabel
                            control={<Switch checked={smtpForm.smtp_verify_tls} onChange={e => setSmtpForm({ ...smtpForm, smtp_verify_tls: e.target.checked })} />}
                            label={t('alerts.smtpVerifyTls')}
                        />
                    </Box>
                    <TextField size="small" label={t('alerts.smtpDefaultRecipients')} placeholder={t('alerts.smtpDefaultRecipientsHint')} value={smtpForm.smtp_recipients}
                        onChange={e => setSmtpForm({ ...smtpForm, smtp_recipients: e.target.value })} />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setSmtpAdvancedOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('admin.cancelText')}
                    </Button>
                    <Button
                        onClick={() => setSmtpAdvancedOpen(false)}
                        variant="contained"
                        sx={{ borderRadius: 2, background: '#059669' }}
                    >
                        {t('alerts.saveBtn')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── Webhook 创建规则对话框 ── */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 460 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{t('alerts.addRule')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                    <TextField size="small" label={t('alerts.ruleName')} value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                    <FormControl size="small">
                        <InputLabel>{t('alerts.msgType')}</InputLabel>
                        <Select label={t('alerts.msgType')} value={form.type}
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
                <DialogTitle sx={{ fontWeight: 700 }}>{qqNotifyEditId ? t('alerts.editQqNotify') : t('alerts.addQqNotify')}</DialogTitle>
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
                                    <Typography variant="caption" color="text.secondary">{t('alerts.noInstances')}</Typography>
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
                        <InputLabel>{t('alerts.msgType')}</InputLabel>
                        <Select label={t('alerts.msgType')} value={qqNotifyForm.msg_type}
                            onChange={e => setQqNotifyForm({ ...qqNotifyForm, msg_type: e.target.value })}
                            sx={{ borderRadius: 2 }}>
                            <MenuItem value="private">{t('alerts.msgTypePrivate')}</MenuItem>
                            <MenuItem value="group">{t('alerts.msgTypeGroup')}</MenuItem>
                        </Select>
                    </FormControl>

                    {/* target_id 输入 */}
                    <TextField size="small" fullWidth
                        label={qqNotifyForm.msg_type === 'group' ? t('alerts.groupId') : t('alerts.qqId')}
                        placeholder={qqNotifyForm.msg_type === 'group' ? t('alerts.groupIdPlaceholder') : t('alerts.qqIdPlaceholder')}
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
                        {qqNotifyEditId ? t('alerts.saveBtn') : t('alerts.addQqNotify')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ── SMTP 邮箱通知专用对话框 ── */}
            <Dialog open={smtpNotifyOpen} onClose={() => setSmtpNotifyOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 480 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{t('alerts.addSmtpNotify')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                    <FormControl size="small">
                        <InputLabel>{t('alerts.monitorInstances')}</InputLabel>
                        <Select multiple value={smtpNotifyForm.selectedNames}
                            onChange={e => setSmtpNotifyForm({ ...smtpNotifyForm, selectedNames: e.target.value as string[] })}
                            input={<OutlinedInput label={t('alerts.monitorInstances')} sx={{ borderRadius: 2 }} />}
                            renderValue={selected => (selected as string[]).join(', ')}
                            sx={{ borderRadius: 2 }}>
                            {instances.length === 0 ? (
                                <MenuItem disabled>
                                    <Typography variant="caption" color="text.secondary">{t('alerts.noInstances')}</Typography>
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
                        {t('alerts.notifyEmail')}
                    </Typography>
                    <TextField size="small" fullWidth
                        placeholder={t('alerts.emailPlaceholder')}
                        value={smtpNotifyForm.recipients}
                        onChange={e => setSmtpNotifyForm({ ...smtpNotifyForm, recipients: e.target.value })}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setSmtpNotifyOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={handleSmtpNotifyCreate} disabled={smtpNotifyForm.selectedNames.length === 0 || !smtpNotifyForm.recipients}
                        variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#059669' }}>{t('alerts.addSmtpNotify')}</Button>
                </DialogActions>
            </Dialog>

            {/* ── 删除确认对话框 ── */}
            <Dialog open={!!deleteConfirmId} onClose={() => setDeleteConfirmId(null)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 360, ...glass } }}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <DeleteOutlineIcon sx={{ color: 'error.main' }} />
                    {t('alerts.deleteConfirmTitle')}
                </DialogTitle>
                <DialogContent sx={{ pt: '8px !important' }}>
                    <Typography variant="body2" color="text.secondary">
                        {t('alerts.deleteConfirmMsg')}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteConfirmId(null)} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('admin.cancelText')}
                    </Button>
                    <Button onClick={confirmDelete} variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#dc2626', '&:hover': { background: '#b91c1c' } }}>
                        {t('alerts.deleteBtn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
