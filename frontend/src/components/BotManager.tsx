/**
 * BotManager 组件 - Bot 管理（消息监控 / 消息发送 / 群管理）
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Typography, Button, TextField, Select, MenuItem, Chip,
    Paper, CircularProgress, IconButton, Tooltip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    useTheme, InputLabel, FormControl, Tab, Tabs,
    Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import GroupIcon from '@mui/icons-material/Group';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PersonIcon from '@mui/icons-material/Person';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import VolumeOffIcon from '@mui/icons-material/VolumeOff';
import PersonRemoveIcon from '@mui/icons-material/PersonRemove';
import EditIcon from '@mui/icons-material/Edit';
import LogoutIcon from '@mui/icons-material/Logout';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useTranslate } from '../i18n';
import { botApi, type BotMessage } from '../services/api';
import { useToast } from './Toast';

interface BotManagerProps {
    name: string;
    node_id: string;
}

type SubTab = 'messages' | 'send' | 'groups';

export const BotManager = ({ name }: BotManagerProps) => {
    const [subTab, setSubTab] = useState<SubTab>('messages');
    const theme = useTheme();
    const t = useTranslate();
    const isDark = theme.palette.mode === 'dark';
    const glass = {
        background: isDark ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
        backdropFilter: 'blur(16px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
        border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
        boxShadow: isDark ? 'none' : '0 2px 12px rgba(0,0,0,0.06)',
    } as const;

    return (
        <Box sx={{ mt: 1 }}>
            {/* 子标签栏 */}
            <Box sx={{ ...glass, borderRadius: 3, p: 1.5, mb: 3 }}>
                <Tabs
                    value={subTab}
                    onChange={(_, v) => setSubTab(v)}
                    variant="scrollable"
                    scrollButtons="auto"
                    sx={{
                        minHeight: 40,
                        '& .MuiTab-root': {
                            textTransform: 'none', fontSize: '0.85rem', minHeight: 36, height: 36,
                            borderRadius: 2, px: 1.5, display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.5,
                        },
                        '& .Mui-selected': {
                            bgcolor: isDark ? 'rgba(59,130,246,0.15)' : '#eff6ff',
                            color: '#3b82f6', fontWeight: 600,
                        },
                        '& .MuiTabs-indicator': { display: 'none' },
                    }}
                >
                    <Tab value="messages" icon={<ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />}
                        iconPosition="start" label={t('botManager.messages')} />
                    <Tab value="send" icon={<SendIcon sx={{ fontSize: 16 }} />}
                        iconPosition="start" label={t('botManager.sendMessage')} />
                    <Tab value="groups" icon={<GroupIcon sx={{ fontSize: 16 }} />}
                        iconPosition="start" label={t('botManager.groupManage')} />
                </Tabs>
            </Box>

            {/* 子面板 */}
            {subTab === 'messages' && <MessagesPanel name={name} glass={glass} />}
            {subTab === 'send' && <SendPanel name={name} glass={glass} />}
            {subTab === 'groups' && <GroupsPanel name={name} glass={glass} />}
        </Box>
    );
};

// ─── 消息监控面板 ─────────────────────────────────────────

function MessagesPanel({ name, glass }: { name: string; glass: Record<string, unknown> }) {
    const [messages, setMessages] = useState<BotMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const t = useTranslate();
    const toast = useToast();
    const theme = useTheme();

    const fetchMessages = useCallback(async () => {
        try {
            const data = await botApi.getMessages(name, 100);
            setMessages(data.messages || []);
        } catch {
            // 静默，避免 Bot 离线时反复弹错
        }
    }, [name]);

    useEffect(() => {
        setLoading(true);
        fetchMessages().finally(() => setLoading(false));
        let timer: ReturnType<typeof setInterval>;
        if (autoRefresh) timer = setInterval(fetchMessages, 5000);
        return () => { if (timer) clearInterval(timer); };
    }, [name, autoRefresh, fetchMessages]);

    const formatTime = (ts: number) => {
        if (!ts) return '-';
        const d = new Date(ts * 1000);
        return d.toLocaleTimeString();
    };

    const getSenderName = (msg: BotMessage) =>
        msg.sender?.card || msg.sender?.nickname || String(msg.sender?.user_id || msg.user_id || '');

    return (
        <Box>
            <Box sx={{ ...glass, borderRadius: 3, p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {t('botManager.recentMessages')}
                    <Chip label={messages.length} size="small" sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Button size="small" variant={autoRefresh ? 'contained' : 'outlined'} onClick={() => setAutoRefresh(!autoRefresh)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', height: 28 }}>
                        {autoRefresh ? t('botManager.autoRefreshOn') : t('botManager.autoRefreshOff')}
                    </Button>
                    <IconButton size="small" onClick={() => { setLoading(true); fetchMessages().finally(() => setLoading(false)); }}>
                        {loading ? <CircularProgress size={16} /> : <RefreshIcon fontSize="small" />}
                    </IconButton>
                </Box>
            </Box>

            <TableContainer component={Paper} sx={{ ...glass, borderRadius: 3, maxHeight: 520 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 600, width: 80 }}>{t('botManager.time')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 70 }}>{t('botManager.type')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 120 }}>{t('botManager.sender')}</TableCell>
                            <TableCell sx={{ fontWeight: 600, width: 100 }}>{t('botManager.source')}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{t('botManager.content')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {messages.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    {t('botManager.noMessages')}
                                </TableCell>
                            </TableRow>
                        ) : messages.map((msg, i) => (
                            <TableRow key={msg.message_id || i} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{formatTime(msg.time)}</TableCell>
                                <TableCell>
                                    <Chip
                                        icon={msg.message_type === 'group' ? <GroupIcon sx={{ fontSize: 12 }} /> : <PersonIcon sx={{ fontSize: 12 }} />}
                                        label={msg.message_type === 'group' ? t('botManager.group') : t('botManager.private')}
                                        size="small"
                                        sx={{ height: 20, fontSize: '0.68rem',
                                            bgcolor: msg.message_type === 'group' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                                            color: msg.message_type === 'group' ? '#6366f1' : '#10b981',
                                        }}
                                    />
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.8rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {getSenderName(msg)}
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                    {msg.group_id ? `${t('botManager.group')} ${msg.group_id}` : (msg.user_id ? `QQ ${msg.user_id}` : '-')}
                                </TableCell>
                                <TableCell sx={{
                                    fontSize: '0.8rem', maxWidth: 300, overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                    {msg.raw_message || '-'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
            <div ref={bottomRef} />
        </Box>
    );
}

// ─── 消息发送面板 ─────────────────────────────────────────

function SendPanel({ name, glass }: { name: string; glass: Record<string, unknown> }) {
    const [msgType, setMsgType] = useState<'group' | 'private'>('group');
    const [targetId, setTargetId] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const t = useTranslate();
    const toast = useToast();

    const handleSend = async () => {
        if (!targetId.trim() || !message.trim()) {
            toast.error(t('botManager.fillRequired'));
            return;
        }
        setSending(true);
        try {
            const res = await botApi.send(name, msgType, targetId.trim(), message);
            toast.success(`${t('botManager.sendSuccess')} (ID: ${res.message_id})`);
            setMessage('');
        } catch (e) {
            toast.error(t('botManager.sendFailed'));
        } finally {
            setSending(false);
        }
    };

    return (
        <Box sx={{ ...glass, borderRadius: 3, p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>{t('botManager.sendMessage')}</Typography>

            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>{t('botManager.msgType')}</InputLabel>
                    <Select value={msgType} label={t('botManager.msgType')} onChange={(e) => setMsgType(e.target.value as 'group' | 'private')}>
                        <MenuItem value="group">{t('botManager.group')}</MenuItem>
                        <MenuItem value="private">{t('botManager.private')}</MenuItem>
                    </Select>
                </FormControl>
                <TextField
                    size="small" label={msgType === 'group' ? t('botManager.groupId') : t('botManager.userId')}
                    value={targetId} onChange={(e) => setTargetId(e.target.value)}
                    sx={{ width: 180 }}
                    placeholder={msgType === 'group' ? '123456789' : '10001'}
                />
            </Box>

            <TextField
                fullWidth multiline rows={4} size="small"
                label={t('botManager.messageContent')}
                value={message} onChange={(e) => setMessage(e.target.value)}
                placeholder={t('botManager.messagePlaceholder')}
                sx={{ mb: 2 }}
            />

            <Button
                variant="contained" startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
                onClick={handleSend} disabled={sending}
                sx={{ textTransform: 'none' }}
            >
                {t('botManager.send')}
            </Button>
        </Box>
    );
}

// ─── 群管理面板 ─────────────────────────────────────────

interface GroupItem {
    group_id: number;
    group_name: string;
    member_count: number;
    max_member_count: number;
}

interface GroupMember {
    user_id: number;
    nickname: string;
    card: string;
    role: 'owner' | 'admin' | 'member';
    join_time: number;
    last_sent_time: number;
}

function GroupsPanel({ name, glass }: { name: string; glass: Record<string, unknown> }) {
    const [groups, setGroups] = useState<GroupItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<GroupItem | null>(null);
    const t = useTranslate();
    const toast = useToast();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const res = await botApi.call(name, 'get_group_list');
            if (Array.isArray(res.data)) {
                setGroups(res.data as GroupItem[]);
            }
        } catch {
            toast.error(t('botManager.fetchGroupsFailed'));
        } finally {
            setLoading(false);
        }
    }, [name]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    // 全员禁言
    const handleGroupBan = async (group_id: number, enable: boolean) => {
        try {
            await botApi.call(name, 'set_group_whole_ban', { group_id, enable });
            toast.success(enable ? t('botManager.groupMuteAllOn') : t('botManager.groupMuteAllOff'));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    // 退群
    const handleLeaveGroup = async (group_id: number) => {
        try {
            await botApi.call(name, 'set_group_leave', { group_id });
            toast.success(t('botManager.leaveGroupSuccess'));
            setGroups(prev => prev.filter(g => g.group_id !== group_id));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    if (selectedGroup) {
        return <GroupMembersView
            name={name} group={selectedGroup} glass={glass}
            onBack={() => setSelectedGroup(null)}
        />;
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
                            <TableCell sx={{ fontWeight: 600, width: 160 }}>{t('botManager.actions')}</TableCell>
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
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{g.group_id}</TableCell>
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
        </Box>
    );
}

// ─── 群成员管理视图 ─────────────────────────────────────────

function GroupMembersView({ name, group, glass, onBack }: {
    name: string; group: GroupItem; glass: Record<string, unknown>; onBack: () => void;
}) {
    const [members, setMembers] = useState<GroupMember[]>([]);
    const [loading, setLoading] = useState(false);
    const [muteDialog, setMuteDialog] = useState<{ open: boolean; userId: number; nickname: string }>({ open: false, userId: 0, nickname: '' });
    const [muteDuration, setMuteDuration] = useState('600');
    const [cardDialog, setCardDialog] = useState<{ open: boolean; userId: number; nickname: string; card: string }>({ open: false, userId: 0, nickname: '', card: '' });
    const [newCard, setNewCard] = useState('');
    const t = useTranslate();
    const toast = useToast();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

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

    // 禁言
    const handleMute = async () => {
        try {
            await botApi.call(name, 'set_group_ban', {
                group_id: group.group_id,
                user_id: muteDialog.userId,
                duration: parseInt(muteDuration) || 600,
            });
            toast.success(t('botManager.muteSuccess'));
        } catch { toast.error(t('botManager.operationFailed')); }
        setMuteDialog({ open: false, userId: 0, nickname: '' });
    };

    // 解除禁言
    const handleUnmute = async (userId: number) => {
        try {
            await botApi.call(name, 'set_group_ban', { group_id: group.group_id, user_id: userId, duration: 0 });
            toast.success(t('botManager.unmuteSuccess'));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    // 踢人
    const handleKick = async (userId: number) => {
        try {
            await botApi.call(name, 'set_group_kick', { group_id: group.group_id, user_id: userId });
            toast.success(t('botManager.kickSuccess'));
            setMembers(prev => prev.filter(m => m.user_id !== userId));
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    // 设置管理员
    const handleSetAdmin = async (userId: number, enable: boolean) => {
        try {
            await botApi.call(name, 'set_group_admin', { group_id: group.group_id, user_id: userId, enable });
            toast.success(enable ? t('botManager.setAdminSuccess') : t('botManager.removeAdminSuccess'));
            fetchMembers();
        } catch { toast.error(t('botManager.operationFailed')); }
    };

    // 修改群名片
    const handleSetCard = async () => {
        try {
            await botApi.call(name, 'set_group_card', {
                group_id: group.group_id,
                user_id: cardDialog.userId,
                card: newCard,
            });
            toast.success(t('botManager.setCardSuccess'));
            fetchMembers();
        } catch { toast.error(t('botManager.operationFailed')); }
        setCardDialog({ open: false, userId: 0, nickname: '', card: '' });
    };

    return (
        <Box>
            {/* 顶栏 */}
            <Box sx={{ ...glass, borderRadius: 3, p: 2, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <IconButton size="small" onClick={onBack}>
                        <ArrowBackIcon fontSize="small" />
                    </IconButton>
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

            {/* 成员列表 */}
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
                                <TableCell sx={{ fontSize: '0.85rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {m.nickname}
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.85rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {m.card || '-'}
                                </TableCell>
                                <TableCell>{roleChip(m.role)}</TableCell>
                                <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                    {m.last_sent_time ? new Date(m.last_sent_time * 1000).toLocaleDateString() : '-'}
                                </TableCell>
                                <TableCell>
                                    {m.role !== 'owner' && (
                                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                                            <Tooltip title={t('botManager.editCard')}>
                                                <IconButton size="small" onClick={() => {
                                                    setCardDialog({ open: true, userId: m.user_id, nickname: m.nickname, card: m.card });
                                                    setNewCard(m.card || '');
                                                }}>
                                                    <EditIcon sx={{ fontSize: 15 }} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('botManager.mute')}>
                                                <IconButton size="small" onClick={() => {
                                                    setMuteDialog({ open: true, userId: m.user_id, nickname: m.nickname });
                                                    setMuteDuration('600');
                                                }}>
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
                    <Button onClick={() => setMuteDialog({ open: false, userId: 0, nickname: '' })} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('botManager.cancel')}
                    </Button>
                    <Button onClick={handleMute} variant="contained" sx={{ borderRadius: 2 }}>
                        {t('botManager.confirmMute')}
                    </Button>
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
                    <Button onClick={() => setCardDialog({ open: false, userId: 0, nickname: '', card: '' })} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('botManager.cancel')}
                    </Button>
                    <Button onClick={handleSetCard} variant="contained" sx={{ borderRadius: 2 }}>
                        {t('botManager.save')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

export default BotManager;
