import React, { useEffect, useState, useCallback } from 'react';
import {
    Box, Typography, Button, TextField, Skeleton, IconButton, useTheme,
    Select, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions,
    FormControlLabel, Checkbox, Pagination, InputAdornment, CircularProgress
} from '@mui/material';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { containerApi, nodeApi, imageApi, type Container, type ContainerStats, type Node, type CreateContainerRequest, type DockerImage } from '../services/api';
import { useToast } from '../components/Toast';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import PowerSettingsNewIcon from '@mui/icons-material/PowerSettingsNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import NapCatIcon from '../components/NapCatIcon';
import AddIcon from '@mui/icons-material/Add';
import SettingsIcon from '@mui/icons-material/Settings';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import SearchIcon from '@mui/icons-material/Search';
import { useTranslate } from '../i18n';

export default function Dashboard() {
    const navigate = useNavigate();
    const theme = useTheme();
    const t = useTranslate();
    const toast = useToast();
    const [loading, setLoading] = useState(true);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [selectedNode, setSelectedNode] = useState('local');
    // Stats 独立存储（CPU/内存等重量级数据，低频 HTTP 获取）
    const [statsMap, setStatsMap] = useState<Record<string, ContainerStats>>({});

    // 批量操作状态
    const [isBatchMode, setIsBatchMode] = useState(false);
    const [selectedContainers, setSelectedContainers] = useState<string[]>([]);
    // 单容器操作 loading：key = "containerName:action"
    const [actionLoading, setActionLoading] = useState('');
    // 批量操作进度
    const [batchProgress, setBatchProgress] = useState<{ total: number; done: number; ok: number } | null>(null);

    // 容器列表：从 AdminLayout WS 推送的 context 获取（需在 filteredContainers 之前定义）
    const context = useOutletContext<{ containers?: Container[]; refreshContainers?: () => void }>();
    const containers = context?.containers || [];

    // 分页 + 搜索状态
    const [page, setPage] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const rowsPerPage = 12;
    const filteredContainers = (selectedNode === 'all' ? containers : containers.filter(c => c.node_id === selectedNode))
        .filter(c => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return c.name.toLowerCase().includes(q)
                || (c.uin && c.uin.toLowerCase().includes(q))
                || c.status.toLowerCase().includes(q);
        });
    const totalPages = Math.ceil(filteredContainers.length / rowsPerPage);
    const displayedContainers = filteredContainers.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    // 搜索高亮
    const highlight = (text: string) => {
        const q = searchQuery.trim();
        if (!q) return text;
        const idx = text.toLowerCase().indexOf(q.toLowerCase());
        if (idx === -1) return text;
        return <>{text.slice(0, idx)}<Box component="span" sx={{ bgcolor: '#fef08a', color: '#000', borderRadius: 0.5, px: 0.25 }}>{text.slice(idx, idx + q.length)}</Box>{text.slice(idx + q.length)}</>;
    };

    const handleSelectAll = () => {
        if (selectedContainers.length === filteredContainers.length) {
            setSelectedContainers([]);
        } else {
            setSelectedContainers(filteredContainers.map(c => c.name));
        }
    };

    // 监听退出批量模式时清空选项
    useEffect(() => {
        if (!isBatchMode) setSelectedContainers([]);
    }, [isBatchMode]);

    const handleBatchSelect = (name: string) => {
        setSelectedContainers(prev =>
            prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
        );
    };

    const handleBatchAction = async (action: string) => {
        if (selectedContainers.length === 0) return;
        const total = selectedContainers.length;
        setBatchProgress({ total, done: 0, ok: 0 });
        let ok = 0;
        for (let i = 0; i < total; i++) {
            try {
                await containerApi.action(selectedContainers[i], action, selectedNode);
                ok++;
            } catch { /* count as fail */ }
            setBatchProgress({ total, done: i + 1, ok });
        }
        const fail = total - ok;
        if (fail === 0) toast.success(`${t('admin.' + action)} ${ok} ${t('admin.instances')} ✓`);
        else toast.warning(`${ok} ✓ / ${fail} ✗`);
        setBatchProgress(null);
        fetchContainers();
        setIsBatchMode(false);
    };
    const [openCreate, setOpenCreate] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [createForm, setCreateForm] = useState({
        name: '', docker_image: '', webui_port: 0, http_port: 0, ws_port: 0,
        memory_limit: 0, restart_policy: 'always', network_mode: 'bridge', env_vars: ''
    });
    const [localImages, setLocalImages] = useState<DockerImage[]>([]);

    const openCreateDialog = async () => {
        setOpenCreate(true);
        try {
            const data = await imageApi.list();
            setLocalImages(data.images || []);
        } catch { /* ignore */ }
    };

    // 删除确认对话框状态
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; name: string; node_id: string; deleteData: boolean }>({
        open: false, name: '', node_id: 'local', deleteData: false
    });

    // 首次加载：等待 WS 数据到达或超时后关闭 loading
    useEffect(() => {
        if (containers.length > 0 || !loading) return;
        const timer = setTimeout(() => setLoading(false), 3000); // 3s 兜底
        return () => clearTimeout(timer);
    }, []);

    // WS 推送到达后立即关闭 loading
    useEffect(() => {
        if (containers.length > 0) setLoading(false);
    }, [containers]);

    const fetchNodes = async () => {
        try {
            const data = await nodeApi.list();
            setNodes(data.nodes || []);
        } catch (e) {
            toast.error('获取节点列表失败');
        }
    };

    // 手动刷新容器列表（操作后立即反馈）
    const fetchContainers = useCallback(async () => {
        if (context?.refreshContainers) {
            await context.refreshContainers();
        }
    }, [context]);

    // Stats 低频轮询（15s）— CPU/内存等重量级数据独立获取
    const fetchStats = useCallback(async () => {
        const hasRunning = containers.some(c => c.status === 'running');
        if (!hasRunning) return;
        try {
            const batchData = await containerApi.getBatchStats();
            setStatsMap(batchData.stats || {});
        } catch {
            // batch stats 失败不影响容器列表显示
        }
    }, [containers]);

    useEffect(() => {
        fetchStats(); // 首次加载 stats
        fetchNodes();

        // Handle initial node selection from URL
        const params = new URLSearchParams(window.location.search);
        const nodeParam = params.get('node');
        if (nodeParam) {
            setSelectedNode(nodeParam);
        }
    }, []);

    // 节点筛选持久化到 URL
    useEffect(() => {
        const url = new URL(window.location.href);
        if (selectedNode && selectedNode !== 'local') {
            url.searchParams.set('node', selectedNode);
        } else {
            url.searchParams.delete('node');
        }
        window.history.replaceState({}, '', url.toString());
    }, [selectedNode]);

    // Stats 20s 轮询（页面可见时才跑，配合后端 15s 缓存周期）
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        const startPolling = () => {
            interval = setInterval(fetchStats, 20000);
        };
        const stopPolling = () => {
            clearInterval(interval);
        };
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                fetchStats();
                startPolling();
            } else {
                stopPolling();
            }
        };
        startPolling();
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [fetchStats]);

    const handleAction = async (e: React.MouseEvent, name: string, action: string, node_id: string = 'local') => {
        if (e) e.stopPropagation();
        if (action === 'delete') {
            setDeleteDialog({ open: true, name, node_id, deleteData: false });
            return;
        }
        const key = `${name}:${action}`;
        setActionLoading(key);
        try {
            await containerApi.action(name, action, node_id);
            toast.success(`${name} → ${t('admin.' + action)} ✓`);
            fetchContainers();
        } catch (e) {
            toast.error(`${name} ${t('admin.' + action)} ✗`);
        } finally { setActionLoading(''); }
    };

    const confirmDelete = async () => {
        const { name, node_id, deleteData } = deleteDialog;
        try {
            await containerApi.action(name, 'delete', node_id, deleteData);
            toast.success(`${name} ${t('admin.deleteText')} ✓`);
            fetchContainers();
        } catch (e) { toast.error(`${name} ${t('admin.deleteText')} ✗`); }
        setDeleteDialog({ open: false, name: '', node_id: 'local', deleteData: false });
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.name) return;
        const body: CreateContainerRequest = { name: createForm.name, node_id: selectedNode === 'all' ? 'local' : selectedNode };
        if (showAdvanced) {
            if (createForm.docker_image) body.docker_image = createForm.docker_image;
            if (createForm.webui_port > 0) body.webui_port = createForm.webui_port;
            if (createForm.http_port > 0) body.http_port = createForm.http_port;
            if (createForm.ws_port > 0) body.ws_port = createForm.ws_port;
            if (createForm.memory_limit > 0) body.memory_limit = createForm.memory_limit;
            body.restart_policy = createForm.restart_policy;
            body.network_mode = createForm.network_mode;
            if (createForm.env_vars.trim()) body.env_vars = createForm.env_vars.split('\n').filter(Boolean);
        }
        try {
            await containerApi.create(body);
            toast.success(`${createForm.name} ${t('admin.deployBtn')} ✓`);
            setCreateForm({ name: '', docker_image: '', webui_port: 0, http_port: 0, ws_port: 0, memory_limit: 0, restart_policy: 'always', network_mode: 'bridge', env_vars: '' });
            setOpenCreate(false);
            setShowAdvanced(false);
            fetchContainers();
        } catch (e) { toast.error(String(e)); }
    };

    return (
        <Box sx={{ p: { xs: 3, md: 6 }, pt: 2, maxWidth: 1200, mx: 'auto' }}>
            {/* Fleet Title and Top Right Actions */}
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                        {t('admin.instances').toUpperCase()}
                    </Typography>
                </Box>
                <Button
                    variant="text"
                    size="small"
                    onClick={() => navigate('/admin/cluster-settings')}
                    startIcon={<SettingsIcon fontSize="small" />}
                    sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.75rem', '&:hover': { bgcolor: 'rgba(37,99,235,0.05)' } }}
                >
                    {t('admin.instanceSettings')}
                </Button>
            </Box>

            {/* Header Toolbar */}
            <Box sx={{ mb: 4, display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    {isBatchMode ? (
                        <>
                            <Button variant="outlined" color="primary" onClick={handleSelectAll} disabled={!!batchProgress} sx={{ borderRadius: 2, height: 38 }}>
                                {selectedContainers.length === containers.length ? t('admin.deselectAll') : t('admin.selectAll')}
                            </Button>
                            <Button variant="outlined" color="inherit" onClick={() => setIsBatchMode(false)} disabled={!!batchProgress} sx={{ borderRadius: 2, height: 38 }}>
                                {t('admin.cancelText')}
                            </Button>
                            <Button variant="contained" color="success" onClick={() => handleBatchAction('start')} disabled={selectedContainers.length === 0 || !!batchProgress} sx={{ borderRadius: 2, height: 38 }}>
                                {t('admin.start')}
                            </Button>
                            <Button variant="contained" color="warning" onClick={() => handleBatchAction('stop')} disabled={selectedContainers.length === 0 || !!batchProgress} sx={{ borderRadius: 2, height: 38 }}>
                                {t('admin.stop')}
                            </Button>
                            <Button variant="contained" color="error" onClick={() => handleBatchAction('delete')} disabled={selectedContainers.length === 0 || !!batchProgress} sx={{ borderRadius: 2, height: 38 }}>
                                {t('admin.deleteText')}
                            </Button>
                            {batchProgress ? (
                                <Typography variant="body2" sx={{ ml: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <CircularProgress size={16} /> {batchProgress.done}/{batchProgress.total} ({batchProgress.ok} ✓)
                                </Typography>
                            ) : (
                                <Typography variant="body2" sx={{ ml: 1 }}>{t('admin.selected').replace('{count}', String(selectedContainers.length))}</Typography>
                            )}
                        </>
                    ) : (
                        <Button variant="outlined" color="inherit" onClick={() => setIsBatchMode(true)} sx={{ borderRadius: 2, height: 38, fontSize: '0.875rem', color: 'text.primary', borderColor: theme.palette.divider, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff', whiteSpace: 'nowrap' }}>
                            {t('admin.batchOps')}
                        </Button>
                    )}
                    <IconButton onClick={() => { fetchContainers(); fetchStats(); }} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, height: 38, width: 38, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}>
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                    <Button variant="contained" onClick={openCreateDialog} startIcon={<AddIcon />} sx={{ borderRadius: 2, background: '#2563eb', height: 38, px: 3, fontSize: '0.875rem', whiteSpace: 'nowrap', boxShadow: 'none', '&:hover': { background: '#1d4ed8', boxShadow: 'none' } }}>
                        {t('admin.newInstance')}
                    </Button>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder={t('admin.searchPlaceholder')}
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
                                </InputAdornment>
                            ),
                        }}
                        sx={{ width: { xs: 160, sm: 220 }, '& .MuiOutlinedInput-root': { height: 38, borderRadius: 2, fontSize: '0.875rem', bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' } }}
                    />
                    <Select
                        size="small"
                        value={selectedNode}
                        onChange={(e) => setSelectedNode(e.target.value)}
                        sx={{ minWidth: 220, height: 38, borderRadius: 2, fontSize: '0.875rem', borderColor: theme.palette.divider, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : '#fff' }}
                    >
                        <MenuItem value="all">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {t('admin.allNodes')}
                            </Box>
                        </MenuItem>
                        {nodes.map((node) => (
                            <MenuItem key={node.id} value={node.id}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: node.status === 'online' ? '#10b981' : '#f43f5e' }} />
                                    {node.name} - {node.address}
                                </Box>
                            </MenuItem>
                        ))}
                    </Select>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 3 }}>
                {loading ? [...Array(3)].map((_, i) => <Skeleton key={i} variant="rounded" height={200} sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: 3 }} />)
                    : filteredContainers.length === 0 ? (
                        <Box sx={{ gridColumn: '1 / -1', p: 8, textAlign: 'center', borderRadius: 3, border: `1px dashed ${theme.palette.divider}`, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
                            <Typography color="text.secondary">{searchQuery ? t('admin.noSearchResults') : t('admin.noEnv')}</Typography>
                        </Box>
                    ) : displayedContainers.map(c => (
                        <Box key={c.id} onClick={(e) => {
                            if (isBatchMode) {
                                e.stopPropagation();
                                handleBatchSelect(c.name);
                            } else {
                                navigate(`/admin/config/${c.node_id}/${c.name}`);
                            }
                        }} sx={{ position: 'relative', cursor: 'pointer', borderRadius: 3, background: theme.palette.mode === 'dark' ? 'rgba(45, 45, 50, 0.4)' : '#fff', border: `1px solid ${selectedContainers.includes(c.name) ? '#3b82f6' : theme.palette.divider}`, overflow: 'hidden', transition: 'all 0.3s', '&:hover': { border: '1px solid rgba(59,130,246,0.5)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' } }}>
                            {isBatchMode && (
                                <Box sx={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
                                    <Checkbox checked={selectedContainers.includes(c.name)} onChange={() => handleBatchSelect(c.name)} onClick={e => e.stopPropagation()} />
                                </Box>
                            )}
                            <Box sx={{ p: 3 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {(() => {
                                            const uin = c.uin || statsMap[c.name]?.uin;
                                            return uin && uin !== '未登录 / Not Logged In' ? (
                                                <Box component="img" src={`https://q1.qlogo.cn/g?b=qq&nk=${String(uin).replace(/\D/g, '')}&s=640`} sx={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                                            ) : (
                                                <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                    <NapCatIcon sx={{ fontSize: 36 }} />
                                                </Box>
                                            );
                                        })()}
                                    </Box>
                                    {c.status === 'running' && c.uin ? (
                                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.25, borderRadius: 8, bgcolor: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)', fontWeight: 600, mr: isBatchMode ? 4 : 0 }}>
                                            <Box sx={{ width: 6, height: 6, bgcolor: '#10b981', borderRadius: '50%' }} /> {t('admin.online')}
                                        </Typography>
                                    ) : c.status === 'running' ? (
                                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.25, borderRadius: 8, bgcolor: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.2)', fontWeight: 600, mr: isBatchMode ? 4 : 0 }}>
                                            <Box sx={{ width: 6, height: 6, bgcolor: '#f59e0b', borderRadius: '50%' }} /> {t('admin.notLoggedIn')}
                                        </Typography>
                                    ) : (
                                        <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.25, borderRadius: 8, bgcolor: 'rgba(100,116,139,0.1)', color: theme.palette.text.secondary, border: '1px solid rgba(100,116,139,0.2)', fontWeight: 600, mr: isBatchMode ? 4 : 0 }}>
                                            <Box sx={{ width: 6, height: 6, bgcolor: '#64748b', borderRadius: '50%' }} /> {c.status === 'exited' ? t('admin.offline') : c.status === 'paused' ? t('admin.paused') : c.status === 'created' ? t('admin.created') : c.status.toUpperCase()}
                                        </Typography>
                                    )}
                                </Box>
                                <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: 'text.primary' }} noWrap>{highlight(c.name)}</Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>ID: {c.id}</Typography>
                                {statsMap[c.name] && statsMap[c.name].cpu_percent != null && c.status === 'running' && (
                                    <Typography variant="caption" sx={{ mt: 0.5, display: 'block', color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.7rem' }}>
                                        CPU {(statsMap[c.name].cpu_percent ?? 0).toFixed(1)}% · {t('admin.memory')} {statsMap[c.name].mem_usage ?? 0}MB{(statsMap[c.name].mem_limit ?? 0) > 0 ? `/${statsMap[c.name].mem_limit}MB` : ''}
                                    </Typography>
                                )}
                            </Box>

                            {!isBatchMode && (() => {
                                const isLoading = actionLoading.startsWith(c.name + ':');
                                const loadingAction = actionLoading.split(':')[1];
                                const btn = (action: string, icon: React.ReactNode, color: string) => (
                                    <IconButton size="small" disabled={isLoading} onClick={(e) => handleAction(e, c.name, action, c.node_id)}
                                        sx={{ color, bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#fff', border: `1px solid ${theme.palette.divider}` }}>
                                        {isLoading && loadingAction === action ? <CircularProgress size={16} /> : icon}
                                    </IconButton>
                                );
                                return (
                                <Box sx={{ bgcolor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.3)' : '#f8fafc', borderTop: `1px solid ${theme.palette.divider}`, p: 2, display: 'flex', justifyContent: 'space-between' }}>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        {c.status === 'running' && (
                                            <>
                                                {btn('pause', <PauseIcon fontSize="small" />, '#f59e0b')}
                                                {btn('stop', <StopIcon fontSize="small" />, '#ef4444')}
                                                {btn('restart', <RefreshIcon fontSize="small" />, '#3b82f6')}
                                                {btn('kill', <PowerSettingsNewIcon fontSize="small" />, '#b91c1c')}
                                            </>
                                        )}
                                        {c.status === 'paused' && (
                                            <>
                                                {btn('unpause', <PlayArrowIcon fontSize="small" />, '#10b981')}
                                                {btn('stop', <StopIcon fontSize="small" />, '#ef4444')}
                                                {btn('kill', <PowerSettingsNewIcon fontSize="small" />, '#b91c1c')}
                                            </>
                                        )}
                                        {(c.status === 'exited' || c.status === 'created' || c.status === 'dead') && (
                                            btn('start', <PlayArrowIcon fontSize="small" />, '#10b981')
                                        )}
                                    </Box>
                                    {btn('delete', <DeleteOutlineIcon fontSize="small" />, '#ef4444')}
                                </Box>
                                );
                            })()}
                        </Box>
                    ))}
            </Box>

            {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                    <Pagination
                        count={totalPages}
                        page={page}
                        onChange={(_, value) => setPage(value)}
                        color="primary"
                        shape="rounded"
                    />
                </Box>
            )}

            {/* 创建实例对话框 - 简洁版 */}
            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{t('admin.createInstance')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('admin.createHint')}
                    </Typography>
                    <TextField
                        autoFocus fullWidth size="small" label={t('admin.instanceName')}
                        placeholder="ncqq-bot-1"
                        value={createForm.name}
                        onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                        sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                    />
                    {nodes.length > 1 && (
                        <Select fullWidth size="small" value={selectedNode} onChange={e => setSelectedNode(e.target.value)}
                            sx={{ mb: 2, borderRadius: 2 }}>
                            {nodes.map((n) => (
                                <MenuItem key={n.id} value={n.id}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: n.status === 'online' ? '#10b981' : '#f43f5e' }} />
                                        {n.name}
                                    </Box>
                                </MenuItem>
                            ))}
                        </Select>
                    )}
                    {localImages.length > 0 && (
                        <Select fullWidth size="small" displayEmpty
                            value={createForm.docker_image}
                            onChange={e => setCreateForm({ ...createForm, docker_image: e.target.value })}
                            sx={{ mb: 2, borderRadius: 2 }}>
                            <MenuItem value="">{t('imageManager.useDefault')}</MenuItem>
                            {localImages.flatMap(img => img.tags.map(tag => (
                                <MenuItem key={tag} value={tag}>{tag}</MenuItem>
                            )))}
                        </Select>
                    )}
                    <Typography variant="caption" color="text.secondary">
                        {t('admin.dataDir').replace('{name}', createForm.name || '<name>')}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setOpenCreate(false)} color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={handleCreate} disabled={!createForm.name} variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#2563eb' }}>{t('admin.quickCreate')}</Button>
                </DialogActions>
            </Dialog>

            {/* 删除确认对话框 - 二次确认 + 可选删除数据 */}
            <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ ...deleteDialog, open: false })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('admin.confirmDeleteInstance')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        <span dangerouslySetInnerHTML={{ __html: t('admin.deleteInstanceMsg').replace('{name}', deleteDialog.name) }} />
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={deleteDialog.deleteData}
                                onChange={e => setDeleteDialog({ ...deleteDialog, deleteData: e.target.checked })}
                                color="error"
                            />
                        }
                        label={
                            <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>{t('admin.deleteWithData')}</Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {t('admin.deleteDataWarning').replace('{name}', deleteDialog.name)}
                                </Typography>
                            </Box>
                        }
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialog({ ...deleteDialog, open: false })} color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={confirmDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {deleteDialog.deleteData ? t('admin.deleteInstanceAndData') : t('admin.deleteInstanceOnly')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
