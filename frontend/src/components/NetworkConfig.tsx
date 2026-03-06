/**
 * NetworkConfig 组件 - 网络配置编辑器
 * 从 ConfigEditor.tsx 提取，保留原有 UI 风格
 */
import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Switch, FormControlLabel,
    Grid, IconButton, Divider, Card, CardContent, useTheme,
    Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, InputLabel, FormControl
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SettingsIcon from '@mui/icons-material/Settings';
import HttpIcon from '@mui/icons-material/Http';
import CableIcon from '@mui/icons-material/Cable';
import SettingsInputComponentIcon from '@mui/icons-material/SettingsInputComponent';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import RefreshIcon from '@mui/icons-material/Refresh';
import SensorsIcon from '@mui/icons-material/Sensors';
import RouterIcon from '@mui/icons-material/Router';
import { useTranslate } from '../i18n';
import { containerApi } from '../services/api';
import { useToast } from './Toast';

interface NetworkConfigProps {
    name: string;
    node_id: string;
}

interface EndpointConfig {
    name: string;
    enable: boolean;
    host?: string;
    port?: number;
    url?: string;
    [key: string]: unknown;
}

interface NapcatNetworkConfig {
    http?: EndpointConfig[];
    http_client?: EndpointConfig[];
    http_sse?: EndpointConfig[];
    ws?: EndpointConfig[];
    ws_client?: EndpointConfig[];
    [key: string]: EndpointConfig[] | undefined;
}

interface EditDialogState {
    open: boolean;
    isNew: boolean;
    type: string;
    index: number;
    data: EndpointConfig;
}

export const NetworkConfig = ({ name, node_id }: NetworkConfigProps) => {
    const [config, setConfig] = useState<NapcatNetworkConfig | null>(null);
    const [loading, setLoading] = useState(false);
    const t = useTranslate();
    const theme = useTheme();
    const toast = useToast();

    useEffect(() => {
        loadConfig();
    }, [name, node_id]);

    const loadConfig = async () => {
        try {
            const data = await containerApi.getConfig(name, 'config/napcat.json', node_id);
            if (data.status === 'ok' && data.content) {
                setConfig(JSON.parse(data.content));
            }
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    };

    const saveConfig = async () => {
        if (!config) return;
        setLoading(true);
        try {
            await containerApi.saveConfig(name, 'config/napcat.json', JSON.stringify(config, null, 2), node_id);
            toast.success(t('network.saveSuccess'));
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error(t('network.saveFailed'));
        } finally {
            setLoading(false);
        }
    };

    const [editDialog, setEditDialog] = useState<EditDialogState>({ open: false, isNew: false, type: 'http', index: -1, data: { name: '', enable: true } });

    const saveToServer = async (newConfig: NapcatNetworkConfig) => {
        setLoading(true);
        try {
            await containerApi.saveConfig(name, 'config/napcat.json', JSON.stringify(newConfig, null, 2), node_id);
            toast.success(t('network.saveApplied'));
            setConfig(newConfig);
        } catch (error) {
            console.error('Failed to save config:', error);
            toast.error(t('network.saveRetryFailed'));
            // revert
            loadConfig();
        } finally {
            setLoading(false);
        }
    };

    const handleSaveEndpoint = () => {
        const { type, index, isNew, data } = editDialog;
        const newConfig = { ...config };
        if (!newConfig[type]) newConfig[type] = [];

        if (isNew) {
            newConfig[type] = [...newConfig[type], data];
        } else {
            newConfig[type] = [...newConfig[type]];
            newConfig[type][index] = data;
        }

        setEditDialog({ ...editDialog, open: false });
        saveToServer(newConfig);
    };

    const handleDeleteEndpoint = () => {
        const { type, index } = editDialog;
        const newConfig = { ...config };
        if (newConfig[type]) {
            newConfig[type] = [...newConfig[type]];
            newConfig[type].splice(index, 1);
        }

        setEditDialog({ ...editDialog, open: false });
        saveToServer(newConfig);
    };

    const handleToggleEnable = (type: string, index: number, enable: boolean) => {
        const newConfig = { ...config };
        if (newConfig[type]) {
            newConfig[type] = [...newConfig[type]];
            newConfig[type][index].enable = enable;
        }
        saveToServer(newConfig);
    };

    const openAddDialog = () => {
        setEditDialog({ open: true, isNew: true, type: 'http', index: -1, data: { name: t('network.httpServer'), enable: true, host: '0.0.0.0', port: 3000 } });
    };

    const openEditDialog = (type: string, index: number) => {
        setEditDialog({ open: true, isNew: false, type, index, data: { ...config[type][index] } });
    };

    const updateDialogData = (key: string, value: string | number | boolean) => {
        setEditDialog(prev => ({ ...prev, data: { ...prev.data, [key]: value } }));
    };

    const handleTypeChange = (newType: string) => {
        const isClient = newType === 'http_client' || newType === 'ws_client';
        const newData: EndpointConfig = isClient
            ? { name: t('network.newEndpoint'), enable: true, url: 'http://127.0.0.1:8080' }
            : { name: t('network.newEndpoint'), enable: true, host: '0.0.0.0', port: 3000 };
        setEditDialog(prev => ({ ...prev, type: newType, data: newData }));
    };

    const endpointMeta = [
        { type: 'http', label: t('network.httpServer'), icon: <HttpIcon sx={{ color: '#10b981' }}/>, bg: 'rgba(16,185,129,0.1)' },
        { type: 'http_client', label: t('network.httpClient'), icon: <CloudUploadIcon sx={{ color: '#3b82f6' }}/>, bg: 'rgba(59,130,246,0.1)' },
        { type: 'http_sse', label: t('network.httpSseServer'), icon: <SensorsIcon sx={{ color: '#f59e0b' }}/>, bg: 'rgba(245,158,11,0.1)' },
        { type: 'ws', label: t('network.wsServer'), icon: <SettingsInputComponentIcon sx={{ color: '#8b5cf6' }}/>, bg: 'rgba(139,92,246,0.1)' },
        { type: 'ws_client', label: t('network.wsClient'), icon: <CloudDownloadIcon sx={{ color: '#ec4899' }}/>, bg: 'rgba(236,72,153,0.1)' }
    ];

    if (!config) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', py: 10 }}>
                <Typography color="text.secondary">{t('network.loading')}</Typography>
            </Box>
        );
    }

    const allEndpoints = endpointMeta.flatMap(meta =>
        (config[meta.type] || []).map((item: EndpointConfig, idx: number) => ({
            ...meta,
            item,
            index: idx
        }))
    );

    const isClientConfig = editDialog.type === 'http_client' || editDialog.type === 'ws_client';

    return (
        <Box>
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: 3,
                background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.03)'
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(59,130,246,0.1)', display: 'flex' }}>
                        <CableIcon sx={{ fontSize: 24, color: '#3b82f6' }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t('network.title')}</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{t('network.subtitle')}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        startIcon={<RefreshIcon />}
                        onClick={loadConfig}
                        disabled={loading}
                        variant="outlined"
                        sx={{ borderRadius: 2, textTransform: 'none', px: 2 }}
                    >
                        {t('network.refresh')}
                    </Button>
                    <Button
                        startIcon={<AddIcon />}
                        onClick={openAddDialog}
                        variant="contained"
                        sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)', textTransform: 'none', px: 3 }}
                    >
                        {t('network.create')}
                    </Button>
                </Box>
            </Box>

            {/* 端点卡片网格 */}
            <Grid container spacing={3}>
                {allEndpoints.length === 0 ? (
                    <Grid item xs={12}>
                        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                            <Typography variant="body1">{t('network.noEndpoints')}</Typography>
                        </Box>
                    </Grid>
                ) : allEndpoints.map((endpoint, i) => (
                    <Grid item xs={12} md={6} lg={4} key={i}>
                        <Card sx={{
                            borderRadius: 3,
                            border: `1px solid ${theme.palette.divider}`,
                            background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
                            boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 15px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s',
                            '&:hover': {
                                boxShadow: theme.palette.mode === 'dark' ? '0 0 0 1px rgba(255,255,255,0.1)' : '0 8px 25px rgba(0,0,0,0.05)',
                                transform: 'translateY(-2px)'
                            }
                        }}>
                            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                        <Box sx={{ p: 1, borderRadius: 2, bgcolor: endpoint.bg, display: 'flex' }}>
                                            {endpoint.icon}
                                        </Box>
                                        <Box>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                                                {endpoint.item.name || endpoint.label}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {endpoint.label}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <IconButton size="small" onClick={() => openEditDialog(endpoint.type, endpoint.index)}>
                                        <SettingsIcon fontSize="small" />
                                    </IconButton>
                                </Box>

                                <Divider sx={{ my: 1.5 }} />

                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                    {(endpoint.type === 'http_client' || endpoint.type === 'ws_client') ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ width: 60, flexShrink: 0 }}>URL:</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {endpoint.item.url || t('network.notConfigured')}
                                            </Typography>
                                        </Box>
                                    ) : (
                                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ width: 60, flexShrink: 0 }}>{t('network.address')}</Typography>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                {endpoint.item.host || '0.0.0.0'}:{endpoint.item.port || 0}
                                            </Typography>
                                        </Box>
                                    )}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
                                        <Typography variant="caption" color="text.secondary">{t('network.status')}</Typography>
                                        <FormControlLabel
                                            control={<Switch size="small" checked={endpoint.item.enable || false} onChange={(e) => handleToggleEnable(endpoint.type, endpoint.index, e.target.checked)} color="primary" />}
                                            label={<Typography variant="caption" sx={{ fontWeight: 600 }}>{endpoint.item.enable ? t('network.enabled') : t('network.disabled')}</Typography>}
                                            sx={{ m: 0 }}
                                        />
                                    </Box>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* 新建/编辑弹窗 */}
            <Dialog open={editDialog.open} onClose={() => setEditDialog({ ...editDialog, open: false })} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none' } }}>
                <DialogTitle sx={{ pb: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                    {editDialog.isNew ? t('network.createEndpoint') : t('network.editEndpoint')}
                </DialogTitle>
                <DialogContent sx={{ pt: '24px !important' }}>
                    <Grid container spacing={2}>
                        {editDialog.isNew && (
                            <Grid item xs={12}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>{t('network.endpointType')}</InputLabel>
                                    <Select
                                        value={editDialog.type}
                                        label={t('network.endpointType')}
                                        onChange={(e) => handleTypeChange(e.target.value)}
                                        sx={{ borderRadius: 2 }}
                                    >
                                        {endpointMeta.map((meta) => (
                                            <MenuItem key={meta.type} value={meta.type}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {meta.icon} {meta.label}
                                                </Box>
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        )}

                        <Grid item xs={12} sm={8}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.name')}</Typography>
                            <TextField fullWidth size="small" placeholder={t('network.namePlaceholder')} value={editDialog.data?.name || ''} onChange={(e) => updateDialogData('name', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                        </Grid>

                        <Grid item xs={12} sm={4} sx={{ display: 'flex', alignItems: 'flex-end', pb: 0.5 }}>
                            <FormControlLabel control={<Switch checked={editDialog.data?.enable !== false} onChange={(e) => updateDialogData('enable', e.target.checked)} color="primary" />} label={<Typography variant="body2" sx={{ fontWeight: 600 }}>{t('network.enable')}</Typography>} />
                        </Grid>

                        {isClientConfig ? (
                            <Grid item xs={12}>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.targetUrl')}</Typography>
                                <TextField fullWidth size="small" placeholder="http://127.0.0.1:8080" value={editDialog.data?.url || ''} onChange={(e) => updateDialogData('url', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                            </Grid>
                        ) : (
                            <>
                                <Grid item xs={12} sm={8}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.listenHost')}</Typography>
                                    <TextField fullWidth size="small" placeholder="0.0.0.0" value={editDialog.data?.host || ''} onChange={(e) => updateDialogData('host', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('network.listenPort')}</Typography>
                                    <TextField fullWidth size="small" type="number" placeholder="3000" value={editDialog.data?.port || ''} onChange={(e) => updateDialogData('port', parseInt(e.target.value) || 0)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                                </Grid>
                            </>
                        )}

                        <Grid item xs={12}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>{t('Token')}</Typography>
                            <TextField fullWidth size="small" placeholder={t('network.tokenPlaceholder')} value={editDialog.data?.token || ''} onChange={(e) => updateDialogData('token', e.target.value)} sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                        </Grid>

                        {editDialog.type === 'http' && (
                            <Grid item xs={12}>
                                <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                                    <FormControlLabel control={<Switch size="small" checked={editDialog.data?.enableCors !== false} onChange={(e) => updateDialogData('enableCors', e.target.checked)} />} label={<Typography variant="caption">{t('network.enableCors')}</Typography>} />
                                    <FormControlLabel control={<Switch size="small" checked={editDialog.data?.enableWebsocket || false} onChange={(e) => updateDialogData('enableWebsocket', e.target.checked)} />} label={<Typography variant="caption">{t('network.enableWs')}</Typography>} />
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
                    {!editDialog.isNew ? (
                        <Button
                            color="error"
                            startIcon={<DeleteOutlineIcon />}
                            onClick={handleDeleteEndpoint}
                            sx={{ borderRadius: 2, textTransform: 'none' }}
                        >
                            {t('network.delete')}
                        </Button>
                    ) : <Box />}

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button onClick={() => setEditDialog({ ...editDialog, open: false })} color="inherit" sx={{ borderRadius: 2, textTransform: 'none' }}>
                            {t('network.cancel')}
                        </Button>
                        <Button onClick={handleSaveEndpoint} variant="contained" color="primary" sx={{ borderRadius: 2, textTransform: 'none', px: 3, boxShadow: '0 4px 10px rgba(59,130,246,0.2)' }}>
                            {t('network.save')}
                        </Button>
                    </Box>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

