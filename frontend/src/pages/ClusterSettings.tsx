import React, { useEffect, useState, useMemo } from 'react';
import {
    Box, Typography, TextField, Button, CircularProgress, Card, CardContent, Grid, useTheme, Alert, Switch, FormControlLabel, Collapse, IconButton, Tooltip, Chip, Stack
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CableIcon from '@mui/icons-material/Cable';
import HubIcon from '@mui/icons-material/Hub';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';
import { nodeApi } from '../services/api';

interface ClusterConfig {
    docker_image: string;
    webui_base_port: number;
    http_base_port: number;
    ws_base_port: number;
    api_key: string;
    data_dir: string;
    init_ws_client_enabled: boolean;
    init_ws_client_url: string;
    init_ws_client_token: string;
    init_bs_enabled: boolean;
    init_bs_client_base_port: number;
    init_bs_napcat_host: string;
    init_bs_targets: string;
}

const DEFAULT_CONFIG: ClusterConfig = {
    docker_image: "mlikiowa/napcat-docker:latest",
    webui_base_port: 6000, http_base_port: 3000, ws_base_port: 3001,
    api_key: "", data_dir: "",
    init_ws_client_enabled: false,
    init_ws_client_url: "ws://127.0.0.1:5100/onebot/v11/ws",
    init_ws_client_token: "",
    init_bs_enabled: false,
    init_bs_client_base_port: 6100,
    init_bs_napcat_host: "172.17.0.1",
    init_bs_targets: "[]",
};

export default function ClusterSettings() {
    const theme = useTheme();
    const t = useTranslate();
    const toast = useToast();
    const [config, setConfig] = useState<ClusterConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    // BS 目标端点：独立列表 state，避免 JSON 序列化干扰编辑
    const [bsTargets, setBsTargets] = useState<string[]>([]);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const data = await nodeApi.getClusterConfig();
                const fetched = (data as Record<string, unknown>).config as Partial<ClusterConfig>;
                const merged = { ...DEFAULT_CONFIG, ...fetched };
                setConfig(merged);
                // 从 JSON 字符串还原目标端点列表
                try {
                    const arr = JSON.parse(merged.init_bs_targets || '[]');
                    setBsTargets(Array.isArray(arr) ? arr.filter(Boolean) : []);
                } catch { setBsTargets([]); }
            } catch (e) {
                console.error("Failed to fetch cluster config", e);
            } finally {
                setLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = (e.target.type === 'number') ? (parseInt(e.target.value) || 0) : e.target.value;
        setConfig({ ...config, [e.target.name]: value });
    };

    const handleToggle = (key: keyof ClusterConfig) => {
        setConfig(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 保存时将 bsTargets 列表序列化回 config
            const saveConfig = { ...config, init_bs_targets: JSON.stringify(bsTargets.filter(Boolean)) };
            await nodeApi.saveClusterConfig(saveConfig);
            toast.success(t('config.saved') || 'Saved Successfully');
        } catch (e) {
            console.error(e);
            toast.error(t('config.saveFailed') || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    // BS 目标端点操作
    const handleBsTargetChange = (index: number, value: string) => {
        setBsTargets(prev => { const next = [...prev]; next[index] = value; return next; });
    };
    const handleBsTargetAdd = () => {
        setBsTargets(prev => [...prev, '']);
    };
    const handleBsTargetRemove = (index: number) => {
        setBsTargets(prev => prev.filter((_, i) => i !== index));
    };

    if (loading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 4 } }}>
            <Box sx={{ mb: 4, pb: 2, borderBottom: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="h4" sx={{ fontWeight: 800, color: 'text.primary', mb: 1 }}>
                    {t('clusterConfig.title')}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    {t('clusterConfig.description')}
                </Typography>
            </Box>

            <Card variant="outlined" sx={{
                borderRadius: 4,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.1)'
            }}>
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                    <Grid container spacing={4}>
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                {t('clusterConfig.dockerImage')}
                            </Typography>
                            <TextField
                                fullWidth
                                name="docker_image"
                                value={config.docker_image || ''}
                                onChange={handleChange}
                                placeholder="mlikiowa/napcat-docker:latest"
                                helperText={t('clusterConfig.dockerImageHelp')}
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                {t('clusterConfig.webuiBasePort')}
                            </Typography>
                            <TextField
                                fullWidth
                                name="webui_base_port"
                                type="number"
                                value={config.webui_base_port}
                                onChange={handleChange}
                                helperText={t('clusterConfig.webuiBasePortHelp')}
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                {t('clusterConfig.httpBasePort')}
                            </Typography>
                            <TextField
                                fullWidth
                                name="http_base_port"
                                type="number"
                                value={config.http_base_port}
                                onChange={handleChange}
                                helperText={t('clusterConfig.httpBasePortHelp')}
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                {t('clusterConfig.wsBasePort')}
                            </Typography>
                            <TextField
                                fullWidth
                                name="ws_base_port"
                                type="number"
                                value={config.ws_base_port}
                                onChange={handleChange}
                                helperText={t('clusterConfig.wsBasePortHelp')}
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600, color: 'text.primary' }}>
                                {t('clusterConfig.dataDirLabel')}
                            </Typography>
                            <TextField
                                fullWidth
                                name="data_dir"
                                value={config.data_dir}
                                onChange={handleChange}
                                helperText={t('clusterConfig.dataDirHelp')}
                                size="medium"
                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                            />
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* WS 客户端注入卡片 */}
            <Card variant="outlined" sx={{
                borderRadius: 4, mt: 3,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.1)'
            }}>
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <CableIcon color="primary" />
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {t('clusterConfig.wsClientInitTitle')}
                            </Typography>
                        </Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={config.init_ws_client_enabled}
                                    onChange={() => handleToggle('init_ws_client_enabled')}
                                    color="primary"
                                />
                            }
                            label={t('clusterConfig.wsClientInitEnable')}
                            labelPlacement="start"
                            sx={{ mr: 0 }}
                        />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('clusterConfig.wsClientInitDesc')}
                    </Typography>

                    <Collapse in={config.init_ws_client_enabled}>
                        <Grid container spacing={3} sx={{ mt: 0.5 }}>
                            <Grid item xs={12}>
                                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                                    {t('clusterConfig.wsClientUrl')}
                                </Typography>
                                <TextField
                                    fullWidth
                                    name="init_ws_client_url"
                                    value={config.init_ws_client_url}
                                    onChange={handleChange}
                                    placeholder="ws://127.0.0.1:5100/onebot/v11/ws"
                                    disabled={config.init_bs_enabled}
                                    helperText={config.init_bs_enabled
                                        ? t('clusterConfig.wsClientUrlBsOverride')
                                        : t('clusterConfig.wsClientUrlHelp')}
                                    size="medium"
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                                    {t('clusterConfig.wsClientToken')}
                                </Typography>
                                <TextField
                                    fullWidth
                                    name="init_ws_client_token"
                                    value={config.init_ws_client_token}
                                    onChange={handleChange}
                                    placeholder="optional"
                                    helperText={t('clusterConfig.wsClientTokenHelp')}
                                    size="medium"
                                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                                />
                            </Grid>
                        </Grid>
                    </Collapse>
                </CardContent>
            </Card>

            {/* BotShepherd 接管设置卡片 */}
            <Card variant="outlined" sx={{
                borderRadius: 4, mt: 3,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 10px 40px -10px rgba(0,0,0,0.1)'
            }}>
                <CardContent sx={{ p: { xs: 3, md: 5 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <HubIcon sx={{ color: '#8b5cf6' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {t('clusterConfig.bsInitTitle')}
                            </Typography>
                        </Box>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={config.init_bs_enabled}
                                    onChange={() => handleToggle('init_bs_enabled')}
                                    color="primary"
                                />
                            }
                            label={t('clusterConfig.bsInitEnable')}
                            labelPlacement="start"
                            sx={{ mr: 0 }}
                        />
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('clusterConfig.bsInitDesc')}
                    </Typography>

                    <Collapse in={config.init_bs_enabled}>
                        <Alert severity="info" sx={{ borderRadius: 2, mt: 1 }}>
                            {t('clusterConfig.bsInitNote')}
                        </Alert>

                        <Grid container spacing={3} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth name="init_bs_client_base_port"
                                    label={t('clusterConfig.bsClientBasePort')}
                                    type="number"
                                    value={config.init_bs_client_base_port}
                                    onChange={handleChange}
                                    helperText={t('clusterConfig.bsClientBasePortHelp')}
                                    size="small"
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth name="init_bs_napcat_host"
                                    label={t('clusterConfig.bsNapcatHost')}
                                    value={config.init_bs_napcat_host}
                                    onChange={handleChange}
                                    helperText={t('clusterConfig.bsNapcatHostHelp')}
                                    size="small"
                                    placeholder="172.17.0.1"
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                                    {t('clusterConfig.bsTargets')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                                    {t('clusterConfig.bsTargetsHelp')}
                                </Typography>
                                <Stack spacing={1}>
                                    {bsTargets.map((target, idx) => (
                                        <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Chip label={idx + 1} size="small" sx={{ minWidth: 28, fontWeight: 700 }} />
                                            <TextField
                                                fullWidth size="small"
                                                value={target}
                                                onChange={(e) => handleBsTargetChange(idx, e.target.value)}
                                                placeholder="ws://192.168.1.210:2536/OneBotv11"
                                                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.2)' : '#fff' } }}
                                            />
                                            <Tooltip title={t('common.delete') || 'Remove'}>
                                                <IconButton size="small" color="error" onClick={() => handleBsTargetRemove(idx)}>
                                                    <RemoveCircleOutlineIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    ))}
                                    <Button
                                        variant="outlined" size="small"
                                        startIcon={<AddCircleOutlineIcon />}
                                        onClick={handleBsTargetAdd}
                                        sx={{ alignSelf: 'flex-start', borderRadius: 2, textTransform: 'none' }}
                                    >
                                        {t('clusterConfig.bsTargetAdd')}
                                    </Button>
                                </Stack>
                            </Grid>
                        </Grid>
                    </Collapse>
                </CardContent>
            </Card>

            {/* 全局保存按钮 */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4 }}>
                <Button
                    variant="contained"
                    startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                    onClick={handleSave}
                    disabled={saving}
                    disableElevation
                    sx={{
                        borderRadius: 2,
                        px: 5,
                        py: 1.2,
                        fontWeight: 700,
                        background: 'linear-gradient(90deg, #2563eb, #3b82f6)',
                        '&:hover': {
                            boxShadow: '0 4px 12px rgba(37,99,235,0.4)',
                        }
                    }}
                >
                    {t('config.saveConfig') || 'Save'}
                </Button>
            </Box>
        </Box>
    );
}
