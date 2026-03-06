import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Paper, IconButton, Switch,
    useTheme, CircularProgress, Dialog, DialogTitle, DialogContent,
    DialogActions, Select, MenuItem, Chip, List, ListItem, ListItemText
} from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { alertApi, type AlertRule, type AlertHistory } from '../services/api';
import { useTranslate } from '../i18n';

export default function AlertSettings() {
    const theme = useTheme();
    const t = useTranslate();
    const [rules, setRules] = useState<AlertRule[]>([]);
    const [history, setHistory] = useState<AlertHistory[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ name: '', type: 'container_stop', webhook_url: '' });
    const [allowAllIp, setAllowAllIp] = useState(false);

    const fetchData = async () => {
        try {
            const [rulesData, histData, settingsData] = await Promise.all([
                alertApi.listRules(), alertApi.getHistory(20), alertApi.getSettings(),
            ]);
            setRules(rulesData.rules || []);
            setHistory(histData.history || []);
            setAllowAllIp(settingsData.allow_local_webhook ?? false);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleCreate = async () => {
        if (!form.name) return;
        try {
            await alertApi.createRule({ name: form.name, type: form.type, config: {}, webhook_url: form.webhook_url });
            setCreateOpen(false);
            setForm({ name: '', type: 'container_stop', webhook_url: '' });
            fetchData();
        } catch (e) { console.error(e); }
    };

    const handleToggle = async (rule: AlertRule) => {
        await alertApi.updateRule(rule.id, { enabled: !rule.enabled });
        fetchData();
    };

    const handleDelete = async (id: string) => {
        if (!confirm(t('alerts.confirmDelete'))) return;
        await alertApi.deleteRule(id);
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

    const alertTypes: Record<string, string> = {
        container_stop: t('alerts.typeContainerStop'),
        high_cpu: t('alerts.typeHighCpu'),
        high_mem: t('alerts.typeHighMem'),
        login_failure: t('alerts.typeLoginFailure'),
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(245,158,11,0.1)', display: 'flex' }}>
                        <NotificationsActiveIcon sx={{ fontSize: 28, color: '#f59e0b' }} />
                    </Box>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('alerts.title')}</Typography>
                        <Typography variant="body2" color="text.secondary">{t('alerts.subtitle')}</Typography>
                    </Box>
                </Box>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}
                    sx={{ borderRadius: 2, background: '#2563eb', boxShadow: 'none' }}>
                    {t('alerts.addRule')}
                </Button>
            </Box>

            {/* 允许所有 IP 访问开关 */}
            <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{t('alerts.allowAllIp')}</Typography>
                    <Typography variant="caption" color="text.secondary">{t('alerts.allowAllIpHint')}</Typography>
                </Box>
                <Switch checked={allowAllIp} onChange={handleAllowAllIpToggle} />
            </Paper>

            {/* 规则列表 */}
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>{t('alerts.rules')}</Typography>
            {rules.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
                    <Typography color="text.secondary">{t('alerts.noRules')}</Typography>
                </Paper>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
                    {rules.map(rule => (
                        <Paper key={rule.id} elevation={0}
                            sx={{ p: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box>
                                <Typography variant="body1" sx={{ fontWeight: 600 }}>{rule.name}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {alertTypes[rule.type] || rule.type}
                                    {rule.webhook_url && ` · Webhook: ${rule.webhook_url.substring(0, 40)}...`}
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
                </Box>
            )}

            {/* 告警历史 */}
            <Typography variant="subtitle2" sx={{ mb: 1, mt: 3, fontWeight: 600 }}>{t('alerts.history')}</Typography>
            {history.length === 0 ? (
                <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
                    <Typography color="text.secondary">{t('alerts.noHistory')}</Typography>
                </Paper>
            ) : (
                <Paper elevation={0} sx={{ borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
                    <List dense>
                        {history.map(h => (
                            <ListItem key={h.id} sx={{ borderBottom: `1px solid ${theme.palette.divider}` }}>
                                <ListItemText
                                    primary={h.message}
                                    secondary={new Date(h.created_at * 1000).toLocaleString()}
                                />
                                <Chip label={h.level} size="small" variant="outlined"
                                    color={h.level === 'error' ? 'error' : h.level === 'warning' ? 'warning' : 'info'} />
                            </ListItem>
                        ))}
                    </List>
                </Paper>
            )}

            {/* 创建规则对话框 */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{t('alerts.addRule')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
                    <TextField size="small" label={t('alerts.ruleName')} value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                    <Select size="small" value={form.type}
                        onChange={e => setForm({ ...form, type: e.target.value })}
                        sx={{ borderRadius: 2 }}>
                        {Object.entries(alertTypes).map(([k, v]) => (
                            <MenuItem key={k} value={k}>{v}</MenuItem>
                        ))}
                    </Select>
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
        </Box>
    );
}

