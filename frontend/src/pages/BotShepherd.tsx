import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    Box, Typography, Button, Paper, Chip, CircularProgress,
    Alert, useTheme, IconButton, Tooltip, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions,
    Switch, FormControlLabel, Popover,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import BuildIcon from '@mui/icons-material/Build';
import LinkIcon from '@mui/icons-material/Link';
import HearingIcon from '@mui/icons-material/Hearing';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BlockIcon from '@mui/icons-material/Block';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import TerminalIcon from '@mui/icons-material/Terminal';
import HubIcon from '@mui/icons-material/Hub';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {
    botshepherdApi, type BotShepherdStatus,
    type BSConnectionsResponse, type BSConnection,
    type BSAccountsResponse, type BSAccount,
} from '../services/api';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';
import { AcctDialog, ConnDialog, ConnRow, InfoItem, StatCard, type ConnDialogData } from './bot-shepherd';

export default function BotShepherd() {
    const t = useTranslate();
    const theme = useTheme();
    const toast = useToast();
    const [status, setStatus] = useState<BotShepherdStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [acting, setActing] = useState('');
    const [connData, setConnData] = useState<BSConnectionsResponse | null>(null);
    const [connLoading, setConnLoading] = useState(false);
    const [acctData, setAcctData] = useState<BSAccountsResponse | null>(null);
    const [acctLoading, setAcctLoading] = useState(false);
    const [onlineMap, setOnlineMap] = useState<Record<string, boolean | null>>({});

    // 对话框状态
    const [connDlg, setConnDlg] = useState<{ mode: 'add' | 'edit' | 'copy'; id: string; data: ConnDialogData } | null>(null);
    const [acctDlg, setAcctDlg] = useState<{ id: string; data: Partial<BSAccount> } | null>(null);
    const [connDeleteDialog, setConnDeleteDialog] = useState<{ open: boolean; id: string }>({ open: false, id: '' });
    const [acctDeleteDialog, setAcctDeleteDialog] = useState<{ open: boolean; id: string }>({ open: false, id: '' });

    // 日志 Dialog 状态
    const [logOpen, setLogOpen] = useState(false);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logLoading, setLogLoading] = useState(false);
    const [logAuto, setLogAuto] = useState(true);
    const logEndRef = useRef<HTMLDivElement>(null);

    // 连接健康监控 Popover 状态
    const [activationMenuAnchor, setActivationMenuAnchor] = useState<HTMLElement | null>(null);

    const openActivationPopover = useCallback((e: React.MouseEvent<HTMLElement>) => {
        setActivationMenuAnchor(e.currentTarget);
    }, []);

    const fetchLogs = useCallback(async () => {
        setLogLoading(true);
        try {
            const res = await botshepherdApi.logs(200);
            setLogLines(res.logs ?? []);
            setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
        } catch { /* ignore */ }
        finally { setLogLoading(false); }
    }, []);

    // 日志 Dialog 打开时立即拉取，并按需自动刷新
    useEffect(() => {
        if (!logOpen) return;
        fetchLogs();
        if (!logAuto) return;
        const iv = setInterval(fetchLogs, 3000);
        return () => clearInterval(iv);
    }, [logOpen, logAuto, fetchLogs]);

    const refresh = useCallback(async () => {
        try { setStatus(await botshepherdApi.status()); }
        catch { /* ignore */ }
        finally { setLoading(false); }
    }, []);

    const refreshConnections = useCallback(async () => {
        setConnLoading(true);
        try { setConnData(await botshepherdApi.connections()); }
        catch { /* ignore */ }
        finally { setConnLoading(false); }
    }, []);

    const refreshAccounts = useCallback(async () => {
        setAcctLoading(true);
        try { setAcctData(await botshepherdApi.accounts()); }
        catch { /* ignore */ }
        finally { setAcctLoading(false); }
    }, []);

    useEffect(() => {
        refresh(); refreshConnections(); refreshAccounts();
        const iv = setInterval(() => { refresh(); refreshConnections(); refreshAccounts(); }, 8000);
        return () => clearInterval(iv);
    }, [refresh, refreshConnections, refreshAccounts]);

    const act = async (action: string, fn: () => Promise<{ status: string; message: string }>) => {
        setActing(action);
        try {
            const r = await fn();
            if (r.status === 'ok') toast.success(r.message); else toast.error(r.message);
            await refresh(); await refreshConnections(); await refreshAccounts();
        } catch (e: unknown) { toast.error(String(e)); }
        finally { setActing(''); }
    };

    const isRunning = status?.running ?? false;
    const activation = status?.activation;

    // ---- 连接 CRUD ----
    const connEntries = useMemo(() => Object.entries(connData?.connections ?? {}), [connData]);
    const connStats = useMemo(() => {
        let total = 0, connected = 0, listening = 0, disabled = 0, errors = 0;
        for (const [, c] of connEntries) {
            total++;
            const cs = c.status?.client_status ?? (c.enabled === false ? 'disabled' : 'unknown');
            if (cs === 'connected') connected++; else if (cs === 'listening') listening++;
            else if (cs === 'disabled') disabled++; else if (cs === 'error') errors++;
        }
        return { total, connected, listening, disabled, errors };
    }, [connEntries]);

    const handleConnSave = async (id: string, data: Partial<BSConnection>) => {
        if (!connDlg) return;
        const { mode } = connDlg;
        try {
            if (mode === 'copy') {
                const r = await botshepherdApi.copyConnection(id, (data as any)._copyNewId ?? '', (data as any)._copyNewName ?? '');
                if ((r as any).success) toast.success(t('botshepherd.connCopySuccess'));
                else toast.error((r as any).error ?? 'Failed');
            } else {
                const payload = { ...data }; delete (payload as any)._copyNewId; delete (payload as any)._copyNewName; delete (payload as any)._editId;
                const r = await botshepherdApi.updateConnection(id, payload);
                if ((r as any).success) {
                    if ((r as any).warning) toast.warning(String((r as any).warning));
                    else toast.success(t('botshepherd.connSaveSuccess'));
                }
                else toast.error((r as any).error ?? 'Failed');
            }
            setConnDlg(null); await refreshConnections();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    const handleConnDelete = (id: string) => {
        if (!isRunning) { toast.error(t('botshepherd.connNeedRunning')); return; }
        setConnDeleteDialog({ open: true, id });
    };

    const doConnDelete = async () => {
        try {
            const r = await botshepherdApi.deleteConnection(connDeleteDialog.id);
            if ((r as any).success) toast.success(t('botshepherd.connDeleteSuccess'));
            else toast.error((r as any).error ?? 'Failed');
            setConnDeleteDialog({ open: false, id: '' });
            await refreshConnections();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    // ---- 账号 CRUD ----
    const acctEntries = useMemo(() => Object.entries(acctData?.accounts ?? {}), [acctData]);

    const handleAcctSave = async (data: Partial<BSAccount>) => {
        if (!acctDlg) return;
        try {
            const r = await botshepherdApi.updateAccount(acctDlg.id, data);
            if ((r as any).success) toast.success(t('botshepherd.accountSaveSuccess'));
            else toast.error((r as any).error ?? 'Failed');
            setAcctDlg(null); await refreshAccounts();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    const handleAcctDelete = (id: string) => {
        if (!isRunning) { toast.error(t('botshepherd.connNeedRunning')); return; }
        setAcctDeleteDialog({ open: true, id });
    };

    const doAcctDelete = async () => {
        try {
            const r = await botshepherdApi.deleteAccount(acctDeleteDialog.id);
            if ((r as any).success) toast.success(t('botshepherd.accountDeleteSuccess'));
            else toast.error((r as any).error ?? 'Failed');
            setAcctDeleteDialog({ open: false, id: '' });
            await refreshAccounts();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    const checkOnline = async (id: string) => {
        setOnlineMap(p => ({ ...p, [id]: null }));
        try {
            const r = await botshepherdApi.accountOnline(id);
            setOnlineMap(p => ({ ...p, [id]: r.online }));
        } catch { setOnlineMap(p => ({ ...p, [id]: false })); }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}><CircularProgress /></Box>;

    const s = status;
    const isInitialized = s?.initialized ?? false;

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>{t('botshepherd.title')}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>{t('botshepherd.subtitle')}</Typography>

            {/* ---- 服务状态面板 ---- */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
                backdropFilter: 'blur(16px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }} elevation={0}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>
                            {isRunning ? t('botshepherd.running') : isInitialized ? t('botshepherd.stopped') : t('botshepherd.notInitialized')}
                        </Typography>
                        <Chip size="small"
                            label={isRunning ? 'ONLINE' : isInitialized ? 'OFFLINE' : 'INIT'}
                            color={isRunning ? 'success' : isInitialized ? 'warning' : 'default'} />
                    </Box>
                    <Tooltip title={t('admin.refresh')}>
                        <IconButton onClick={() => { refresh(); refreshConnections(); }} size="small"><RefreshIcon /></IconButton>
                    </Tooltip>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2, mb: 2 }}>
                    <InfoItem label={t('botshepherd.port')} value={String(s?.port ?? '-')} />
                    <InfoItem label={t('botshepherd.pid')} value={s?.pid ? String(s.pid) : '-'} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 2 }}>
                    {!isInitialized ? (
                        <Button variant="contained" startIcon={acting === 'setup' ? <CircularProgress size={16} color="inherit" /> : <BuildIcon />}
                            disabled={acting !== ''} onClick={() => act('setup', botshepherdApi.setup)}>
                            {acting === 'setup' ? t('botshepherd.setuping') : t('botshepherd.setup')}
                        </Button>
                    ) : (<>
                        {isRunning ? (
                            <Button variant="outlined" color="error" startIcon={<StopIcon />}
                                disabled={acting !== ''} onClick={() => act('stop', botshepherdApi.stop)}>
                                {t('botshepherd.stop')}
                            </Button>
                        ) : (
                            <Button variant="contained" color="success" startIcon={<PlayArrowIcon />}
                                disabled={acting !== ''} onClick={() => act('start', botshepherdApi.start)}>
                                {t('botshepherd.start')}
                            </Button>
                        )}
                        {isRunning && s?.webui_port && (
                            <Button variant="outlined" startIcon={<OpenInNewIcon />}
                                onClick={() => {
                                    const host = window.location.hostname;
                                    window.open(`http://${host}:${s.webui_port}`, '_blank');
                                }}>
                                {t('botshepherd.openWebUI')}
                            </Button>
                        )}
                        <Button variant="outlined" startIcon={<TerminalIcon />}
                            onClick={() => setLogOpen(true)}>
                            {t('botshepherd.viewLogs')}
                        </Button>
                        <Tooltip title={t('botshepherd.activationStatus')}>
                            <Button variant="outlined" startIcon={<HubIcon />}
                                color={activation?.connected ? 'success' : 'inherit'}
                                onClick={openActivationPopover}>
                                {t('botshepherd.activationStatus')}
                            </Button>
                        </Tooltip>
                    </>)}
                </Box>
            </Paper>

            {/* ---- 连接管理面板 ---- */}
            {isInitialized && (
                <Paper sx={{ p: 3, mb: 3, borderRadius: 3,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
                    backdropFilter: 'blur(16px) saturate(1.2)',
                    WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }} elevation={0}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('botshepherd.connTitle')}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {isRunning && (
                                <Button size="small" startIcon={<AddIcon />} variant="outlined"
                                    onClick={() => setConnDlg({ mode: 'add', id: 'new_connection', data: { name: '', enabled: true, client_endpoint: '', target_endpoints: [], description: '' } })}>
                                    {t('botshepherd.addConnection')}
                                </Button>
                            )}
                            <Chip size="small" variant="outlined"
                                label={connData?.source === 'api' ? t('botshepherd.sourceApi') : t('botshepherd.sourceFile')}
                                color={connData?.source === 'api' ? 'success' : 'default'} />
                            <IconButton onClick={refreshConnections} size="small" disabled={connLoading}>
                                {connLoading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                            </IconButton>
                        </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('botshepherd.connDesc')}</Typography>

                    {!isRunning && (
                        <Alert severity="warning" sx={{ borderRadius: 2, mb: 2 }}>{t('botshepherd.bsNotRunning')}</Alert>
                    )}

                    {/* 统计卡片 */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 2, mb: 3 }}>
                        <StatCard icon={<LinkIcon />} label={t('botshepherd.totalConnections')} value={connStats.total} color={theme.palette.primary.main} />
                        <StatCard icon={<LinkIcon />} label={t('botshepherd.connectedCount')} value={connStats.connected} color={theme.palette.success.main} />
                        <StatCard icon={<HearingIcon />} label={t('botshepherd.listeningCount')} value={connStats.listening} color={theme.palette.info.main} />
                        <StatCard icon={<BlockIcon />} label={t('botshepherd.disabledCount')} value={connStats.disabled} color={theme.palette.text.secondary} />
                        <StatCard icon={<ErrorOutlineIcon />} label={t('botshepherd.errorCount')} value={connStats.errors} color={theme.palette.error.main} />
                    </Box>

                    {/* 连接列表 */}
                    {connEntries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                            {t('botshepherd.noConnections')}
                        </Typography>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.connId')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.connName')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.clientEndpoint')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.targetEndpoints')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.clientStatus')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.selfId')}</TableCell>
                                        {isRunning && <TableCell sx={{ fontWeight: 600 }} align="right">{t('admin.actions') ?? '操作'}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {connEntries.map(([id, conn]) => (
                                        <ConnRow key={id} id={id} conn={conn} t={t} showActions={isRunning}
                                            onEdit={() => setConnDlg({ mode: 'edit', id, data: { ...conn } })}
                                            onCopy={() => setConnDlg({ mode: 'copy', id, data: { _copyNewId: id + '_copy', _copyNewName: (conn.name ?? '') + ' (Copy)' } as any })}
                                            onDelete={() => handleConnDelete(id)} />
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            )}

            {/* ---- 账号管理面板 ---- */}
            {isInitialized && (
                <Paper sx={{ p: 3, mb: 3, borderRadius: 3,
                    bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
                    backdropFilter: 'blur(16px) saturate(1.2)',
                    WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                    border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }} elevation={0}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <PersonIcon color="primary" />
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('botshepherd.accountTitle')}</Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip size="small" variant="outlined"
                                label={acctData?.source === 'api' ? t('botshepherd.sourceApi') : t('botshepherd.sourceFile')}
                                color={acctData?.source === 'api' ? 'success' : 'default'} />
                            <IconButton onClick={refreshAccounts} size="small" disabled={acctLoading}>
                                {acctLoading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
                            </IconButton>
                        </Box>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('botshepherd.accountDesc')}</Typography>

                    {/* 账号统计卡片 */}
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 2, mb: 3 }}>
                        <StatCard icon={<PersonIcon />} label={t('botshepherd.totalAccounts')} value={acctEntries.length} color={theme.palette.primary.main} />
                        <StatCard icon={<WifiIcon />} label={t('botshepherd.onlineAccounts')}
                            value={Object.values(onlineMap).filter(v => v === true).length} color={theme.palette.success.main} />
                        <StatCard icon={<WifiOffIcon />} label={t('botshepherd.offlineAccounts')}
                            value={Object.values(onlineMap).filter(v => v === false).length} color={theme.palette.text.secondary} />
                    </Box>

                    {/* 账号列表 */}
                    {acctEntries.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                            {t('botshepherd.noAccounts')}
                        </Typography>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.accountId')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.accountName')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.accountEnabled')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.accountLastRecv')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.accountLastSend')}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{t('botshepherd.checkOnline')}</TableCell>
                                        {isRunning && <TableCell sx={{ fontWeight: 600 }} align="right">{t('admin.actions') ?? '操作'}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {acctEntries.map(([id, acct]) => (
                                        <TableRow key={id} hover>
                                            <TableCell><Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{id}</Typography></TableCell>
                                            <TableCell>{acct.name ?? '-'}</TableCell>
                                            <TableCell>
                                                <Chip size="small" label={acct.enabled !== false ? t('botshepherd.accountEnabled') : t('botshepherd.statusDisabled')}
                                                    color={acct.enabled !== false ? 'success' : 'default'} variant="outlined" />
                                            </TableCell>
                                            <TableCell><Typography variant="caption">{acct.last_receive_time ?? '-'}</Typography></TableCell>
                                            <TableCell><Typography variant="caption">{acct.last_send_time ?? '-'}</Typography></TableCell>
                                            <TableCell>
                                                {onlineMap[id] === null ? <CircularProgress size={14} /> :
                                                    onlineMap[id] === true ? <Chip size="small" icon={<WifiIcon />} label={t('botshepherd.accountOnline')} color="success" variant="outlined" /> :
                                                    onlineMap[id] === false ? <Chip size="small" icon={<WifiOffIcon />} label={t('botshepherd.accountOffline')} color="default" variant="outlined" /> :
                                                    <Button size="small" onClick={() => checkOnline(id)}>{t('botshepherd.checkOnline')}</Button>}
                                            </TableCell>
                                            {isRunning && (
                                                <TableCell align="right">
                                                    <Tooltip title={t('botshepherd.editAccount')}>
                                                        <IconButton size="small" onClick={() => setAcctDlg({ id, data: { ...acct } })}><EditIcon fontSize="small" /></IconButton>
                                                    </Tooltip>
                                                    <Tooltip title={t('botshepherd.deleteAccount')}>
                                                        <IconButton size="small" color="error" onClick={() => handleAcctDelete(id)}><DeleteIcon fontSize="small" /></IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            )}

            <Alert severity="info" sx={{ borderRadius: 2, mb: 2 }}>
                {t('botshepherd.statusDesc')}
            </Alert>
            <Alert severity="warning" variant="outlined" sx={{ borderRadius: 2 }}>
                {t('botshepherd.defaultLogin')}
            </Alert>

            {/* ---- 连接编辑/新建/复制对话框 ---- */}
            {connDlg && <ConnDialog dlg={connDlg} setDlg={setConnDlg} onSave={handleConnSave} t={t} />}

            {/* ---- 账号编辑对话框 ---- */}
            {acctDlg && <AcctDialog dlg={acctDlg} setDlg={setAcctDlg} onSave={handleAcctSave} t={t} />}

            {/* ---- 连接健康监控 Popover ---- */}
            <Popover
                open={Boolean(activationMenuAnchor)}
                anchorEl={activationMenuAnchor}
                onClose={() => setActivationMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { p: 2, minWidth: 360, maxWidth: 480, borderRadius: 2 } } }}
            >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    {t('botshepherd.activationStatus')}
                </Typography>

                {/* 连接统计概览 */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1.5 }}>
                    {[
                        { label: t('botshepherd.totalConnections'), value: activation?.total_connections ?? 0 },
                        { label: t('botshepherd.connectedCount'), value: activation?.active_connections ?? 0 },
                        { label: t('botshepherd.managedCount') ?? 'Managed', value: activation?.managed_connections ?? 0 },
                        { label: 'Status', value: activation?.status ?? 'idle' },
                    ].map(({ label, value }) => (
                        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3, gap: 1 }}>
                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{value}</Typography>
                        </Box>
                    ))}
                </Box>

                {/* 缺失端点警告 */}
                {(activation?.missing_endpoints?.length ?? 0) > 0 && (
                    <Alert severity="warning" sx={{ py: 0, px: 1, mb: 1.5, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                        {t('botshepherd.missingEndpoints') ?? 'Missing manager endpoint'}: {activation!.missing_endpoints.join(', ')}
                    </Alert>
                )}

                {/* 连接明细列表 */}
                {(activation?.connections?.length ?? 0) > 0 && (
                    <Box sx={{ mb: 1.5, maxHeight: 200, overflowY: 'auto' }}>
                        {activation!.connections.map((c) => (
                            <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5,
                                borderBottom: '1px solid', borderColor: 'divider' }}>
                                <Chip size="small" variant="outlined"
                                    color={c.ws_alive ? 'success' : c.enabled ? 'warning' : 'default'}
                                    label={c.client_status}
                                    sx={{ minWidth: 70, fontSize: '0.7rem' }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }} noWrap>
                                        {c.name || c.id}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap>
                                        {c.self_id ? `QQ: ${c.self_id}` : '-'}
                                        {c.has_manager_endpoint ? '' : ' | ⚠ no mgr endpoint'}
                                    </Typography>
                                </Box>
                            </Box>
                        ))}
                    </Box>
                )}

                {/* 错误信息 */}
                {activation?.last_error && (
                    <Alert severity="error" sx={{ py: 0, px: 1, mb: 1.5, '& .MuiAlert-message': { fontSize: '0.75rem' } }}>
                        {activation.last_error}
                    </Alert>
                )}

                {/* 状态指示 — 监控生命周期跟随 BS，无需手动操控 */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 1, borderTop: '1px solid', borderColor: 'divider' }}>
                    <Chip size="small" variant="outlined"
                        color={activation?.connected ? 'success' : activation?.running ? 'info' : 'default'}
                        label={activation?.connected
                            ? t('botshepherd.activationConnected')
                            : activation?.running
                                ? (t('botshepherd.monitorRunning') ?? 'Monitoring')
                                : t('botshepherd.activationDisconnected')} />
                    <Typography variant="caption" color="text.secondary">
                        {activation?.running
                            ? (t('botshepherd.monitorAutoTip') ?? 'Auto-managed with BS lifecycle')
                            : (t('botshepherd.monitorStoppedTip') ?? 'Start BS to enable monitoring')}
                    </Typography>
                </Box>
            </Popover>

            {/* ---- 日志 Dialog ---- */}
            <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TerminalIcon fontSize="small" />
                        {t('botshepherd.processLogs')}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title={t('botshepherd.activationStatus')}>
                            <IconButton size="small" onClick={openActivationPopover}>
                                <HubIcon fontSize="small" color={activation?.connected ? 'success' : 'action'} />
                            </IconButton>
                        </Tooltip>
                        <FormControlLabel
                            control={<Switch size="small" checked={logAuto} onChange={e => setLogAuto(e.target.checked)} />}
                            label={<Typography variant="caption">{t('botshepherd.autoRefresh')}</Typography>}
                        />
                        <IconButton size="small" onClick={fetchLogs} disabled={logLoading}>
                            {logLoading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    <Box sx={{
                        bgcolor: theme.palette.mode === 'dark' ? '#1a1a2e' : '#0d1117',
                        color: '#c9d1d9', fontFamily: 'monospace', fontSize: '0.78rem',
                        p: 2, height: 400, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}>
                        {logLines.length === 0
                            ? <Typography variant="body2" sx={{ color: '#8b949e', fontStyle: 'italic' }}>
                                {t('botshepherd.noLogs')}
                              </Typography>
                            : logLines.map((line, i) => <div key={i}>{line}</div>)
                        }
                        <div ref={logEndRef} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Typography variant="caption" color="text.secondary" sx={{ flex: 1, pl: 2 }}>
                        {logLines.length} {t('botshepherd.logLineCount')}
                    </Typography>
                    <Button onClick={() => setLogOpen(false)}>{t('botshepherd.close')}</Button>
                </DialogActions>
            </Dialog>

            {/* ---- 连接删除确认 ---- */}
            <Dialog
                open={connDeleteDialog.open}
                onClose={() => setConnDeleteDialog({ open: false, id: '' })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('admin.deleteText')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('botshepherd.confirmDeleteConn').replace('{id}', connDeleteDialog.id)}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setConnDeleteDialog({ open: false, id: '' })} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('botshepherd.connCancel')}
                    </Button>
                    <Button onClick={doConnDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {t('admin.deleteText')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ---- 账号删除确认 ---- */}
            <Dialog
                open={acctDeleteDialog.open}
                onClose={() => setAcctDeleteDialog({ open: false, id: '' })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('admin.deleteText')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('botshepherd.confirmDeleteAccount').replace('{id}', acctDeleteDialog.id)}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setAcctDeleteDialog({ open: false, id: '' })} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('botshepherd.connCancel')}
                    </Button>
                    <Button onClick={doAcctDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {t('admin.deleteText')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

/* ---- 辅助组件 ---- */
