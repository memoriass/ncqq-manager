import { useCallback, useEffect, useState } from 'react';
import {
    Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, List, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import AnnouncementIcon from '@mui/icons-material/Announcement';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import RefreshIcon from '@mui/icons-material/Refresh';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import { useTranslate } from '../../i18n';
import { botApi } from '../../services/api';
import { useToast } from '../Toast';
import { GroupMembersView } from './GroupMembersView';
import type { GlassStyle, GroupItem } from './types';

export function GroupsPanel({ name, glass }: { name: string; glass: GlassStyle }) {
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
    const [renameDialog, setRenameDialog] = useState<{ open: boolean; group_id: number; current: string }>({ open: false, group_id: 0, current: '' });
    const [newGroupName, setNewGroupName] = useState('');
    const [noticeDialog, setNoticeDialog] = useState<{ open: boolean; group_id: number; group_name: string }>({ open: false, group_id: 0, group_name: '' });
    const [notices, setNotices] = useState<Array<{ notice_id: string; sender_id: number; publish_time: number; message: { text: string } }>>([]);
    const [newNotice, setNewNotice] = useState('');
    const [noticeLoading, setNoticeLoading] = useState(false);
    const t = useTranslate();
    const toast = useToast();

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const res = await botApi.call(name, 'get_group_list');
            if (Array.isArray(res.data)) setGroups(res.data as GroupItem[]);
        } catch {
            toast.error(t('botManager.fetchGroupsFailed'));
        } finally {
            setLoading(false);
        }
    }, [name]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    const handleGroupBan = async (group_id: number, enable: boolean) => {
        try {
            await botApi.call(name, 'set_group_whole_ban', { group_id, enable });
            toast.success(enable ? t('botManager.groupMuteAllOn') : t('botManager.groupMuteAllOff'));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    const handleLeaveGroup = async (group_id: number) => {
        try {
            await botApi.call(name, 'set_group_leave', { group_id });
            toast.success(t('botManager.leaveGroupSuccess'));
            setGroups(prev => prev.filter(g => g.group_id !== group_id));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    const handleRenameGroup = async () => {
        if (!newGroupName.trim()) return;
        try {
            await botApi.call(name, 'set_group_name', { group_id: renameDialog.group_id, group_name: newGroupName.trim() });
            toast.success(t('botManager.renameGroupSuccess'));
            setGroups(prev => prev.map(g => g.group_id === renameDialog.group_id ? { ...g, group_name: newGroupName.trim() } : g));
        } catch { toast.error(t('botManager.operationFailed')); }
        setRenameDialog({ open: false, group_id: 0, current: '' });
    };

    const openNoticeDialog = async (group_id: number, group_name: string) => {
        setNoticeDialog({ open: true, group_id, group_name });
        setNoticeLoading(true);
        setNotices([]);
        try {
            const res = await botApi.call(name, '_get_group_notice', { group_id });
            if (Array.isArray(res.data)) {
                setNotices(res.data as typeof notices);
            }
        } catch { /* ignore */ }
        setNoticeLoading(false);
    };

    const handleSendNotice = async () => {
        if (!newNotice.trim()) return;
        try {
            await botApi.call(name, '_send_group_notice', { group_id: noticeDialog.group_id, content: newNotice.trim() });
            toast.success(t('botManager.sendNoticeSuccess'));
            setNewNotice('');
            // 刷新公告列表
            openNoticeDialog(noticeDialog.group_id, noticeDialog.group_name);
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    if (selectedGroup) {
        return <GroupMembersView name={name} group={selectedGroup} glass={glass} onBack={() => setSelectedGroup(null)} />;
    }

    return (
        <Box>
            <Box sx={{ ...glass, borderRadius: 3, p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {t('botManager.groupList')}
                    <Chip label={groups.length} size="small" sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />
                </Typography>
                <IconButton size="small" onClick={fetchGroups}>
                    {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                </IconButton>
            </Box>

            <TableContainer component={Paper} sx={{ ...glass, borderRadius: 3, maxHeight: 520 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.groupId')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.groupName')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.memberCount')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.maxMembers')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 220 }}>{t('botManager.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {groups.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    {loading ? t('botManager.loading') : t('botManager.noGroups')}
                                </TableCell>
                            </TableRow>
                        ) : groups.map((g) => (
                            <TableRow key={g.group_id} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <Box component="img" src={`/api/resource/group_avatar/${g.group_id}`}
                                            sx={{ width: 24, height: 24, borderRadius: 1, objectFit: 'cover' }}
                                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
                                        />
                                        {g.group_id}
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{g.group_name}</TableCell>
                                <TableCell>{g.member_count}</TableCell>
                                <TableCell>{g.max_member_count}</TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                                        <Tooltip title={t('botManager.viewMembers')}>
                                            <IconButton size="small" onClick={() => setSelectedGroup(g)}>
                                                <PersonIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('botManager.renameGroup')}>
                                            <IconButton size="small" onClick={() => { setRenameDialog({ open: true, group_id: g.group_id, current: g.group_name }); setNewGroupName(g.group_name); }}>
                                                <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('botManager.groupNotice')}>
                                            <IconButton size="small" onClick={() => openNoticeDialog(g.group_id, g.group_name)}>
                                                <AnnouncementIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('botManager.muteAll')}>
                                            <IconButton size="small" onClick={() => handleGroupBan(g.group_id, true)}>
                                                <VolumeOffIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('botManager.unmuteAll')}>
                                            <IconButton size="small" onClick={() => handleGroupBan(g.group_id, false)}>
                                                <VolumeUpIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('botManager.leaveGroup')}>
                                            <IconButton size="small" color="error" onClick={() => handleLeaveGroup(g.group_id)}>
                                                <LogoutIcon sx={{ fontSize: 16 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* 修改群名对话框 */}
            <Dialog open={renameDialog.open} onClose={() => setRenameDialog({ open: false, group_id: 0, current: '' })}
                PaperProps={{ sx: { borderRadius: 3, minWidth: 360 } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>{t('botManager.renameGroup')}</DialogTitle>
                <DialogContent>
                    <TextField
                        fullWidth size="small" label={t('botManager.groupName')}
                        value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
                        sx={{ mt: 1 }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setRenameDialog({ open: false, group_id: 0, current: '' })} color="inherit" sx={{ borderRadius: 2 }}>{t('botManager.cancel')}</Button>
                    <Button onClick={handleRenameGroup} variant="contained" sx={{ borderRadius: 2 }}>{t('botManager.save')}</Button>
                </DialogActions>
            </Dialog>

            {/* 群公告对话框 */}
            <Dialog open={noticeDialog.open} onClose={() => setNoticeDialog({ open: false, group_id: 0, group_name: '' })}
                PaperProps={{ sx: { borderRadius: 3, minWidth: 480, maxHeight: '70vh' } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>
                    {t('botManager.groupNotice')} - {noticeDialog.group_name}
                </DialogTitle>
                <DialogContent sx={{ px: 2, pb: 2 }}>
                    <Box sx={{ mb: 2 }}>
                        <TextField
                            fullWidth size="small" multiline rows={3}
                            placeholder={t('botManager.noticePlaceholder')}
                            value={newNotice} onChange={(e) => setNewNotice(e.target.value)}
                        />
                        <Button onClick={handleSendNotice} variant="contained" size="small"
                            sx={{ mt: 1, borderRadius: 2, textTransform: 'none' }}
                            disabled={!newNotice.trim()}>
                            {t('botManager.publishNotice')}
                        </Button>
                    </Box>
                    {noticeLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
                    ) : notices.length === 0 ? (
                        <Typography sx={{ py: 2, textAlign: 'center', color: 'text.secondary', fontSize: '0.8rem' }}>{t('botManager.noNotices')}</Typography>
                    ) : (
                        <List sx={{ maxHeight: 300, overflow: 'auto', py: 0 }}>
                            {notices.map((n, i) => (
                                <Paper key={n.notice_id || i} sx={{ p: 1.5, mb: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
                                    <Typography sx={{ fontSize: '0.82rem', whiteSpace: 'pre-wrap' }}>{n.message?.text || ''}</Typography>
                                    <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', mt: 0.5 }}>
                                        {n.sender_id} · {n.publish_time ? new Date(n.publish_time * 1000).toLocaleString() : ''}
                                    </Typography>
                                </Paper>
                            ))}
                        </List>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setNoticeDialog({ open: false, group_id: 0, group_name: '' })} color="inherit" sx={{ borderRadius: 2 }}>{t('botManager.cancel')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── 群成员管理视图 ─────────────────────────────────────────
