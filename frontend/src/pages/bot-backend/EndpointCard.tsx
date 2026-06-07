import { useState } from 'react';
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography, useTheme } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import RadarIcon from '@mui/icons-material/Radar';
import SettingsIcon from '@mui/icons-material/Settings';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import WifiTetheringOffIcon from '@mui/icons-material/WifiTetheringOff';
import { useTranslate } from '../../i18n';
import type { BSConnection, Container } from '../../services/api';
import { EditDialog } from './EditDialog';
import { InjectBSDialog } from './InjectBSDialog';
import { InjectNCDialog } from './InjectNCDialog';
import type { EndpointEntry } from './types';

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

export function EndpointCard({
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
