import React, { useEffect, useState, useContext, useCallback } from 'react';
import { Box, Typography, IconButton, Collapse, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Drawer, useTheme } from '@mui/material';
import { useNavigate, Outlet, useLocation } from 'react-router-dom';
import PublicIcon from '@mui/icons-material/Public';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import NapCatIcon from '../components/NapCatIcon';
import DashboardIcon from '@mui/icons-material/Dashboard';
import StorageIcon from '@mui/icons-material/Storage';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import SettingsIcon from '@mui/icons-material/Settings';
import HubIcon from '@mui/icons-material/Hub';
import HistoryIcon from '@mui/icons-material/History';
import PeopleIcon from '@mui/icons-material/People';
import ImageIcon from '@mui/icons-material/Image';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import BackupIcon from '@mui/icons-material/Backup';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { containerApi, authApi, type Container } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useToast } from '../components/Toast';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

const drawerWidth = 280;

export default function AdminLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const t = useTranslate();
    const [containers, setContainers] = useState<Container[]>([]);
    const [openInstances, setOpenInstances] = useState(true);
    const toast = useToast();

    // WS 驱动容器列表（替代 HTTP 轮询，后端 3s 推送一次含 uin）
    const { data: wsData, connected: wsConnected } = useWebSocket<{ type: string; data: Container[] }>({
        path: '/ws/events',
    });

    // WS 推送到达时同步 containers state
    useEffect(() => {
        if (wsData?.type === 'containers' && Array.isArray(wsData.data)) {
            setContainers(wsData.data);
        }
    }, [wsData]);

    // 手动刷新（操作后立即反馈，不等 WS 3s 推送）
    const refreshContainers = useCallback(async () => {
        try {
            const data = await containerApi.list();
            setContainers(data.containers || []);
        } catch {
            toast.error('刷新容器列表失败');
        }
    }, []);

    // WS 未连接时回退到 HTTP 轮询（首次加载 + 断线容灾）
    useEffect(() => {
        if (wsConnected) return;
        refreshContainers();
        const fallback = setInterval(refreshContainers, 10000);
        return () => clearInterval(fallback);
    }, [wsConnected, refreshContainers]);

    const handleLogout = async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        navigate('/login');
    };

    return (
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* Sidebar */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        backgroundColor: theme.palette.background.paper,
                        borderRight: `1px solid ${theme.palette.divider}`
                    },
                }}
            >
                <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <Box sx={{ p: 0.5, borderRadius: 2, bgcolor: '#fff', display: 'flex' }}>
                        <NapCatIcon fontSize="medium" />
                    </Box>
                    <Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{t('admin.title')}</Typography>
                        <Typography variant="caption" color="text.secondary">{t('admin.subtitle')}</Typography>
                    </Box>
                </Box>
                <Box sx={{ flex: 1, overflowY: 'auto' }}>
                    <List component="nav" sx={{ px: 2, py: 2 }}>
                        {([
                            { path: '/admin', icon: <DashboardIcon />, label: t('admin.managedInstances') },
                            { path: '/admin/cluster-settings', icon: <SettingsIcon />, label: t('admin.instanceSettings') },
                            { path: '/admin/nodes', icon: <HubIcon />, label: t('admin.nodes') },
                            { path: '/admin/users', icon: <PeopleIcon />, label: t('admin.userManagement') },
                            { path: '/admin/operation-logs', icon: <HistoryIcon />, label: t('admin.operationLogs') },
                            { path: '/admin/images', icon: <ImageIcon />, label: t('admin.imageManager') },
                            { path: '/admin/alerts', icon: <NotificationsActiveIcon />, label: t('admin.alerts') },
                            { path: '/admin/backup', icon: <BackupIcon />, label: t('admin.backup') },
                            { path: '/admin/scheduler', icon: <ScheduleIcon />, label: t('admin.scheduler') },
                        ] as { path: string; icon: React.ReactNode; label: string }[]).map(item => {
                            const isActive = location.pathname === item.path;
                            return (
                                <ListItem disablePadding sx={{ mb: 1 }} key={item.path}>
                                    <ListItemButton
                                        selected={isActive}
                                        onClick={() => navigate(item.path)}
                                        sx={{ borderRadius: 2, '&.Mui-selected': { bgcolor: 'rgba(59, 130, 246, 0.15)', '&:hover': { bgcolor: 'rgba(59, 130, 246, 0.25)' } } }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 40, color: isActive ? '#60a5fa' : 'text.secondary' }}>{item.icon}</ListItemIcon>
                                        <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: isActive ? 600 : 500, color: isActive ? '#60a5fa' : 'text.primary' }} />
                                    </ListItemButton>
                                </ListItem>
                            );
                        })}

                    </List>
                </Box>
                <Box sx={{ position: 'absolute', bottom: 0, width: '100%', p: 2 }}>
                    <ListItem disablePadding sx={{ mb: 1 }}>
                        <ListItemButton onClick={() => navigate('/')} sx={{ borderRadius: 2 }}>
                            <ListItemIcon sx={{ minWidth: 40 }}><PublicIcon sx={{ color: 'text.secondary' }} /></ListItemIcon>
                            <ListItemText primary={t('admin.userSpaceBoard')} primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }} />
                        </ListItemButton>
                    </ListItem>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1, pt: 0 }}>
                        {/* WS 连接状态指示 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <FiberManualRecordIcon sx={{ fontSize: 10, color: wsConnected ? '#22c55e' : '#ef4444' }} />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                {wsConnected ? t('admin.wsConnected') : t('admin.wsDisconnected')}
                            </Typography>
                        </Box>
                        <Box>
                            <IconButton onClick={toggleLanguage} size="small" sx={{ mr: 1 }} aria-label="Toggle language">
                                <TranslateIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={colorMode.toggleTheme} size="small" sx={{ mr: 1 }} aria-label="Toggle theme">
                                {theme.palette.mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
                            </IconButton>
                            <IconButton onClick={handleLogout} size="small" sx={{ color: 'error.main' }}>
                                <ExitToAppIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </Box>
                </Box>
            </Drawer>

            {/* Main content Area */}
            <Box component="main" sx={{ flexGrow: 1, p: 0, bgcolor: theme.palette.background.default, minHeight: '100vh', overflow: 'auto' }}>
                <Outlet context={{ containers, refreshContainers }} />
            </Box>
        </Box>
    );
}
