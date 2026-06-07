import { useCallback, useEffect, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditIcon from '@mui/icons-material/Edit';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import RefreshIcon from '@mui/icons-material/Refresh';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useTranslate } from '../../i18n';
import { botApi } from '../../services/api';
import { useToast } from '../Toast';
import type { GlassStyle, GroupItem, GroupMember } from './types';

export function GroupMembersView({ name, group, glass, onBack }: {
    name: string; group: GroupItem; glass: GlassStyle; onBack: () => void;
}) {
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [muteDialog, setMuteDialog] = useState<{ open: boolean; userId: number; nickname: string }>({ open: false, userId: 0, nickname: '' });
    const [muteDuration, setMuteDuration] = useState('600');
    const [cardDialog, setCardDialog] = useState<{ open: boolean; userId: number; nickname: string; card: string }>({ open: false, userId: 0, nickname: '', card: '' });
    const [newCard, setNewCard] = useState('');
    const t = useTranslate();
    const toast = useToast();

    const fetchMembers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await botApi.call(name, 'get_group_member_list', { group_id: group.group_id });
            if (Array.isArray(res.data)) {
                const sorted = (res.data as GroupMember[]).sort((a, b) => {
                    const rank = { owner: 0, admin: 1, member: 2 };
                    return (rank[a.role] ?? 2) - (rank[b.role] ?? 2);
                });
                setMembers(sorted);
            }
        } catch {
            toast.error(t('botManager.fetchMembersFailed'));
        } finally {
            setLoading(false);
        }
    }, [name, group.group_id]);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    const roleChip = (role: string) => {
        const conf = role === 'owner'
            ? { label: t('botManager.roleOwner'), color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' }
            : role === 'admin'
                ? { label: t('botManager.roleAdmin'), color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' }
                : { label: t('botManager.roleMember'), color: '#64748b', bg: 'rgba(100,116,139,0.1)' };
        return <Chip label={conf.label} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, color: conf.color, bgcolor: conf.bg }} />;
    };

    const handleMute = async () => {
        try {
            await botApi.call(name, 'set_group_ban', {
                group_id: group.group_id, user_id: muteDialog.userId, duration: parseInt(muteDuration) || 600,
            });
            toast.success(t('botManager.muteSuccess'));
        } catch { toast.error(t('botManager.operationFailed')); }
        setMuteDialog({ open: false, userId: 0, nickname: '' });
    };

    const handleUnmute = async (userId: number) => {
        try {
            await botApi.call(name, 'set_group_ban', { group_id: group.group_id, user_id: userId, duration: 0 });
            toast.success(t('botManager.unmuteSuccess'));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    const handleKick = async (userId: number) => {
        try {
            await botApi.call(name, 'set_group_kick', { group_id: group.group_id, user_id: userId });
            toast.success(t('botManager.kickSuccess'));
            setMembers(prev => prev.filter(m => m.user_id !== userId));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    const handleSetAdmin = async (userId: number, enable: boolean) => {
        try {
            await botApi.call(name, 'set_group_admin', { group_id: group.group_id, user_id: userId, enable });
            toast.success(enable ? t('botManager.setAdminSuccess') : t('botManager.removeAdminSuccess'));
            fetchMembers();
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    const handleSetCard = async () => {
        try {
            await botApi.call(name, 'set_group_card', { group_id: group.group_id, user_id: cardDialog.userId, card: newCard });
            toast.success(t('botManager.setCardSuccess'));
            fetchMembers();
        } catch { toast.error(t('botManager.operationFailed')); }
        setCardDialog({ open: false, userId: 0, nickname: '', card: '' });
    };

    return (
        <Box>
            <Box sx={{ ...glass, borderRadius: 3, p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <IconButton size="small" onClick={onBack}><ArrowBackIcon fontSize="small" /></IconButton>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {group.group_name}
                        <Typography component="span" variant="caption" sx={{ ml: 1, fontFamily: 'monospace', color: 'text.secondary' }}>
                            {group.group_id}
                        </Typography>
                    </Typography>
                    <Chip label={`${members.length} ${t('botManager.membersUnit')}`} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
                </Box>
                <IconButton size="small" onClick={fetchMembers}>
                    {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
            </Box>

            <TableContainer component={Paper} sx={{ ...glass, borderRadius: 3, maxHeight: 520 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>QQ</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.nickname')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.groupCard')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.role')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.lastActive')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 180 }}>{t('botManager.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {members.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    {loading ? t('botManager.loading') : t('botManager.noMembers')}
                                </TableCell>
                            </TableRow>
                        ) : members.map((m) => (
                            <TableRow key={m.user_id} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.user_id}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nickname}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.card || '-'}</TableCell>
                                <TableCell>{roleChip(m.role)}</TableCell>
                                <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                    {m.last_sent_time ? new Date(m.last_sent_time * 1000).toLocaleDateString() : '-'}
                                </TableCell>
                                <TableCell>
                                    {m.role !== 'owner' && (
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title={t('botManager.editCard')}>
                                                <IconButton size="small" onClick={() => { setCardDialog({ open: true, userId: m.user_id, nickname: m.nickname, card: m.card }); setNewCard(m.card || ''); }}>
                                                    <EditIcon sx={{ fontSize: 15 }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('botManager.mute')}>
                                                <IconButton size="small" onClick={() => { setMuteDialog({ open: true, userId: m.user_id, nickname: m.nickname }); setMuteDuration('600'); }}>
                                                    <VolumeOffIcon sx={{ fontSize: 15 }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('botManager.unmute')}>
                                                <IconButton size="small" onClick={() => handleUnmute(m.user_id)}>
                                                    <VolumeUpIcon sx={{ fontSize: 15 }} />
                                                </IconButton>
                                            </Tooltip>
                                            {m.role === 'admin' ? (
                                                <Tooltip title={t('botManager.removeAdmin')}>
                                                    <IconButton size="small" onClick={() => handleSetAdmin(m.user_id, false)}>
                                                        <AdminPanelSettingsIcon sx={{ fontSize: 15, color: '#f59e0b' }} />
                                                    </IconButton>
                                                </Tooltip>
                                            ) : (
                                                <Tooltip title={t('botManager.setAdmin')}>
                                                    <IconButton size="small" onClick={() => handleSetAdmin(m.user_id, true)}>
                                                        <AdminPanelSettingsIcon sx={{ fontSize: 15 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                            <Tooltip title={t('botManager.kick')}>
                                                <IconButton size="small" color="error" onClick={() => handleKick(m.user_id)}>
                                                    <PersonRemoveIcon sx={{ fontSize: 15 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* 禁言对话框 */}
            <Dialog open={muteDialog.open} onClose={() => setMuteDialog({ open: false, userId: 0, nickname: '' })}
                PaperProps={{ sx: { borderRadius: 3, minWidth: 360 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>{t('botManager.muteDialogTitle')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {t('botManager.muteTarget')}: <strong>{muteDialog.nickname}</strong> ({muteDialog.userId})
                    </Typography>
                    <FormControl fullWidth size="small">
                        <InputLabel>{t('botManager.muteDuration')}</InputLabel>
                        <Select value={muteDuration} label={t('botManager.muteDuration')} onChange={(e) => setMuteDuration(e.target.value)}>
                            <MenuItem value="60">{t('botManager.min1')}</MenuItem>
                            <MenuItem value="600">{t('botManager.min10')}</MenuItem>
                            <MenuItem value="3600">{t('botManager.hour1')}</MenuItem>
                            <MenuItem value="86400">{t('botManager.day1')}</MenuItem>
                            <MenuItem value="604800">{t('botManager.week1')}</MenuItem>
                            <MenuItem value="2592000">{t('botManager.month1')}</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setMuteDialog({ open: false, userId: 0, nickname: '' })} color="inherit" sx={{ borderRadius: 2 }}>{t('botManager.cancel')}</Button>
                    <Button onClick={handleMute} variant="contained" sx={{ borderRadius: 2 }}>{t('botManager.confirmMute')}</Button>
                </DialogActions>
            </Dialog>

            {/* 修改群名片对话框 */}
            <Dialog open={cardDialog.open} onClose={() => setCardDialog({ open: false, userId: 0, nickname: '', card: '' })}
                PaperProps={{ sx: { borderRadius: 3, minWidth: 360 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>{t('botManager.editCardTitle')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                        {t('botManager.editCardFor')}: <strong>{cardDialog.nickname}</strong> ({cardDialog.userId})
                    </Typography>
                    <TextField
                        fullWidth size="small" label={t('botManager.groupCard')}
                        value={newCard} onChange={(e) => setNewCard(e.target.value)}
                        placeholder={t('botManager.cardPlaceholder')}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setCardDialog({ open: false, userId: 0, nickname: '', card: '' })} color="inherit" sx={{ borderRadius: 2 }}>{t('botManager.cancel')}</Button>
                    <Button onClick={handleSetCard} variant="contained" sx={{ borderRadius: 2 }}>{t('botManager.save')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
