/**
 * BasicInfo 组件 - 容器基本信息 + 操作按钮 + 二维码登录
 * 参考 NapCat WebUI 风格
 */
import { useEffect, useState } from 'react';
import {
    Box, Typography, Button, CircularProgress, Chip, Divider,
    Grid, Card, CardContent, useTheme, Alert, IconButton, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import MemoryIcon from '@mui/icons-material/Memory';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import { containerApi, type ContainerStats } from '../services/api';
import { useTranslate } from '../i18n';

interface BasicInfoProps {
    name: string;
    node_id: string;
}

export const BasicInfo = ({ name, node_id }: BasicInfoProps) => {
    const [stats, setStats] = useState<Partial<ContainerStats>>({});
    const [qrcode, setQrcode] = useState('');
    const [showQrcode, setShowQrcode] = useState(false);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState('');
    const [deleteDialog, setDeleteDialog] = useState({ open: false, deleteData: false });
    const theme = useTheme();
    const navigate = useNavigate();
    const t = useTranslate();

    const fetchStats = async () => {
        setLoading(true);
        try {
            const data = await containerApi.getStats(name, node_id);
            setStats(data);
            if (data.uin && data.uin !== '未登录 / Not Logged In') {
                setShowQrcode(false);
            }
        } catch (error) {
            console.error('Stats fetch error:', error);
        } finally {
            setLoading(false);
        }
    };

    // 刷新按钮：直接读取容器状态 + 本地二维码文件（零阻塞）
    const handleRefresh = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchStats(), fetchQrcode()]);
        } catch (error) {
            console.error('Refresh error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchQrcode = async () => {
        try {
            const data = await containerApi.getQR(name, node_id);
            if (data.status === 'logged_in') {
                setShowQrcode(false);
                setQrcode('');
            } else if (data.status === 'ok' && data.url) {
                if (data.type === 'file') {
                    setQrcode(data.url);
                } else {
                    setQrcode(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`);
                }
                setShowQrcode(true);
            } else {
                // waiting 状态 — 容器启动中或 QR 尚未生成
                setShowQrcode(true);
                setQrcode('');
            }
        } catch (error) {
            console.error('QR fetch error:', error);
            // 请求失败时仍显示二维码区域（等待/加载中），避免界面无反应
            if (!stats.uin || stats.uin === '未登录 / Not Logged In') {
                setShowQrcode(true);
            }
        }
    };

    const handleAction = async (action: string) => {
        if (action === 'delete') {
            setDeleteDialog({ open: true, deleteData: false });
            return;
        }
        setActionLoading(action);
        try {
            await containerApi.action(name, action, node_id);
            setTimeout(fetchStats, 1500);
        } catch (e) { console.error(e); }
        finally { setActionLoading(''); }
    };

    const confirmDelete = async () => {
        setActionLoading('delete');
        try {
            await containerApi.action(name, 'delete', node_id, deleteDialog.deleteData);
            navigate('/admin');
        } catch (e) { console.error(e); }
        finally {
            setActionLoading('');
            setDeleteDialog({ open: false, deleteData: false });
        }
    };

    const openWebUI = () => {
        if (stats.webui_port && stats.webui_token) {
            // 本地节点用当前浏览器 hostname，远程节点后续通过节点地址替换
            const host = window.location.hostname;
            window.open(`http://${host}:${stats.webui_port}/webui/?token=${stats.webui_token}`, '_blank');
        }
    };

    useEffect(() => {
        fetchStats();
        fetchQrcode();
        const si = setInterval(fetchStats, 15000);
        const qi = setInterval(fetchQrcode, 15000);
        return () => { clearInterval(si); clearInterval(qi); };
    }, [name, node_id]);

    const formatMB = (mb: number) => {
        if (!mb) return '-';
        if (mb < 1024) return `${mb.toFixed(1)} MB`;
        return `${(mb / 1024).toFixed(2)} GB`;
    };

    const isRunning = stats.status === 'running';
    const isLoggedIn = stats.uin && stats.uin !== '未登录 / Not Logged In';
    const qqNumber = stats.uin ? String(stats.uin).replace(/\D/g, '') : '';
    const avatarUrl = (isLoggedIn && qqNumber)
        ? `https://q1.qlogo.cn/g?b=qq&nk=${qqNumber}&s=640`
        : "https://napneko.github.io/assets/newnewlogo.png";

    return (
        <Box>
            {/* 头部状态与操作栏 */}
            <Box sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3,
                p: 2.5, borderRadius: 3,
                background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#fff',
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.03)',
                flexWrap: 'wrap', gap: 2
            }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ position: 'relative' }}>
                        <Box component="img" src={avatarUrl} sx={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', bgcolor: '#fff', filter: isRunning ? 'none' : 'grayscale(100%)', opacity: isRunning ? 1 : 0.6 }} />
                        <Box sx={{
                            position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
                            borderRadius: '50%', bgcolor: isRunning ? '#10b981' : '#94a3b8',
                            border: `2px solid ${theme.palette.background.paper}`
                        }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                            <Chip label={isRunning ? t('basicInfo.running') : (stats.status || t('basicInfo.unknown'))}
                                size="small"
                                sx={{
                                    height: 20, fontSize: '0.7rem', fontWeight: 600,
                                    bgcolor: isRunning ? 'rgba(16,185,129,0.1)' : 'rgba(148,163,184,0.1)',
                                    color: isRunning ? '#059669' : '#64748b',
                                    border: `1px solid ${isRunning ? 'rgba(16,185,129,0.2)' : 'rgba(148,163,184,0.2)'}`
                                }} />
                            {stats.version && stats.version !== 'Unknown' && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', px: 1, borderRadius: 1 }}>
                                    v{stats.version}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {!isRunning ? (
                        <Button size="medium" variant="contained" color="success" startIcon={<PlayArrowIcon />}
                            onClick={() => handleAction('start')} disabled={!!actionLoading}
                            sx={{ borderRadius: 2, boxShadow: 'none', textTransform: 'none' }}>{t('basicInfo.start')}</Button>
                    ) : (
                        <>
                            <Button size="medium" variant="outlined" color="warning" startIcon={<StopIcon />}
                                onClick={() => handleAction('stop')} disabled={!!actionLoading}
                                sx={{ borderRadius: 2, textTransform: 'none' }}>{t('basicInfo.stop')}</Button>
                            <Button size="medium" variant="outlined" color="info" startIcon={<RestartAltIcon />}
                                onClick={() => handleAction('restart')} disabled={!!actionLoading}
                                sx={{ borderRadius: 2, textTransform: 'none' }}>{t('basicInfo.restart')}</Button>
                        </>
                    )}
                    {stats.webui_port && stats.webui_token && (
                        <Button size="medium" variant="contained" startIcon={<OpenInNewIcon />}
                            onClick={openWebUI}
                            sx={{ borderRadius: 2, background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', boxShadow: '0 4px 14px rgba(59,130,246,0.3)', textTransform: 'none', '&:hover': { background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' } }}>
                            WebUI
                        </Button>
                    )}
                    <Tooltip title={t('basicInfo.refreshTooltip')}>
                        <IconButton size="medium" onClick={handleRefresh} disabled={loading}
                            sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                            {loading ? <CircularProgress size={20} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Button size="medium" variant="outlined" color="error" startIcon={<DeleteOutlineIcon />}
                        onClick={() => handleAction('delete')} disabled={!!actionLoading}
                        sx={{ borderRadius: 2, textTransform: 'none' }}>{t('basicInfo.delete')}</Button>
                </Box>
            </Box>

            {/* 二维码区域 */}
            {showQrcode && !isLoggedIn && (
                <Card sx={{
                    mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.warning.main}40`,
                    background: theme.palette.mode === 'dark' ? `linear-gradient(135deg, ${theme.palette.warning.main}15 0%, transparent 100%)` : `linear-gradient(135deg, #fffbeb 0%, #fff 100%)`,
                    boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(245,158,11,0.05)'
                }}>
                    <CardContent sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                            <Box sx={{ p: 1, borderRadius: 2, bgcolor: `${theme.palette.warning.main}20`, mr: 2, display: 'flex' }}>
                                <QrCode2Icon sx={{ fontSize: 24, color: 'warning.main' }} />
                            </Box>
                            <Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.main' }}>{t('basicInfo.qrLogin')}</Typography>
                                <Typography variant="body2" color="text.secondary">{t('basicInfo.qrLoginDesc')}</Typography>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 2 }}>
                            {qrcode ? (
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                    <Box sx={{ p: 2.5, bgcolor: '#fff', borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.05)' }}>
                                        <img src={qrcode} alt="QR Code" style={{ width: 220, height: 220, display: 'block', borderRadius: 8 }} />
                                    </Box>
                                    <Button variant="text" size="small" startIcon={<RefreshIcon />} onClick={fetchQrcode}
                                        sx={{ color: 'text.secondary', fontWeight: 600, borderRadius: 2 }}>
                                        {t('basicInfo.refreshQr')}
                                    </Button>
                                </Box>
                            ) : (
                                <Box sx={{ py: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <CircularProgress size={40} thickness={4} sx={{ color: 'warning.main' }} />
                                    <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                                        {t('basicInfo.fetchingQr')}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    </CardContent>
                </Card>
            )}

            {/* 信息卡片 */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card sx={{
                        height: '100%', borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
                        background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
                        boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.03)',
                        transition: 'transform 0.3s, box-shadow 0.3s',
                        '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: theme.palette.mode === 'dark' ? '0 8px 32px rgba(0,0,0,0.2)' : '0 12px 32px rgba(0,0,0,0.06)'
                        }
                    }}>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(59,130,246,0.1)', mr: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40 }}>
                                    <Box component="img" src={avatarUrl} sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#fff' }} />
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('basicInfo.infoTitle')}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <InfoRow label={t('basicInfo.qqAccount')} value={stats.uin ? String(stats.uin).replace(/\D/g, '') : '-'} highlight />
                                <InfoRow label={t('basicInfo.napcatVersion')} value={stats.version || '-'} />
                                <InfoRow label={t('basicInfo.platform')} value={stats.platform || '-'} />
                                <InfoRow label={t('basicInfo.uptime')} value={stats.uptime_formatted || '-'} />
                                <InfoRow label={t('basicInfo.webuiPort')} value={stats.webui_port ? String(stats.webui_port) : '-'} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card sx={{
                        height: '100%', borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
                        background: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff',
                        boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 4px 20px rgba(0,0,0,0.03)',
                        transition: 'transform 0.3s, box-shadow 0.3s',
                        '&:hover': {
                            transform: 'translateY(-2px)',
                            boxShadow: theme.palette.mode === 'dark' ? '0 8px 32px rgba(0,0,0,0.2)' : '0 12px 32px rgba(0,0,0,0.06)'
                        }
                    }}>
                        <CardContent sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                                <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'rgba(16,185,129,0.1)', mr: 2, display: 'flex' }}>
                                    <MemoryIcon sx={{ fontSize: 24, color: '#10b981' }} />
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 700 }}>{t('basicInfo.systemResources')}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <InfoRow label={t('basicInfo.cpuUsage')} value={`${(stats.cpu_percent || 0).toFixed(1)}%`} />
                                <InfoRow label={t('basicInfo.memUsage')} value={stats.mem_usage ? `${formatMB(stats.mem_usage)} / ${formatMB(stats.mem_limit || 0)}` : '-'} />
                                <Divider sx={{ my: 1, opacity: 0.6 }} />
                                <Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}>{t('basicInfo.networkEndpoints')}</Typography>
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        <Chip label={`HTTP: ${stats.network_endpoints?.http || 0}`} size="small"
                                            sx={{ borderRadius: 1.5, fontWeight: 600, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9', border: `1px solid ${theme.palette.divider}` }} />
                                        <Chip label={`WS: ${stats.network_endpoints?.ws || 0}`} size="small"
                                            sx={{ borderRadius: 1.5, fontWeight: 600, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9', border: `1px solid ${theme.palette.divider}` }} />
                                        <Chip label={`HTTP Client: ${stats.network_endpoints?.http_client || 0}`} size="small"
                                            sx={{ borderRadius: 1.5, fontWeight: 600, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9', border: `1px solid ${theme.palette.divider}` }} />
                                        <Chip label={`WS Client: ${stats.network_endpoints?.ws_client || 0}`} size="small"
                                            sx={{ borderRadius: 1.5, fontWeight: 600, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#f1f5f9', border: `1px solid ${theme.palette.divider}` }} />
                                    </Box>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* 删除确认对话框 */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('basicInfo.confirmDeleteTitle')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }} dangerouslySetInnerHTML={{ __html: t('basicInfo.deleteInstanceDesc').replace('{name}', name) }} />
                    <FormControlLabel
                        control={
                            <Checkbox checked={deleteDialog.deleteData} color="error"
                                onChange={e => setDeleteDialog({ ...deleteDialog, deleteData: e.target.checked })} />
                        }
                        label={
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('basicInfo.deleteWithData')}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {t('basicInfo.deleteDataWarning').replace('{name}', name)}
                                </Typography>
                            </Box>
                        }
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })} color="inherit" sx={{ borderRadius: 2 }}>{t('basicInfo.cancel')}</Button>
                    <Button onClick={confirmDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {deleteDialog.deleteData ? t('basicInfo.deleteInstanceAndData') : t('basicInfo.deleteInstanceOnly')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const InfoRow = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
    <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        p: 1.5, borderRadius: 2,
        bgcolor: highlight ? 'rgba(59,130,246,0.05)' : 'transparent',
        border: highlight ? '1px solid rgba(59,130,246,0.1)' : '1px solid transparent',
        transition: 'background-color 0.2s',
        '&:hover': { bgcolor: highlight ? 'rgba(59,130,246,0.08)' : 'rgba(0,0,0,0.02)' }
    }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" sx={{
            fontWeight: highlight ? 700 : 600,
            fontFamily: 'monospace',
            color: highlight ? '#3b82f6' : 'text.primary',
            bgcolor: highlight ? '#fff' : 'transparent',
            px: highlight ? 1.5 : 0, py: highlight ? 0.5 : 0, borderRadius: 1.5,
            boxShadow: highlight ? '0 2px 8px rgba(0,0,0,0.04)' : 'none'
        }}>{value}</Typography>
    </Box>
);