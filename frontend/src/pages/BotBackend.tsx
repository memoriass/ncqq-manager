/**
 * Bot 鍚庣椤甸潰 鈥?鐜颁唬鎵佸钩鍖栬璁★紝绠＄悊瀵圭 Bot 妗嗘灦绔偣锛屽脊绐楃紪杈戯紝澶氶€夋敞鍏?
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Box, Typography, Grid, Button, TextField, IconButton,
    Chip, CircularProgress, Alert, Tooltip, Dialog, DialogTitle,
    DialogContent, DialogActions, Checkbox, Pagination, useTheme,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import WifiTetheringOffIcon from '@mui/icons-material/WifiTetheringOff';
import RadarIcon from '@mui/icons-material/Radar';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SettingsIcon from '@mui/icons-material/Settings';
import { useTranslate } from '../i18n';
import {
    botshepherdApi, containerApi, instanceNetworkApi,
    type Container, type BSConnection, type BackendEndpoint,
} from '../services/api';
import { useToast } from '../components/Toast';

// 鈹€鈹€鈹€ 绫诲瀷 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface EndpointEntry {
    url: string;
    alias: string;
    online: boolean | null;
    latency_ms: number | null;
    probing: boolean;
    note?: string;
    token: string;
}

function isValidWsUrl(url: string): boolean {
    return /^wss?:\/\/.+/.test(url.trim());
}

// 鈹€鈹€鈹€ EditDialog锛氬彸涓婅缂栬緫寮圭獥 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface EditDialogProps {
    open: boolean;
    entry: EndpointEntry;
    allAliases: string[];
    onClose: () => void;
    onSave: (patch: { url: string; alias: string; token: string }) => void;
}

function EditDialog({ open, entry, allAliases, onClose, onSave }: EditDialogProps) {
    const t = useTranslate();
    const toast = useToast();
    const [url, setUrl] = useState(entry.url);
    const [alias, setAlias] = useState(entry.alias);
    const [token, setToken] = useState(entry.token);

    useEffect(() => {
        if (open) { setUrl(entry.url); setAlias(entry.alias); setToken(entry.token); }
    }, [open, entry]);

    const handleSave = () => {
        const trimUrl = url.trim();
        if (!isValidWsUrl(trimUrl)) { toast.error(t('botBackend.invalidUrl')); return; }
        const trimAlias = alias.trim();
        if (trimAlias && trimAlias !== entry.alias &&
            allAliases.filter(a => a === trimAlias).length > 0) {
            toast.warning(t('botBackend.aliasDuplicate')); return;
        }
        onSave({ url: trimUrl, alias: trimAlias, token: token.trim() });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>{t('botBackend.editEndpoint')}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField label="WebSocket URL" placeholder={t('botBackend.urlPlaceholder')}
                    value={url} onChange={e => setUrl(e.target.value)} fullWidth size="small"
                    inputProps={{ style: { fontFamily: 'monospace' } }} />
                <TextField label={t('botBackend.alias')} placeholder={t('botBackend.aliasPlaceholder')}
                    value={alias} onChange={e => setAlias(e.target.value)} fullWidth size="small" />
                <TextField label={t('botBackend.token')} placeholder="Bearer token / access_token"
                    value={token} onChange={e => setToken(e.target.value)} fullWidth size="small" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('botBackend.cancelText')}</Button>
                <Button variant="contained" onClick={handleSave}>淇濆瓨 / Save</Button>
            </DialogActions>
        </Dialog>
    );
}

// 鈹€鈹€鈹€ InjectBSDialog锛氭敞鍏ュ埌 BS 杩炴帴锛堝閫?+ 鍒嗛〉锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface InjectBSDialogProps {
    open: boolean;
    entry: EndpointEntry;
    bsConnections: Record<string, BSConnection>;
    onClose: () => void;
    onConfirm: (connIds: string[]) => Promise<void>;
}

const PAGE_SIZE = 8;

function InjectBSDialog({ open, entry, bsConnections, onClose, onConfirm }: InjectBSDialogProps) {
    const t = useTranslate();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (open) { setSelected([]); setSearch(''); setPage(1); } }, [open]);

    const allOptions = Object.entries(bsConnections).map(([id, c]) => ({
        id, label: `${c.name || id}  (${id})`,
    }));
    const filtered = allOptions.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const toggleAll = () => {
        const pageIds = pageItems.map(o => o.id);
        const allChecked = pageIds.every(id => selected.includes(id));
        if (allChecked) setSelected(prev => prev.filter(id => !pageIds.includes(id)));
        else setSelected(prev => [...new Set([...prev, ...pageIds])]);
    };

    const handleConfirm = async () => {
        if (selected.length === 0) return;
        setLoading(true);
        await onConfirm(selected);
        setLoading(false);
        onClose();
    };

    const pageIds = pageItems.map(o => o.id);
    const allPageChecked = pageIds.length > 0 && pageIds.every(id => selected.includes(id));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
                {t('botBackend.injectBSTitle')}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {entry.alias || entry.url}
                </Typography>
            </DialogTitle>
            <DialogContent>
                {allOptions.length === 0 ? (
                    <Alert severity="warning" sx={{ mt: 1 }}>{t('botBackend.noBS')}</Alert>
                ) : (
                    <>
                        <TextField size="small" fullWidth placeholder={t('botBackend.searchPlaceholder')}
                            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            sx={{ mb: 1.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Checkbox size="small" checked={allPageChecked}
                                indeterminate={pageIds.some(id => selected.includes(id)) && !allPageChecked}
                                onChange={toggleAll} />
                            <Typography variant="caption" color="text.secondary">
                                {t('botBackend.selected').replace('{n}', String(selected.length))}
                            </Typography>
                        </Box>
                        {pageItems.map(o => (
                            <Box key={o.id} sx={{ display: 'flex', alignItems: 'center' }}>
                                <Checkbox size="small" checked={selected.includes(o.id)}
                                    onChange={() => toggle(o.id)} />
                                <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{o.label}</Typography>
                            </Box>
                        ))}
                        {pageCount > 1 && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                                <Pagination count={pageCount} page={page} size="small"
                                    onChange={(_, v) => setPage(v)} />
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('botBackend.cancelText')}</Button>
                <Button variant="contained" disabled={selected.length === 0 || loading}
                    onClick={handleConfirm} startIcon={loading ? <CircularProgress size={16} /> : undefined}>
                    {t('botBackend.confirmInject')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}



// 鈹€鈹€鈹€ InjectNCDialog锛氭敞鍏ュ埌 NCQQ 瀹炰緥锛堝閫?+ 鍒嗛〉锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface InjectNCDialogProps {
    open: boolean;
    entry: EndpointEntry;
    containers: Container[];
    onClose: () => void;
    onConfirm: (containerNames: string[]) => Promise<void>;
}

function InjectNCDialog({ open, entry, containers, onClose, onConfirm }: InjectNCDialogProps) {
    const t = useTranslate();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (open) { setSelected([]); setSearch(''); setPage(1); } }, [open]);

    const allOptions = containers
        .filter(c => c.uin && c.uin !== '鏈櫥褰?/ Not Logged In')
        .map(c => ({ name: c.name, label: `${c.name}  (${c.uin})` }));
    const filtered = allOptions.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const toggle = (name: string) => {
        setSelected(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
    };
    const toggleAll = () => {
        const pageNames = pageItems.map(o => o.name);
        const allChecked = pageNames.every(n => selected.includes(n));
        if (allChecked) setSelected(prev => prev.filter(n => !pageNames.includes(n)));
        else setSelected(prev => [...new Set([...prev, ...pageNames])]);
    };

    const handleConfirm = async () => {
        if (selected.length === 0) return;
        setLoading(true);
        await onConfirm(selected);
        setLoading(false);
        onClose();
    };

    const pageNames = pageItems.map(o => o.name);
    const allPageChecked = pageNames.length > 0 && pageNames.every(n => selected.includes(n));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
                {t('botBackend.injectNCTitle')}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {entry.alias || entry.url}
                </Typography>
            </DialogTitle>
            <DialogContent>
                {allOptions.length === 0 ? (
                    <Alert severity="warning" sx={{ mt: 1 }}>{t('botBackend.noNC')}</Alert>
                ) : (
                    <>
                        <TextField size="small" fullWidth placeholder={t('botBackend.searchPlaceholder')}
                            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            sx={{ mb: 1.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Checkbox size="small" checked={allPageChecked}
                                indeterminate={pageNames.some(n => selected.includes(n)) && !allPageChecked}
                                onChange={toggleAll} />
                            <Typography variant="caption" color="text.secondary">
                                {t('botBackend.selected').replace('{n}', String(selected.length))}
                            </Typography>
                        </Box>
                        {pageItems.map(o => (
                            <Box key={o.name} sx={{ display: 'flex', alignItems: 'center' }}>
                                <Checkbox size="small" checked={selected.includes(o.name)}
                                    onChange={() => toggle(o.name)} />
                                <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{o.label}</Typography>
                            </Box>
                        ))}
                        {pageCount > 1 && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                                <Pagination count={pageCount} page={page} size="small"
                                    onChange={(_, v) => setPage(v)} />
                            </Box>
                        )}
                        <Alert severity="warning" sx={{ mt: 1.5, fontSize: '0.75rem' }}>
                            {t('botBackend.ncReloadHint')}
                        </Alert>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('botBackend.cancelText')}</Button>
                <Button variant="contained" disabled={selected.length === 0 || loading}
                    onClick={handleConfirm} startIcon={loading ? <CircularProgress size={16} /> : undefined}>
                    {t('botBackend.confirmInject')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}


// 鈹€鈹€鈹€ EndpointCard锛氱幇浠ｆ墎骞冲寲璁捐 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

interface EndpointCardProps {
    entry: EndpointEntry;
    index: number;
    allAliases: string[];
    bsConnections: Record<string, BSConnection>;
    containers: Container[];
    onProbe: (index: number) => void;
    onDelete: (index: number) => void;
    onEdit: (index: number, patch: { url: string; alias: string; token: string }) => void;
    onInjectBS: (index: number, connIds: string[]) => Promise<void>;
    onInjectNC: (index: number, containerNames: string[]) => Promise<void>;
}

function EndpointCard({
    entry, index, allAliases, bsConnections, containers,
    onProbe, onDelete, onEdit, onInjectBS, onInjectNC,
}: EndpointCardProps) {
    const t = useTranslate();
    const theme = useTheme();
    const [editOpen, setEditOpen] = useState(false);
    const [bsOpen, setBsOpen] = useState(false);
    const [ncOpen, setNcOpen] = useState(false);
    const isDark = theme.palette.mode === 'dark';

    const isHandshakeRejected = entry.online === true && entry.note === 'handshake_rejected';
    const statusColor = entry.online === null ? '#9ca3af'
        : isHandshakeRejected ? '#f59e0b'
        : entry.online ? '#22c55e'
        : '#ef4444';
    const statusLabel = entry.online === null ? t('botBackend.unknown')
        : isHandshakeRejected ? t('botBackend.handshakeRejected')
        : entry.online ? t('botBackend.online')
        : t('botBackend.offline');
    const StatusIcon = (entry.online && !isHandshakeRejected) ? WifiTetheringIcon : WifiTetheringOffIcon;

    return (
        <>
            <Box sx={{
                borderRadius: 4, overflow: 'hidden',
                background: isDark
                    ? 'linear-gradient(145deg, rgba(30,30,36,0.6) 0%, rgba(24,24,28,0.4) 100%)'
                    : 'linear-gradient(145deg, rgba(255,255,255,0.7) 0%, rgba(248,250,252,0.5) 100%)',
                backdropFilter: 'blur(20px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                display: 'flex', flexDirection: 'column',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: isDark
                        ? '0 8px 32px rgba(0,0,0,0.3)'
                        : '0 8px 32px rgba(0,0,0,0.08)',
                },
            }}>
                {/* 椤堕儴鐘舵€佹潯 */}
                <Box sx={{
                    height: 3,
                    background: entry.probing
                        ? 'linear-gradient(90deg, #3b82f6, #8b5cf6, #3b82f6)'
                        : statusColor,
                    opacity: 0.8,
                }} />

                {/* 鍗＄墖涓讳綋 */}
                <Box sx={{ p: 2.5, flex: 1 }}>
                    {/* 椤舵爮锛氱姸鎬佸浘鏍?+ 鏄电О + 鎿嶄綔 */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                        <Box sx={{
                            width: 36, height: 36, borderRadius: 2,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            bgcolor: `${statusColor}15`,
                            border: `1px solid ${statusColor}30`,
                        }}>
                            <StatusIcon sx={{ color: statusColor, fontSize: 20 }} />
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={{
                                fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3,
                                color: entry.alias ? 'text.primary' : 'text.disabled',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {entry.alias || t('botBackend.aliasPlaceholder')}
                            </Typography>
                            <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
                                {entry.probing ? t('botBackend.probing') : statusLabel}
                                {entry.latency_ms !== null && ` 路 ${entry.latency_ms}ms`}
                            </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.3 }}>
                            <Tooltip title={t('botBackend.probe')}>
                                <span>
                                    <IconButton size="small" onClick={() => onProbe(index)} disabled={entry.probing}
                                        sx={{ width: 28, height: 28 }}>
                                        {entry.probing ? <CircularProgress size={14} /> : <RadarIcon sx={{ fontSize: 15 }} />}
                                    </IconButton>
                                </span>
                            </Tooltip>
                            <Tooltip title={t('botBackend.editEndpoint')}>
                                <IconButton size="small" onClick={() => setEditOpen(true)}
                                    sx={{ width: 28, height: 28, opacity: 0.6, '&:hover': { opacity: 1 } }}>
                                    <SettingsIcon sx={{ fontSize: 15 }} />
                                </IconButton>
                            </Tooltip>
                            <Tooltip title={t('botBackend.deleteEndpoint')}>
                                <IconButton size="small" onClick={() => onDelete(index)}
                                    sx={{ width: 28, height: 28, opacity: 0.6, '&:hover': { opacity: 1, color: '#ef4444' } }}>
                                    <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {/* URL */}
                    <Box sx={{
                        px: 1.5, py: 1, borderRadius: 2, mb: 1.5,
                        bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`,
                    }}>
                        <Typography sx={{
                            fontFamily: 'monospace', fontSize: '0.72rem',
                            color: 'text.secondary', wordBreak: 'break-all', lineHeight: 1.5,
                        }}>
                            {entry.url}
                        </Typography>
                    </Box>
                </Box>

                {/* 鍗＄墖搴曢儴鎿嶄綔 */}
                <Box sx={{
                    display: 'flex', gap: 1, px: 2.5, pb: 2, pt: 0,
                }}>
                    <Button size="small" variant="contained" disableElevation
                        sx={{
                            flex: 1, fontSize: '0.72rem', fontWeight: 600,
                            borderRadius: 2, textTransform: 'none', height: 32,
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            '&:hover': { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' },
                        }}
                        onClick={() => setBsOpen(true)}>
                        {t('botBackend.injectToBS')}
                    </Button>
                    <Button size="small" variant="outlined" disableElevation
                        sx={{
                            flex: 1, fontSize: '0.72rem', fontWeight: 600,
                            borderRadius: 2, textTransform: 'none', height: 32,
                            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                            '&:hover': { borderColor: '#3b82f6', color: '#3b82f6' },
                        }}
                        onClick={() => setNcOpen(true)}>
                        {t('botBackend.injectToNC')}
                    </Button>
                </Box>
            </Box>

            <EditDialog open={editOpen} entry={entry} allAliases={allAliases}
                onClose={() => setEditOpen(false)}
                onSave={patch => onEdit(index, patch)} />
            <InjectBSDialog open={bsOpen} entry={entry} bsConnections={bsConnections}
                onClose={() => setBsOpen(false)}
                onConfirm={connIds => onInjectBS(index, connIds)} />
            <InjectNCDialog open={ncOpen} entry={entry} containers={containers}
                onClose={() => setNcOpen(false)}
                onConfirm={names => onInjectNC(index, names)} />
        </>
    );
}


// 鈹€鈹€鈹€ 涓婚〉闈?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€

export default function BotBackend() {
    const t = useTranslate();
    const toast = useToast();
    const theme = useTheme();

    const [endpoints, setEndpoints] = useState<EndpointEntry[]>([]);
    const [newUrl, setNewUrl] = useState('');
    const [bsConnections, setBsConnections] = useState<Record<string, BSConnection>>({});
    const [containers, setContainers] = useState<Container[]>([]);
    const [collectingBS, setCollectingBS] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 鍒濆鍖栵細鍔犺浇鎸佷箙鍖栫鐐?+ BS 杩炴帴 + 瀹瑰櫒鍒楄〃
    useEffect(() => {
        botshepherdApi.backendEndpoints().then(res => {
            if (res.endpoints?.length) {
                setEndpoints(res.endpoints.map((ep: BackendEndpoint) => ({
                    url: ep.url, alias: ep.alias, token: ep.token,
                    online: null, latency_ms: null, probing: false,
                })));
            }
        }).catch(() => {});
        botshepherdApi.connections().then(res => {
            if (res.connections) setBsConnections(res.connections);
        }).catch(() => {});
        containerApi.list().then(res => {
            setContainers(res.containers || []);
        }).catch(() => {});
    }, []);

    // 鑷姩淇濆瓨 debounce 1s
    useEffect(() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            const payload: BackendEndpoint[] = endpoints.map(e => ({
                alias: e.alias, url: e.url, token: e.token,
            }));
            botshepherdApi.saveBackendEndpoints(payload).catch(() => {});
        }, 1000);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [endpoints]);

    // 娣诲姞绔偣
    const handleAdd = () => {
        const url = newUrl.trim();
        if (!isValidWsUrl(url)) { toast.error(t('botBackend.invalidUrl')); return; }
        if (endpoints.some(e => e.url === url)) { toast.warning(t('botBackend.alreadyExists')); return; }
        setEndpoints(prev => [...prev, { url, alias: '', online: null, latency_ms: null, probing: false, token: '' }]);
        setNewUrl('');
    };

    // 缂栬緫绔偣锛堝脊绐椾繚瀛橈級
    const handleEdit = useCallback((index: number, patch: { url: string; alias: string; token: string }) => {
        setEndpoints(prev => prev.map((e, i) => i === index ? { ...e, ...patch } : e));
    }, []);

    // 鍒犻櫎绔偣
    const handleDelete = (index: number) => {
        setEndpoints(prev => prev.filter((_, i) => i !== index));
    };

    // 鎺㈡祴鍗曚釜
    const handleProbe = useCallback(async (index: number) => {
        setEndpoints(prev => prev.map((e, i) => i === index ? { ...e, probing: true } : e));
        try {
            const entry = endpoints[index];
            const res = await botshepherdApi.probeTarget(entry.url, entry.token);
            setEndpoints(prev => prev.map((e, i) => i === index
                ? { ...e, online: res.online, latency_ms: res.latency_ms ?? null, note: res.note, probing: false }
                : e));
        } catch {
            setEndpoints(prev => prev.map((e, i) => i === index ? { ...e, online: false, probing: false } : e));
        }
    }, [endpoints]);

    // 鍏ㄩ儴鎺㈡祴
    const handleProbeAll = () => Promise.all(endpoints.map((_, i) => handleProbe(i)));

    // 浠?BS 鑷姩鏀堕泦 target_endpoints
    const handleAutoCollect = async () => {
        setCollectingBS(true);
        try {
            const res = await botshepherdApi.connections();
            const conns = res.connections || {};
            if (res.connections) setBsConnections(res.connections);
            const urls = new Set<string>();
            Object.values(conns).forEach(c => (c.target_endpoints || []).forEach(u => urls.add(u)));
            let added = 0;
            urls.forEach(url => {
                if (!endpoints.some(e => e.url === url) && isValidWsUrl(url)) {
                    setEndpoints(prev => [...prev, { url, alias: '', online: null, latency_ms: null, probing: false, token: '' }]);
                    added++;
                }
            });
            toast.success(t('botBackend.autoCollectDone').replace('{n}', String(added)));
        } catch {
            toast.error(t('botBackend.collectFailed'));
        } finally {
            setCollectingBS(false);
        }
    };

    // 娉ㄥ叆鍒板涓?BS 杩炴帴锛堝厛璇诲悗鍚堝苟鍐嶅啓锛?
    const handleInjectBS = useCallback(async (index: number, connIds: string[]) => {
        const url = endpoints[index].url;
        let ok = 0; let fail = 0;
        for (const connId of connIds) {
            try {
                const res = await botshepherdApi.connections();
                const conn = (res.connections || {})[connId];
                if (!conn) { fail++; continue; }
                const targets: string[] = conn.target_endpoints || [];
                if (targets.includes(url)) { ok++; continue; }
                await botshepherdApi.updateConnection(connId, { ...conn, target_endpoints: [...targets, url] });
                ok++;
            } catch { fail++; }
        }
        if (fail === 0) toast.success(t('botBackend.injectBsSuccess').replace('{n}', String(ok)));
        else toast.warning(t('botBackend.partialSuccess').replace('{ok}', String(ok)).replace('{fail}', String(fail)));
    }, [endpoints, t, toast]);

    // 娉ㄥ叆鍒板涓?NCQQ 瀹炰緥
    const handleInjectNC = useCallback(async (index: number, containerNames: string[]) => {
        const url = endpoints[index].url;
        const token = endpoints[index].token;
        let ok = 0; let fail = 0;
        for (const containerName of containerNames) {
            try {
                const container = containers.find(c => c.name === containerName);
                const uin = container?.uin || 'default';
                let existingClients: Record<string, unknown>[] = [];
                try {
                    const cfgRes = await containerApi.getConfig(containerName, `config/onebot11_${uin}.json`, 'local');
                    if (cfgRes.status === 'ok' && cfgRes.content) {
                        const parsed = JSON.parse(cfgRes.content);
                        const wsc = parsed?.network?.websocketClients;
                        if (Array.isArray(wsc)) existingClients = wsc;
                    }
                } catch { /* 浠庣┖寮€濮?*/ }
                if (existingClients.some(c => (c as { url?: string }).url === url)) { ok++; continue; }
                const alias = endpoints[index].alias;
                const clientName = alias ? alias : url;
                const newClient = {
                    name: clientName, enable: true, url,
                    reportSelfMessage: false, messagePostFormat: 'array',
                    token: token || '', debug: false,
                    heartInterval: 30000, reconnectInterval: 30000,
                };
                await instanceNetworkApi.injectNetworkConfig(containerName, {
                    uin, network: { websocketClients: [...existingClients, newClient] as never },
                });
                ok++;
            } catch { fail++; }
        }
        if (fail === 0) toast.success(t('botBackend.injectNcSuccess').replace('{n}', String(ok)));
        else toast.warning(t('botBackend.partialSuccess').replace('{ok}', String(ok)).replace('{fail}', String(fail)));
    }, [endpoints, containers, t, toast]);


    const isDark = theme.palette.mode === 'dark';
    const onlineCount = endpoints.filter(e => e.online === true && e.note !== 'handshake_rejected').length;
    const offlineCount = endpoints.filter(e => e.online === false).length;
    const unknownCount = endpoints.filter(e => e.online === null).length;

    return (
        <Box sx={{ p: { xs: 2, md: 4 }, maxWidth: 1200, mx: 'auto' }}>
            {/* 椤靛ご + 缁熻姒傝 */}
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                        <Box sx={{
                            width: 40, height: 40, borderRadius: 2.5,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                            boxShadow: '0 4px 14px rgba(59,130,246,0.25)',
                        }}>
                            <RadarIcon sx={{ color: '#fff', fontSize: 22 }} />
                        </Box>
                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 800, lineHeight: 1.2 }}>
                                {t('botBackend.title')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {t('botBackend.subtitle')}
                            </Typography>
                        </Box>
                    </Box>
                </Box>
                {endpoints.length > 0 && (
                    <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                        {[
                            { label: t('botBackend.online'), value: onlineCount, color: '#22c55e' },
                            { label: t('botBackend.offline'), value: offlineCount, color: '#ef4444' },
                            { label: t('botBackend.unknown'), value: unknownCount, color: '#9ca3af' },
                        ].map(s => (
                            <Box key={s.label} sx={{
                                px: 2, py: 1, borderRadius: 2.5,
                                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                                display: 'flex', alignItems: 'center', gap: 1,
                            }}>
                                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: s.color }} />
                                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>{s.value}</Typography>
                                <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{s.label}</Typography>
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {/* 宸ュ叿鏍?*/}
            <Box sx={{
                p: 2, mb: 3, borderRadius: 3,
                bgcolor: isDark ? 'rgba(30,30,36,0.4)' : 'rgba(255,255,255,0.5)',
                backdropFilter: 'blur(20px) saturate(1.3)',
                WebkitBackdropFilter: 'blur(20px) saturate(1.3)',
                border: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
            }}>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <TextField
                        size="small"
                        placeholder={t('botBackend.urlPlaceholder')}
                        value={newUrl} onChange={e => setNewUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                        sx={{
                            flex: 1, minWidth: 240,
                            '& .MuiOutlinedInput-root': {
                                borderRadius: 2, fontSize: '0.85rem',
                                bgcolor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
                            },
                        }}
                    />
                    <Button variant="contained" disableElevation startIcon={<AddCircleOutlineIcon />}
                        onClick={handleAdd}
                        sx={{
                            borderRadius: 2, textTransform: 'none', fontWeight: 600, height: 38,
                            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                            '&:hover': { background: 'linear-gradient(135deg, #2563eb, #1d4ed8)' },
                        }}>
                        {t('botBackend.addEndpoint')}
                    </Button>
                    <Button variant="outlined" disableElevation startIcon={<AutoAwesomeIcon />}
                        onClick={handleAutoCollect} disabled={collectingBS}
                        sx={{
                            borderRadius: 2, textTransform: 'none', fontWeight: 600, height: 38,
                            borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                        }}>
                        {collectingBS ? <CircularProgress size={14} sx={{ mr: 0.5 }} /> : null}
                        {t('botBackend.autoCollect')}
                    </Button>
                    {endpoints.length > 0 && (
                        <Button variant="outlined" disableElevation startIcon={<RadarIcon />}
                            onClick={handleProbeAll}
                            sx={{
                                borderRadius: 2, textTransform: 'none', fontWeight: 600, height: 38,
                                borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
                            }}>
                            {t('botBackend.probeAll')}
                        </Button>
                    )}
                </Box>
            </Box>

            {/* 绔偣鍗＄墖鍒楄〃 */}
            {endpoints.length === 0 ? (
                <Box sx={{
                    py: 8, textAlign: 'center', borderRadius: 4,
                    bgcolor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                    border: `2px dashed ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                }}>
                    <RadarIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
                    <Typography color="text.secondary" sx={{ fontSize: '0.9rem' }}>
                        {t('botBackend.noEndpoints')}
                    </Typography>
                    <Typography color="text.disabled" sx={{ fontSize: '0.78rem', mt: 0.5 }}>
                        {t('botBackend.urlPlaceholder')}
                    </Typography>
                </Box>
            ) : (
                <Grid container spacing={2.5}>
                    {endpoints.map((entry, i) => (
                        <Grid item xs={12} sm={6} lg={4} key={entry.url + i}>
                            <EndpointCard
                                entry={entry} index={i}
                                allAliases={endpoints.map(e => e.alias)}
                                bsConnections={bsConnections}
                                containers={containers}
                                onProbe={handleProbe}
                                onDelete={handleDelete}
                                onEdit={handleEdit}
                                onInjectBS={handleInjectBS}
                                onInjectNC={handleInjectNC}
                            />
                        </Grid>
                    ))}
                </Grid>
            )}
        </Box>
    );
}

