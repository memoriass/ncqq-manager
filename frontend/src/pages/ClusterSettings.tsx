import React, { useEffect, useState } from 'react';
import {
    Box, Typography, TextField, Button, CircularProgress, Card, CardContent, Grid, useTheme, Alert, Link
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import InfoIcon from '@mui/icons-material/Info';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';
import { nodeApi } from '../services/api';

export default function ClusterSettings() {
    const theme = useTheme();
    const t = useTranslate();
    const toast = useToast();
    const [config, setConfig] = useState({ docker_image: "mlikiowa/napcat-docker:latest", webui_base_port: 6000, http_base_port: 3000, ws_base_port: 3001, api_key: "", data_dir: "" });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const data = await nodeApi.getClusterConfig();
                setConfig((data as Record<string, unknown>).config as typeof config);
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

    const handleSave = async () => {
        setSaving(true);
        try {
            await nodeApi.saveClusterConfig(config);
            toast.success(t('config.saved') || 'Saved Successfully');
        } catch (e) {
            console.error(e);
            toast.error(t('config.saveFailed') || 'Save failed');
        } finally {
            setSaving(false);
        }
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

                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 5, pt: 3, borderTop: `1px dashed ${theme.palette.divider}` }}>
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
                </CardContent>
            </Card>
        </Box>
    );
}
