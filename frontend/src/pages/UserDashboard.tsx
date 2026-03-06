import { useEffect, useState, useContext } from 'react';
import {
    Box, Typography, CircularProgress,
    Button, IconButton, useTheme, Skeleton, Pagination,
    TextField, InputAdornment
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloudOffIcon from '@mui/icons-material/CloudOff';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import SearchIcon from '@mui/icons-material/Search';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { publicApi, containerApi, type Container } from '../services/api';

interface QRState {
    status: 'logged_in' | 'loaded' | 'waiting' | 'error';
    url?: string;
    uin?: string;
}

export default function UserDashboard() {
    const navigate = useNavigate();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const t = useTranslate();

    const [containers, setContainers] = useState<Container[]>([]);
    const [loading, setLoading] = useState(true);
    const [qrCodes, setQrCodes] = useState<Record<string, QRState>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [refreshingCards, setRefreshingCards] = useState<Record<string, boolean>>({});

    const [page, setPage] = useState(1);
    const rowsPerPage = 12;
    const filteredContainers = containers.filter(c => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return c.name.toLowerCase().includes(q)
            || (c.uin && c.uin.toLowerCase().includes(q))
            || c.status.toLowerCase().includes(q);
    });
    const totalPages = Math.ceil(filteredContainers.length / rowsPerPage);
    const displayedContainers = filteredContainers.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    const fetchContainers = async () => {
        try {
            let list: Container[] = [];
            try {
                const data = await publicApi.containers();
                list = data.containers || [];
            } catch {
                // 公开接口异常时回退到管理接口（已登录管理员可用）
                const data = await containerApi.list();
                list = data.containers || [];
            }

            setContainers(list);
            // 接口已返回 uin，直接设置已登录容器的 QR 状态
            setQrCodes(prev => {
                const next = { ...prev };
                for (const c of list) {
                    if (c.uin) {
                        next[c.name] = { status: 'logged_in', uin: c.uin };
                    }
                }
                return next;
            });
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadQR = async (name: string, node_id = 'local') => {
        try {
            const data = await publicApi.getQR(name, node_id);
            if (data.status === 'logged_in') {
                setQrCodes(prev => ({ ...prev, [name]: { status: 'logged_in', uin: data.uin } }));
            } else if (data.status === 'ok' && data.url) {
                const url = data.type === 'file' ? data.url
                    : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`;
                setQrCodes(prev => ({ ...prev, [name]: { status: 'loaded', url } }));
            } else {
                setQrCodes(prev => ({ ...prev, [name]: { status: 'waiting' } }));
            }
        } catch {
            setQrCodes(prev => ({ ...prev, [name]: { status: 'error' } }));
        }
    };

    // 单卡片刷新：直接读取挂载目录中的二维码文件 + 容器状态
    const refreshCard = async (name: string, node_id = 'local') => {
        setRefreshingCards(prev => ({ ...prev, [name]: true }));
        try {
            // 直接获取二维码（后端优先读本地文件，零阻塞）
            await loadQR(name, node_id);
            // 同步刷新容器列表
            await fetchContainers();
        } finally {
            setRefreshingCards(prev => ({ ...prev, [name]: false }));
        }
    };

    useEffect(() => {
        fetchContainers();
        let interval: ReturnType<typeof setInterval>;
        const start = () => { interval = setInterval(fetchContainers, 15000); };
        const stop = () => clearInterval(interval);
        const onVis = () => {
            if (document.visibilityState === 'visible') { fetchContainers(); start(); } else { stop(); }
        };
        start();
        document.addEventListener('visibilitychange', onVis);
        return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
    }, []);

    useEffect(() => {
        // 只为运行中且未确认登录的容器请求 QR 状态
        const needQR = containers.filter(c => c.status === 'running' && !c.uin);
        needQR.forEach(c => loadQR(c.name, c.node_id));
        const interval = setInterval(() => {
            const pending = containers.filter(c => c.status === 'running' && !c.uin);
            pending.forEach(c => loadQR(c.name, c.node_id));
        }, 15000);
        return () => clearInterval(interval);
    }, [containers]);

    return (
        <Box sx={{
            p: { xs: 2, md: 4, lg: 6 }, minHeight: '100vh', bgcolor: 'background.default'
        }}>
            <Box sx={{ maxWidth: 1100, mx: 'auto' }}>

                {/* Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                    <Box>
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 1, color: 'text.primary' }}>
                            {t('user.title')}
                        </Typography>
                        <Typography variant="subtitle1" color="text.secondary">
                            {t('user.subtitle')}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TextField
                            size="small"
                            placeholder={t('user.searchPlaceholder')}
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                width: { xs: 140, sm: 200 },
                                '& .MuiOutlinedInput-root': {
                                    borderRadius: 2,
                                    height: 36,
                                    fontSize: '0.85rem',
                                },
                            }}
                        />
                        <Button
                            variant="outlined"
                            color="inherit"
                            size="small"
                            startIcon={<AdminPanelSettingsIcon />}
                            onClick={() => navigate('/login')}
                            sx={{ borderColor: 'divider', color: 'text.secondary', borderRadius: 2, height: 36, textTransform: 'none' }}
                        >
                            {t('user.adminLogin')}
                        </Button>
                        <IconButton onClick={toggleLanguage} aria-label="Toggle language">
                            <TranslateIcon />
                        </IconButton>
                        <IconButton onClick={colorMode.toggleTheme} aria-label="Toggle theme">
                            {theme.palette.mode === 'dark' ? <Brightness7Icon /> : <Brightness4Icon />}
                        </IconButton>
                    </Box>
                </Box>

                {/* Cards */}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 4 }}>
                    {loading ? [...Array(3)].map((_, i) => <Skeleton key={i} variant="rounded" height={300} sx={{ borderRadius: 4, bgcolor: 'rgba(255,255,255,0.6)' }} />)
                        : filteredContainers.length === 0 ? (
                            <Box sx={{ gridColumn: '1 / -1', py: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(16px)', borderRadius: 4, border: '1px solid rgba(255,255,255,0.4)', boxShadow: '0 4px 30px rgba(0,0,0,0.05)' }}>
                                <CloudOffIcon sx={{ fontSize: 60, color: '#94a3b8', mb: 2 }} />
                                <Typography variant="h6" sx={{ fontWeight: 600, color: '#475569' }}>{searchQuery ? t('user.noSearchResults') : t('user.noBots')}</Typography>
                                <Typography variant="body2" color="text.secondary">{searchQuery ? t('user.tryDifferentSearch') : t('user.contactAdmin')}</Typography>
                            </Box>
                        ) : displayedContainers.map(c => {
                            const qr = qrCodes[c.name] || { status: 'loading' };
                            const isRefreshing = refreshingCards[c.name] || false;
                            return (
                                <Box key={c.id} sx={{ background: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(16px)', borderRadius: 4, border: `1px solid ${theme.palette.divider}`, p: 3, boxShadow: '0 10px 40px -10px rgba(0,0,0,0.08)', position: 'relative', overflow: 'hidden', transition: 'all 0.3s', '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' } }}>

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, position: 'relative', zIndex: 1 }}>
                                        <Box>
                                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>{c.name}</Typography>
                                            {c.status === 'running' ? (
                                                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: 'rgba(16,185,129,0.1)', color: '#059669', px: 1, py: 0.25, borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600 }}>
                                                    <Box sx={{ width: 6, height: 6, bgcolor: '#10b981', borderRadius: '50%' }} /> {t('admin.online')}
                                                </Typography>
                                            ) : (
                                                <Typography variant="caption" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: 'rgba(100,116,139,0.1)', color: theme.palette.text.secondary, px: 1, py: 0.25, borderRadius: 8, border: '1px solid rgba(100,116,139,0.2)', fontWeight: 600 }}>
                                                    <Box sx={{ width: 6, height: 6, bgcolor: '#64748b', borderRadius: '50%' }} /> {c.status.toUpperCase()}
                                                </Typography>
                                            )}
                                        </Box>
                                    </Box>

                                    <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.6)', p: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}`, display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: 220, justifyContent: 'center', position: 'relative', zIndex: 1 }}>

                                        <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? '#1e293b' : '#fff', p: 1, borderRadius: 2, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: `1px solid ${theme.palette.divider}`, width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {c.status !== 'running' ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', p: 2 }}>
                                                    <CloudOffIcon sx={{ color: '#94a3b8', fontSize: 40, mb: 1 }} />
                                                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>{t('user.offline')}</Typography>
                                                </Box>
                                            ) : qr.status === 'loaded' ? (
                                                <img src={qr.url} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
                                            ) : qr.status === 'logged_in' ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', p: 2 }}>
                                                    <Box component="img" src={qr.uin ? `https://q1.qlogo.cn/g?b=qq&nk=${String(qr.uin).replace(/\D/g, '')}&s=640` : "https://napneko.github.io/assets/newnewlogo.png"} sx={{ width: 44, height: 44, borderRadius: '50%', mb: 1, border: '2px solid #10b981', bgcolor: '#fff' }} />
                                                    <Typography variant="caption" sx={{ color: '#059669', fontWeight: 600 }}>{t('user.loggedIn')}</Typography>
                                                    {qr.uin && <Typography variant="caption" sx={{ color: '#64748b', mt: 0.5 }}>QQ: {String(qr.uin).replace(/\D/g, '')}</Typography>}
                                                </Box>
                                            ) : qr.status === 'waiting' || qr.status === 'loading' ? (
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', p: 2 }}>
                                                    <CircularProgress size={32} sx={{ color: '#94a3b8', mb: 1 }} />
                                                    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 600 }}>{t('user.refreshing')}</Typography>
                                                </Box>
                                            ) : (
                                                <Typography variant="caption" color="error">{t('user.loadFailed')}</Typography>
                                            )}
                                        </Box>

                                        <Button
                                            variant="text"
                                            size="small"
                                            disabled={isRefreshing}
                                            onClick={() => refreshCard(c.name, c.node_id)}
                                            startIcon={isRefreshing ? <CircularProgress size={14} /> : <RefreshIcon />}
                                            sx={{ mt: 2, borderRadius: 8, color: 'text.secondary', textTransform: 'none', fontWeight: 600 }}
                                        >
                                            {isRefreshing ? t('user.refreshing') : t('user.refreshStatus')}
                                        </Button>
                                    </Box>
                                </Box>
                            );
                        })}
                </Box>

                {totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                        <Pagination
                            count={totalPages}
                            page={page}
                            onChange={(e, value) => setPage(value)}
                            color="primary"
                            shape="rounded"
                        />
                    </Box>
                )}

            </Box>
        </Box>
    );
}
