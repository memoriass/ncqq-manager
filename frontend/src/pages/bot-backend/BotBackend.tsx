import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Grid, TextField, Typography, useTheme } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RadarIcon from '@mui/icons-material/Radar';
import { useTranslate } from '../../i18n';
import { botshepherdApi, containerApi, instanceNetworkApi, type BackendEndpoint, type BSConnection, type Container } from '../../services/api';
import { useToast } from '../../components/Toast';
import { EndpointCard } from './EndpointCard';
import type { EndpointEntry } from './types';
import { isValidWsUrl } from './validators';

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
