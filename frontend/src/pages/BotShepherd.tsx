import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
    Box, Typography, Button, Paper, Chip, CircularProgress,
    Alert, useTheme, IconButton, Tooltip, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import BuildIcon from '@mui/icons-material/Build';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import HearingIcon from '@mui/icons-material/Hearing';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import BlockIcon from '@mui/icons-material/Block';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import WifiIcon from '@mui/icons-material/Wifi';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import TerminalIcon from '@mui/icons-material/Terminal';
import {
    botshepherdApi, type BotShepherdStatus,
    type BSConnectionsResponse, type BSConnection,
    type BSAccountsResponse, type BSAccount,
} from '../services/api';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';

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
    const [connDlg, setConnDlg] = useState<{ mode: 'add' | 'edit' | 'copy'; id: string; data: Partial<BSConnection> } | null>(null);
    const [acctDlg, setAcctDlg] = useState<{ id: string; data: Partial<BSAccount> } | null>(null);

    // 日志 Dialog 状态
    const [logOpen, setLogOpen] = useState(false);
    const [logLines, setLogLines] = useState<string[]>([]);
    const [logLoading, setLogLoading] = useState(false);
    const [logAuto, setLogAuto] = useState(true);
    const logEndRef = useRef<HTMLDivElement>(null);

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

    const handleConnSave = async () => {
        if (!connDlg) return;
        const { mode, id, data } = connDlg;
        try {
            if (mode === 'copy') {
                const r = await botshepherdApi.copyConnection(id, data._copyNewId ?? '', data._copyNewName ?? '');
                if ((r as any).success) toast.success(t('botshepherd.connCopySuccess'));
                else toast.error((r as any).error ?? 'Failed');
            } else {
                const payload = { ...data }; delete (payload as any)._copyNewId; delete (payload as any)._copyNewName;
                const r = await botshepherdApi.updateConnection(id, payload);
                if ((r as any).success) toast.success(t('botshepherd.connSaveSuccess'));
                else toast.error((r as any).error ?? 'Failed');
            }
            setConnDlg(null); await refreshConnections();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    const handleConnDelete = async (id: string) => {
        if (!isRunning) { toast.error(t('botshepherd.connNeedRunning')); return; }
        if (!window.confirm(t('botshepherd.confirmDeleteConn').replace('{id}', id))) return;
        try {
            const r = await botshepherdApi.deleteConnection(id);
            if ((r as any).success) toast.success(t('botshepherd.connDeleteSuccess'));
            else toast.error((r as any).error ?? 'Failed');
            await refreshConnections();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    // ---- 账号 CRUD ----
    const acctEntries = useMemo(() => Object.entries(acctData?.accounts ?? {}), [acctData]);

    const handleAcctSave = async () => {
        if (!acctDlg) return;
        try {
            const r = await botshepherdApi.updateAccount(acctDlg.id, acctDlg.data);
            if ((r as any).success) toast.success(t('botshepherd.accountSaveSuccess'));
            else toast.error((r as any).error ?? 'Failed');
            setAcctDlg(null); await refreshAccounts();
        } catch (e: unknown) { toast.error(String(e)); }
    };

    const handleAcctDelete = async (id: string) => {
        if (!isRunning) { toast.error(t('botshepherd.connNeedRunning')); return; }
        if (!window.confirm(t('botshepherd.confirmDeleteAccount').replace('{id}', id))) return;
        try {
            const r = await botshepherdApi.deleteAccount(id);
            if ((r as any).success) toast.success(t('botshepherd.accountDeleteSuccess'));
            else toast.error((r as any).error ?? 'Failed');
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
            <Paper sx={{ p: 3, mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }} elevation={0}>
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
                    </>)}
                </Box>
            </Paper>

            {/* ---- 连接管理面板 ---- */}
            {isInitialized && (
                <Paper sx={{ p: 3, mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }} elevation={0}>
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
                <Paper sx={{ p: 3, mb: 3, borderRadius: 3, border: `1px solid ${theme.palette.divider}` }} elevation={0}>
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

            {/* ---- 日志 Dialog ---- */}
            <Dialog open={logOpen} onClose={() => setLogOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <TerminalIcon fontSize="small" />
                        {t('botshepherd.processLogs')}
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
        </Box>
    );
}

/* ---- 辅助组件 ---- */

function InfoItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <Box>
            <Typography variant="caption" color="text.secondary">{label}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>{value}</Typography>
        </Box>
    );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    return (
        <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ color, display: 'flex' }}>{icon}</Box>
            <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
        </Box>
    );
}

const STATUS_MAP: Record<string, { color: 'success' | 'info' | 'warning' | 'default' | 'error'; key: string; icon: React.ReactNode }> = {
    connected: { color: 'success', key: 'botshepherd.statusConnected', icon: <LinkIcon fontSize="small" /> },
    listening: { color: 'info', key: 'botshepherd.statusListening', icon: <HearingIcon fontSize="small" /> },
    starting: { color: 'warning', key: 'botshepherd.statusStarting', icon: <CircularProgress size={14} /> },
    disabled: { color: 'default', key: 'botshepherd.statusDisabled', icon: <LinkOffIcon fontSize="small" /> },
    error: { color: 'error', key: 'botshepherd.statusError', icon: <ErrorOutlineIcon fontSize="small" /> },
};

function ConnRow({ id, conn, t, showActions, onEdit, onCopy, onDelete }: {
    id: string; conn: BSConnection; t: (k: string) => string;
    showActions?: boolean; onEdit?: () => void; onCopy?: () => void; onDelete?: () => void;
}) {
    const cs = conn.status?.client_status ?? (conn.enabled === false ? 'disabled' : 'unknown');
    const sm = STATUS_MAP[cs] ?? { color: 'default' as const, key: cs, icon: null };
    const targetList = conn.target_endpoints ?? [];

    return (
        <TableRow hover>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{id}</Typography>
            </TableCell>
            <TableCell>
                <Typography variant="body2">{conn.name ?? '-'}</Typography>
            </TableCell>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {conn.client_endpoint ?? conn.status?.client_endpoint ?? '-'}
                </Typography>
            </TableCell>
            <TableCell>
                {targetList.length > 0 ? targetList.map((ep, i) => (
                    <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ep}</Typography>
                )) : <Typography variant="body2" color="text.secondary">-</Typography>}
            </TableCell>
            <TableCell>
                <Chip size="small" icon={sm.icon ?? undefined}
                    label={t(sm.key)} color={sm.color} variant="outlined" />
                {conn.status?.error && (
                    <Tooltip title={conn.status.error}><ErrorOutlineIcon fontSize="small" color="error" sx={{ ml: 0.5 }} /></Tooltip>
                )}
            </TableCell>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {conn.status?.self_id ?? '-'}
                </Typography>
            </TableCell>
            {showActions && (
                <TableCell align="right">
                    <Tooltip title={t('botshepherd.editConnection')}>
                        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={t('botshepherd.copyConnection')}>
                        <IconButton size="small" onClick={onCopy}><ContentCopyIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={t('botshepherd.deleteConnection')}>
                        <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                </TableCell>
            )}
        </TableRow>
    );
}

/* ---- 连接编辑/新建/复制 对话框 ---- */

function ConnDialog({ dlg, setDlg, onSave, t }: {
    dlg: { mode: 'add' | 'edit' | 'copy'; id: string; data: Partial<BSConnection> };
    setDlg: (v: null) => void; onSave: () => void; t: (k: string) => string;
}) {
    const isCopy = dlg.mode === 'copy';
    const title = isCopy ? t('botshepherd.copyConnection')
        : dlg.mode === 'add' ? t('botshepherd.addConnection')
        : t('botshepherd.editConnection');

    // 用内部 state 让输入受控
    const [form, setForm] = useState(dlg.data as any);
    const setField = (k: string, v: any) => { setForm((p: any) => ({ ...p, [k]: v })); dlg.data = { ...dlg.data, [k]: v }; };

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={() => setDlg(null)}>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                {isCopy ? (<>
                    <TextField label={t('botshepherd.connNewId')} size="small" fullWidth
                        value={form._copyNewId ?? ''} onChange={e => setField('_copyNewId', e.target.value)} />
                    <TextField label={t('botshepherd.connNewName')} size="small" fullWidth
                        value={form._copyNewName ?? ''} onChange={e => setField('_copyNewName', e.target.value)} />
                </>) : (<>
                    {dlg.mode === 'add' && (
                        <TextField label={t('botshepherd.connId')} size="small" fullWidth
                            value={form._editId ?? dlg.id} onChange={e => { setField('_editId', e.target.value); dlg.id = e.target.value; }} />
                    )}
                    <TextField label={t('botshepherd.connName')} size="small" fullWidth
                        value={form.name ?? ''} onChange={e => setField('name', e.target.value)} />
                    <TextField label={t('botshepherd.connDescription')} size="small" fullWidth multiline rows={2}
                        value={form.description ?? ''} onChange={e => setField('description', e.target.value)} />
                    <TextField label={t('botshepherd.clientEndpoint')} size="small" fullWidth
                        value={form.client_endpoint ?? ''} onChange={e => setField('client_endpoint', e.target.value)}
                        placeholder="ws://127.0.0.1:PORT/PATH" />
                    {/* 目标端点 —— Tag 列表，每行一个输入框 + 增删按钮 */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            {t('botshepherd.targetEndpoints')}
                        </Typography>
                        {(form.target_endpoints ?? []).map((ep: string, i: number) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.8 }}>
                                <TextField size="small" fullWidth
                                    value={ep}
                                    placeholder="ws://127.0.0.1:PORT/PATH"
                                    onChange={e => {
                                        const arr = [...(form.target_endpoints ?? [])];
                                        arr[i] = e.target.value;
                                        setField('target_endpoints', arr);
                                    }} />
                                <IconButton size="small" color="error" onClick={() => {
                                    const arr = (form.target_endpoints ?? []).filter((_: string, j: number) => j !== i);
                                    setField('target_endpoints', arr);
                                }}><DeleteIcon fontSize="small" /></IconButton>
                            </Box>
                        ))}
                        <Button size="small" startIcon={<AddIcon />} onClick={() =>
                            setField('target_endpoints', [...(form.target_endpoints ?? []), ''])
                        }>
                            {t('botshepherd.addEndpoint')}
                        </Button>
                    </Box>
                    <FormControlLabel control={
                        <Switch checked={form.enabled !== false} onChange={e => setField('enabled', e.target.checked)} />
                    } label={t('botshepherd.connEnabled')} />
                </>)}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDlg(null)}>{t('botshepherd.connCancel')}</Button>
                <Button variant="contained" onClick={onSave}>{t('botshepherd.connSave')}</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ---- 账号编辑对话框 ---- */

function AcctDialog({ dlg, setDlg, onSave, t }: {
    dlg: { id: string; data: Partial<BSAccount> };
    setDlg: (v: null) => void; onSave: () => void; t: (k: string) => string;
}) {
    const [form, setForm] = useState(dlg.data as any);
    const setField = (k: string, v: any) => { setForm((p: any) => ({ ...p, [k]: v })); dlg.data = { ...dlg.data, [k]: v }; };

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={() => setDlg(null)}>
            <DialogTitle>{t('botshepherd.editAccount')} — {dlg.id}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField label={t('botshepherd.accountName')} size="small" fullWidth
                    value={form.name ?? ''} onChange={e => setField('name', e.target.value)} />
                <TextField label={t('botshepherd.connDescription')} size="small" fullWidth multiline rows={2}
                    value={form.description ?? ''} onChange={e => setField('description', e.target.value)} />
                <FormControlLabel control={
                    <Switch checked={form.enabled !== false} onChange={e => setField('enabled', e.target.checked)} />
                } label={t('botshepherd.accountEnabled')} />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDlg(null)}>{t('botshepherd.connCancel')}</Button>
                <Button variant="contained" onClick={onSave}>{t('botshepherd.connSave')}</Button>
            </DialogActions>
        </Dialog>
    );
}