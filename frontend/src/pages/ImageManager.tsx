import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Paper, IconButton,
    useTheme, CircularProgress, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, LinearProgress, Tooltip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import ImageIcon from '@mui/icons-material/Image';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import CloseIcon from '@mui/icons-material/Close';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { imageApi, type DockerImage } from '../services/api';
import { useTranslate } from '../i18n';
import { useToast } from '../components/Toast';

interface PullLayerState {
    id: string;
    status: string;
    progress: string;
    current?: number;
    total?: number;
    percent?: number;
}

interface PullProgressDetail {
    current?: number;
    total?: number;
}

interface PullStreamEvent {
    event?: string;
    ok?: boolean;
    id?: string;
    status?: string;
    progress?: string;
    progressDetail?: PullProgressDetail;
    error?: string;
}

const isCompleteLayerStatus = (status: string) => ['Pull complete', 'Already exists'].includes(status);

const clampPercent = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

const getLayerPercent = (status: string, detail?: PullProgressDetail) => {
    if (detail && typeof detail.current === 'number' && typeof detail.total === 'number' && detail.total > 0) {
        return clampPercent((detail.current / detail.total) * 100);
    }
    return isCompleteLayerStatus(status) ? 100 : undefined;
};

const formatBytes = (bytes?: number) => {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const getLayerProgressText = (layer: PullLayerState) => {
    if (typeof layer.current === 'number' && typeof layer.total === 'number' && layer.total > 0) {
        return `${layer.percent ?? 0}% · ${formatBytes(layer.current)} / ${formatBytes(layer.total)}`;
    }
    return layer.progress || (typeof layer.percent === 'number' ? `${layer.percent}%` : '');
};

const getAggregatePercent = (layers: PullLayerState[]) => {
    const measurable = layers.filter(
        (layer) => typeof layer.current === 'number' && typeof layer.total === 'number' && layer.total > 0,
    );
    if (measurable.length === 0) return undefined;
    const current = measurable.reduce((sum, layer) => sum + Math.min(layer.current as number, layer.total as number), 0);
    const total = measurable.reduce((sum, layer) => sum + (layer.total as number), 0);
    return total > 0 ? clampPercent((current / total) * 100) : undefined;
};

export default function ImageManager() {
    const theme = useTheme();
    const t = useTranslate();
    const toast = useToast();
    const [images, setImages] = useState<DockerImage[]>([]);
    const [loading, setLoading] = useState(true);
    const [pullDialog, setPullDialog] = useState(false);
    const [pullImage, setPullImage] = useState('');
    const [pulling, setPulling] = useState(false);
    const [pullWindowOpen, setPullWindowOpen] = useState(false);
    const [pullingImageName, setPullingImageName] = useState('');
    const [pullLayers, setPullLayers] = useState<Record<string, PullLayerState>>({});
    const [pullLogs, setPullLogs] = useState<string[]>([]);
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string; name: string }>({
        open: false,
        id: '',
        name: '',
    });

    const fetchImages = async () => {
        setLoading(true);
        try {
            const data = await imageApi.list();
            setImages(data.images || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchImages(); }, []);

    const appendLog = (line: string) => {
        setPullLogs((prev) => {
            const next = [...prev, line];
            return next.length > 300 ? next.slice(next.length - 300) : next;
        });
    };

    const startPullWithLogs = async (imageName: string) => {
        const normalizedImage = imageName.trim();
        if (!normalizedImage) return;
        setPullDialog(false);
        setPullingImageName(normalizedImage);
        setPullLayers({});
        setPullLogs([]);
        setPullWindowOpen(true);
        setPulling(true);
        try {
            const response = await imageApi.pullStream(normalizedImage);
            if (!response.ok || !response.body) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let pullOk = true;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    const event = JSON.parse(line) as PullStreamEvent;

                    if (event.event === 'done') {
                        pullOk = Boolean(event.ok);
                        continue;
                    }

                    if (event.id && (event.status || event.progress || event.progressDetail)) {
                        const status = event.status || '';
                        const progressDetail = event.progressDetail || {};
                        const percent = getLayerPercent(status, progressDetail);
                        setPullLayers((prev) => ({
                            ...prev,
                            [event.id as string]: {
                                ...prev[event.id as string],
                                id: event.id as string,
                                status: status || prev[event.id as string]?.status || '',
                                progress: event.progress || prev[event.id as string]?.progress || '',
                                current: typeof progressDetail.current === 'number'
                                    ? progressDetail.current
                                    : prev[event.id as string]?.current,
                                total: typeof progressDetail.total === 'number'
                                    ? progressDetail.total
                                    : prev[event.id as string]?.total,
                                percent: typeof percent === 'number'
                                    ? percent
                                    : prev[event.id as string]?.percent,
                            },
                        }));
                    }

                    const percent = getLayerPercent(event.status || '', event.progressDetail);
                    const progressText = typeof percent === 'number' ? `${percent}%` : event.progress;
                    const text = [event.id, event.status, progressText].filter(Boolean).join(' ');
                    if (text) {
                        appendLog(text);
                    }
                    if (event.error) {
                        pullOk = false;
                        appendLog(`ERROR: ${event.error}`);
                    }
                }
            }

            if (pullOk) {
                toast.success(`${normalizedImage} pull ✓`);
                await fetchImages();
            } else {
                toast.error(t('imageManager.pullFailed'));
            }
            setPullImage('');
        } catch (e) {
            toast.error(`Pull ✗: ${e}`);
            appendLog(`ERROR: ${String(e)}`);
        }
        finally { setPulling(false); }
    };

    const handlePull = async () => {
        await startPullWithLogs(pullImage);
    };

    const handleUpdateLatest = async (tag: string) => {
        await startPullWithLogs(tag);
    };

    const handleDelete = async () => {
        if (!deleteDialog.id) return;
        try {
            await imageApi.delete(deleteDialog.id, false);
            setDeleteDialog({ open: false, id: '', name: '' });
            toast.success(`${t('admin.deleteText')} ✓`);
            fetchImages();
        } catch (e) { toast.error(`${t('admin.deleteText')} ✗`); }
    };

    const formatSize = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
    const layerList = Object.values(pullLayers);
    const aggregatePercent = getAggregatePercent(layerList);

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(59,130,246,0.1)', display: 'flex' }}>
                        <ImageIcon sx={{ fontSize: 28, color: '#3b82f6' }} />
                    </Box>
                    <Box>
                        <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('imageManager.title')}</Typography>
                        <Typography variant="body2" color="text.secondary">{t('imageManager.subtitle')}</Typography>
                    </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton onClick={fetchImages} sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2 }}>
                        <RefreshIcon fontSize="small" />
                    </IconButton>
                    <Button variant="contained" startIcon={<DownloadIcon />}
                        onClick={() => setPullDialog(true)}
                        disabled={pulling}
                        sx={{ borderRadius: 2, background: '#2563eb', boxShadow: 'none', '&:hover': { background: '#1d4ed8' } }}>
                        {t('imageManager.pullImage')}
                    </Button>
                </Box>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : images.length === 0 ? (
                <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3 }}>
                    <Typography color="text.secondary">{t('imageManager.noImages')}</Typography>
                </Paper>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {images.map((img) => (
                        <Paper key={img.id} elevation={0}
                            sx={{ p: 2, borderRadius: 3, border: `1px solid ${theme.palette.divider}`,
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
                                    {img.tags.length > 0 ? img.tags[0] : `<${t('imageManager.untagged')}>`}
                                </Typography>
                                {img.tags.length > 1 && (
                                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                                        {img.tags.slice(1).map(tag => (
                                            <Chip key={tag} label={tag} size="small" variant="outlined" />
                                        ))}
                                    </Box>
                                )}
                                <Typography variant="caption" color="text.secondary">
                                    ID: {img.id} · {formatSize(img.size)}
                                </Typography>
                            </Box>
                            {img.tags.some((tag) => tag.endsWith(':latest')) && (
                                <Tooltip title={t('imageManager.updateLatest')}>
                                    <IconButton
                                        onClick={() => handleUpdateLatest(img.tags.find((tag) => tag.endsWith(':latest')) as string)}
                                        disabled={pulling}
                                        size="small"
                                        sx={{ color: 'primary.main' }}
                                    >
                                        <SystemUpdateAltIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            )}
                            <Tooltip title={t('admin.deleteText')}>
                                <IconButton
                                    onClick={() => setDeleteDialog({
                                        open: true,
                                        id: img.id,
                                        name: img.tags.length > 0 ? img.tags[0] : img.id,
                                    })}
                                    size="small"
                                    sx={{ color: 'error.main' }}>
                                    <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Paper>
                    ))}
                </Box>
            )}

            <Dialog open={pullDialog} onClose={() => !pulling && setPullDialog(false)}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}>
                <DialogTitle sx={{ fontWeight: 700 }}>{t('imageManager.pullImage')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('imageManager.pullHint')}
                    </Typography>
                    <TextField autoFocus fullWidth size="small"
                        label={t('imageManager.imageName')}
                        placeholder="mlikiowa/napcat-docker:latest"
                        value={pullImage}
                        onChange={e => setPullImage(e.target.value)}
                        disabled={pulling}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }} />
                    {pulling && <LinearProgress sx={{ mt: 2, borderRadius: 1 }} />}
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setPullDialog(false)} disabled={pulling}
                        color="inherit" sx={{ borderRadius: 2 }}>{t('admin.cancelText')}</Button>
                    <Button onClick={handlePull} disabled={pulling || !pullImage.trim()}
                        variant="contained" disableElevation
                        sx={{ borderRadius: 2, background: '#2563eb' }}>
                        {pulling ? t('imageManager.pulling') : t('imageManager.pullImage')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, id: '', name: '' })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('admin.deleteText')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {`${t('imageManager.confirmDelete')} ${deleteDialog.name}`}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialog({ open: false, id: '', name: '' })} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('admin.cancelText')}
                    </Button>
                    <Button onClick={handleDelete} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {t('admin.deleteText')}
                    </Button>
                </DialogActions>
            </Dialog>

            {pullWindowOpen && (
                <Paper sx={{
                    position: 'fixed',
                    right: 24,
                    bottom: 24,
                    width: { xs: 'calc(100vw - 48px)', sm: 460 },
                    maxHeight: '70vh',
                    zIndex: 1600,
                    borderRadius: 2,
                    border: `1px solid ${theme.palette.divider}`,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                }}>
                    <Box sx={{ p: 1.5, borderBottom: `1px solid ${theme.palette.divider}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{t('imageManager.pullLogsTitle')}</Typography>
                            <Typography variant="caption" color="text.secondary">{pullingImageName}</Typography>
                        </Box>
                        <IconButton size="small" onClick={() => { if (!pulling) setPullWindowOpen(false); }} disabled={pulling}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Box>

                    {typeof aggregatePercent === 'number' ? (
                        <Box sx={{ px: 1.5, py: 1, borderBottom: `1px solid ${theme.palette.divider}` }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" color="text.secondary">{t('imageManager.overallProgress')}</Typography>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{aggregatePercent}%</Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={aggregatePercent} sx={{ borderRadius: 1 }} />
                        </Box>
                    ) : pulling && <LinearProgress />}

                    <Box sx={{ p: 1.5, overflow: 'auto' }}>
                        <Typography variant="caption" color="text.secondary">{t('imageManager.layerStatus')}</Typography>
                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {layerList.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">{t('imageManager.noLayersYet')}</Typography>
                            ) : (
                                layerList.slice(-40).map((layer) => (
                                    <Box key={layer.id} sx={{ py: 0.5 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 0.25 }}>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace', minWidth: 92 }}>
                                                {layer.id.slice(0, 12)}
                                            </Typography>
                                            <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap>
                                                {layer.status}
                                            </Typography>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace', textAlign: 'right', minWidth: 72 }}>
                                                {getLayerProgressText(layer)}
                                            </Typography>
                                        </Box>
                                        {typeof layer.percent === 'number' ? (
                                            <LinearProgress variant="determinate" value={layer.percent} sx={{ borderRadius: 1, height: 4 }} />
                                        ) : pulling && ['Downloading', 'Extracting'].includes(layer.status) ? (
                                            <LinearProgress sx={{ borderRadius: 1, height: 4 }} />
                                        ) : null}
                                    </Box>
                                ))
                            )}
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>{t('imageManager.rawLogs')}</Typography>
                        <Box sx={{
                            mt: 1,
                            p: 1,
                            bgcolor: theme.palette.mode === 'dark' ? '#0d1117' : '#f8f9fa',
                            borderRadius: 1,
                            maxHeight: 240,
                            overflow: 'auto',
                            border: `1px solid ${theme.palette.divider}`,
                        }}>
                            {pullLogs.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">{t('imageManager.noLogsYet')}</Typography>
                            ) : (
                                pullLogs.map((line, index) => (
                                    <Typography key={index} variant="caption" sx={{ display: 'block', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                        {line}
                                    </Typography>
                                ))
                            )}
                        </Box>
                    </Box>
                </Paper>
            )}
        </Box>
    );
}

