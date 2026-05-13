/**
 * BotManager 组件 - Bot 管理（聊天 / 群管理）
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Typography, Button, TextField, Select, MenuItem, Chip,
    Paper, CircularProgress, IconButton, Tooltip,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    useTheme, InputLabel, FormControl, Tab, Tabs,
    Dialog, DialogTitle, DialogContent, DialogActions,
    List, ListItemButton, ListItemText, ListItemIcon, InputAdornment,
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
import AddCommentIcon from '@mui/icons-material/AddComment';
import { useTranslate } from '../i18n';
import { botApi, type BotMessage } from '../services/api';
import { useToast } from './Toast';

interface BotManagerProps {
    name: string;
    node_id: string;
}

type SubTab = 'chat' | 'groups';

export const BotManager = ({ name }: BotManagerProps) => {
    const [subTab, setSubTab] = useState<SubTab>('chat');
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
                    <Tab value="chat" icon={<ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />}
                        iconPosition="start" label={t('botManager.chat')} />
                    <Tab value="groups" icon={<GroupIcon sx={{ fontSize: 16 }} />}
                        iconPosition="start" label={t('botManager.groupManage')} />
                </Tabs>
            </Box>

            {subTab === 'chat' && <ChatPanel name={name} glass={glass} />}
            {subTab === 'groups' && <GroupsPanel name={name} glass={glass} />}
        </Box>
    );
};

// ─── 聊天面板 ─────────────────────────────────────────

interface Conversation {
    id: string;
    type: 'group' | 'private';
    name: string;
    lastMsg: string;
    lastTime: number;
}

function ChatPanel({ name, glass }: { name: string; glass: Record<string, unknown> }) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConv, setActiveConv] = useState<Conversation | null>(null);
    const [messages, setMessages] = useState<BotMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [newQQ, setNewQQ] = useState('');
    const [showNewChat, setShowNewChat] = useState(false);
    const [contactDialogOpen, setContactDialogOpen] = useState(false);
    const [contactGroups, setContactGroups] = useState<Array<{ group_id: number; group_name: string }>>([]);
    const [contactFriends, setContactFriends] = useState<Array<{ user_id: number; nickname: string; remark: string }>>([]);
    const [contactTab, setContactTab] = useState<'groups' | 'friends'>('groups');
    const [contactLoading, setContactLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const t = useTranslate();
    const toast = useToast();
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';

    // 最大渲染消息数 — 避免过多消息导致性能问题
    const MAX_RENDER_MESSAGES = 50;

    // 加载群列表作为会话
    useEffect(() => {
        (async () => {
            try {
                const res = await botApi.call(name, 'get_group_list');
                if (Array.isArray(res.data)) {
                    const groupConvs: Conversation[] = (res.data as Array<{ group_id: number; group_name: string }>).map(g => ({
                        id: String(g.group_id),
                        type: 'group',
                        name: g.group_name || String(g.group_id),
                        lastMsg: '',
                        lastTime: 0,
                    }));
                    setConversations(prev => {
                        const privates = prev.filter(c => c.type === 'private');
                        return [...groupConvs, ...privates];
                    });
                }
            } catch { /* bot offline */ }
        })();
    }, [name]);

    // 拉取缓存消息并按会话分组更新 lastMsg
    useEffect(() => {
        const fetchCached = async () => {
            try {
                const data = await botApi.getMessages(name, 200);
                const msgs = data.messages || [];
                setConversations(prev => {
                    const updated = [...prev];
                    for (const msg of msgs) {
                        const convId = msg.message_type === 'group' ? String(msg.group_id) : String(msg.user_id);
                        const conv = updated.find(c => c.id === convId);
                        if (conv && msg.time > conv.lastTime) {
                            conv.lastMsg = msg.raw_message?.slice(0, 30) || '';
                            conv.lastTime = msg.time;
                        } else if (!conv && msg.message_type === 'private' && msg.user_id) {
                            updated.push({
                                id: String(msg.user_id),
                                type: 'private',
                                name: msg.sender?.nickname || String(msg.user_id),
                                lastMsg: msg.raw_message?.slice(0, 30) || '',
                                lastTime: msg.time,
                            });
                        }
                    }
                    return updated.sort((a, b) => b.lastTime - a.lastTime);
                });
            } catch { /* ignore */ }
        };
        fetchCached();
        const timer = setInterval(fetchCached, 5000);
        return () => clearInterval(timer);
    }, [name]);

    // 切换会话时加载消息
    useEffect(() => {
        if (!activeConv) { setMessages([]); return; }
        const fetchMsgs = async () => {
            try {
                const data = await botApi.getMessages(name, 200);
                const filtered = (data.messages || []).filter(m => {
                    if (activeConv.type === 'group') return String(m.group_id) === activeConv.id;
                    return m.message_type === 'private' && (String(m.user_id) === activeConv.id || String(m.self_id) === activeConv.id);
                });
                setMessages(filtered);
            } catch { /* ignore */ }
        };
        fetchMsgs();
        const timer = setInterval(fetchMsgs, 5000);
        return () => clearInterval(timer);
    }, [name, activeConv?.id, activeConv?.type]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !activeConv) return;
        setSending(true);
        try {
            await botApi.send(name, activeConv.type, activeConv.id, input.trim());
            setInput('');
        } catch {
            toast.error(t('botManager.sendFailed'));
        } finally {
            setSending(false);
        }
    };

    const handleLoadMore = async () => {
        if (!activeConv || activeConv.type !== 'group') return;
        setLoadingMore(true);
        try {
            const oldest = messages[0];
            const res = await botApi.call(name, 'get_group_msg_history', {
                group_id: Number(activeConv.id),
                message_seq: oldest?.message_id || 0,
                count: 20,
            });
            if (res.data && Array.isArray((res.data as { messages?: unknown[] }).messages)) {
                const hist = (res.data as { messages: BotMessage[] }).messages;
                setMessages(prev => [...hist, ...prev]);
            }
        } catch {
            toast.error(t('botManager.operationFailed'));
        } finally {
            setLoadingMore(false);
        }
    };

    const addPrivateChat = () => {
        const qq = newQQ.trim();
        if (!qq) return;
        if (conversations.find(c => c.id === qq && c.type === 'private')) {
            setActiveConv(conversations.find(c => c.id === qq && c.type === 'private')!);
        } else {
            const conv: Conversation = { id: qq, type: 'private', name: `QQ ${qq}`, lastMsg: '', lastTime: 0 };
            setConversations(prev => [conv, ...prev]);
            setActiveConv(conv);
        }
        setNewQQ('');
        setShowNewChat(false);
    };

    const openContactDialog = async () => {
        setContactDialogOpen(true);
        setContactLoading(true);
        try {
            const [groupRes, friendRes] = await Promise.allSettled([
                botApi.call(name, 'get_group_list'),
                botApi.call(name, 'get_friend_list'),
            ]);
            if (groupRes.status === 'fulfilled' && Array.isArray(groupRes.value.data)) {
                setContactGroups(groupRes.value.data as Array<{ group_id: number; group_name: string }>);
            }
            if (friendRes.status === 'fulfilled' && Array.isArray(friendRes.value.data)) {
                setContactFriends(friendRes.value.data as Array<{ user_id: number; nickname: string; remark: string }>);
            }
        } catch { /* ignore */ }
        setContactLoading(false);
    };

    const selectContact = (type: 'group' | 'private', id: string, contactName: string) => {
        const existing = conversations.find(c => c.id === id && c.type === type);
        if (existing) {
            setActiveConv(existing);
        } else {
            const conv: Conversation = { id, type, name: contactName, lastMsg: '', lastTime: 0 };
            setConversations(prev => [conv, ...prev]);
            setActiveConv(conv);
        }
        setContactDialogOpen(false);
    };

    const formatTime = (ts: number) => {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    return (
        <>
        <Box sx={{ ...glass, borderRadius: 3, display: 'flex', height: 560, overflow: 'hidden' }}>
            {/* 左侧会话列表 */}
            <Box sx={{ width: 260, borderRight: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', flexDirection: 'column' }}>
                <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1 }}>{t('botManager.chat')}</Typography>
                    <Tooltip title={t('botManager.newPrivateChat')}>
                        <IconButton size="small" onClick={openContactDialog}>
                            <AddCommentIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
                {showNewChat && (
                    <Box sx={{ px: 1.5, pb: 1 }}>
                        <TextField
                            size="small" fullWidth
                            placeholder={t('botManager.inputQQ')}
                            value={newQQ}
                            onChange={e => setNewQQ(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') addPrivateChat(); }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={addPrivateChat}><SendIcon sx={{ fontSize: 14 }} /></IconButton>
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ '& .MuiInputBase-root': { height: 32, fontSize: '0.8rem' } }}
                        />
                    </Box>
                )}
                <List sx={{ flex: 1, overflow: 'auto', py: 0 }}>
                    {conversations.map(conv => (
                        <ListItemButton
                            key={`${conv.type}-${conv.id}`}
                            selected={activeConv?.id === conv.id && activeConv?.type === conv.type}
                            onClick={() => setActiveConv(conv)}
                            sx={{ py: 1, px: 1.5, borderRadius: 1, mx: 0.5, mb: 0.3 }}
                        >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                                {conv.type === 'group'
                                    ? <GroupIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                                    : <PersonIcon sx={{ fontSize: 18, color: '#10b981' }} />}
                            </ListItemIcon>
                            <ListItemText
                                primary={conv.name}
                                secondary={conv.lastMsg || undefined}
                                primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 500, noWrap: true }}
                                secondaryTypographyProps={{ fontSize: '0.7rem', noWrap: true }}
                            />
                            {conv.lastTime > 0 && (
                                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', ml: 0.5 }}>
                                    {formatTime(conv.lastTime)}
                                </Typography>
                            )}
                        </ListItemButton>
                    ))}
                </List>
            </Box>

            {/* 右侧聊天区域 */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {!activeConv ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography color="text.secondary" fontSize="0.85rem">{t('botManager.noConversation')}</Typography>
                    </Box>
                ) : (
                    <>
                        {/* 头部 */}
                        <Box sx={{ p: 1.5, borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', alignItems: 'center', gap: 1 }}>
                            {activeConv.type === 'group'
                                ? <GroupIcon sx={{ fontSize: 18, color: '#6366f1' }} />
                                : <PersonIcon sx={{ fontSize: 18, color: '#10b981' }} />}
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{activeConv.name}</Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>{activeConv.id}</Typography>
                        </Box>

                        {/* 消息区域 */}
                        <Box sx={{ flex: 1, overflow: 'auto', p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {activeConv.type === 'group' && (
                                <Box sx={{ textAlign: 'center', mb: 1 }}>
                                    <Button size="small" onClick={handleLoadMore} disabled={loadingMore}
                                        sx={{ fontSize: '0.7rem', textTransform: 'none' }}>
                                        {loadingMore ? <CircularProgress size={12} sx={{ mr: 0.5 }} /> : null}
                                        {t('botManager.loadMore')}
                                    </Button>
                                </Box>
                            )}
                            {messages.slice(-MAX_RENDER_MESSAGES).map((msg, i) => {
                                const isSelf = msg.user_id === msg.self_id;
                                return (
                                    <Box key={msg.message_id || i} sx={{ display: 'flex', flexDirection: isSelf ? 'row-reverse' : 'row', gap: 1, alignItems: 'flex-end' }}>
                                        <Box sx={{
                                            maxWidth: '70%', px: 1.5, py: 0.8, borderRadius: 2,
                                            bgcolor: isSelf
                                                ? (isDark ? 'rgba(59,130,246,0.25)' : '#dbeafe')
                                                : (isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6'),
                                        }}>
                                            {!isSelf && activeConv.type === 'group' && (
                                                <Typography sx={{ fontSize: '0.65rem', color: '#6366f1', fontWeight: 600, mb: 0.2 }}>
                                                    {msg.sender?.card || msg.sender?.nickname || msg.user_id}
                                                </Typography>
                                            )}
                                            <Typography sx={{ fontSize: '0.82rem', wordBreak: 'break-word' }}>
                                                {msg.raw_message || ''}
                                            </Typography>
                                            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', mt: 0.3, textAlign: isSelf ? 'left' : 'right' }}>
                                                {formatTime(msg.time)}
                                            </Typography>
                                        </Box>
                                    </Box>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </Box>

                        {/* 输入区域 */}
                        <Box sx={{ p: 1.5, borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`, display: 'flex', gap: 1 }}>
                            <TextField
                                fullWidth size="small" multiline maxRows={3}
                                placeholder={t('botManager.messagePlaceholder')}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                sx={{ '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
                            />
                            <Button
                                variant="contained" onClick={handleSend} disabled={sending || !input.trim()}
                                sx={{ minWidth: 40, px: 1.5 }}
                            >
                                {sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon sx={{ fontSize: 18 }} />}
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Box>

            {/* 联系人选择对话框 */}
            <Dialog open={contactDialogOpen} onClose={() => setContactDialogOpen(false)}
                PaperProps={{ sx: { borderRadius: 3, minWidth: 400, maxHeight: '70vh' } }}>
                <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
                    {t('botManager.selectContact')}
                </DialogTitle>
                <DialogContent sx={{ px: 2, pb: 2 }}>
                    <Tabs value={contactTab} onChange={(_, v) => setContactTab(v)} sx={{ mb: 1.5, minHeight: 36, '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.85rem' } }}>
                        <Tab value="groups" icon={<GroupIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t('botManager.groupList')} />
                        <Tab value="friends" icon={<PersonIcon sx={{ fontSize: 16 }} />} iconPosition="start" label={t('botManager.friendList')} />
                    </Tabs>

                    {/* 手动输入 QQ 号 */}
                    <Box sx={{ mb: 1.5 }}>
                        <TextField
                            size="small" fullWidth
                            placeholder={t('botManager.inputQQ')}
                            value={newQQ}
                            onChange={e => setNewQQ(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { addPrivateChat(); setContactDialogOpen(false); } }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => { addPrivateChat(); setContactDialogOpen(false); }}><SendIcon sx={{ fontSize: 14 }} /></IconButton>
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ '& .MuiInputBase-root': { height: 32, fontSize: '0.8rem' } }}
                        />
                    </Box>

                    {contactLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={24} /></Box>
                    ) : contactTab === 'groups' ? (
                        <List sx={{ maxHeight: 320, overflow: 'auto', py: 0 }}>
                            {contactGroups.map(g => (
                                <ListItemButton key={g.group_id} onClick={() => selectContact('group', String(g.group_id), g.group_name || String(g.group_id))} sx={{ py: 0.8, borderRadius: 1, mb: 0.3 }}>
                                    <ListItemIcon sx={{ minWidth: 32 }}><GroupIcon sx={{ fontSize: 18, color: '#6366f1' }} /></ListItemIcon>
                                    <ListItemText primary={g.group_name || String(g.group_id)} secondary={String(g.group_id)} primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 500 }} secondaryTypographyProps={{ fontSize: '0.7rem', fontFamily: 'monospace' }} />
                                </ListItemButton>
                            ))}
                            {contactGroups.length === 0 && <Typography sx={{ py: 2, textAlign: 'center', color: 'text.secondary', fontSize: '0.8rem' }}>{t('botManager.noGroups')}</Typography>}
                        </List>
                    ) : (
                        <List sx={{ maxHeight: 320, overflow: 'auto', py: 0 }}>
                            {contactFriends.map(f => (
                                <ListItemButton key={f.user_id} onClick={() => selectContact('private', String(f.user_id), f.remark || f.nickname || String(f.user_id))} sx={{ py: 0.8, borderRadius: 1, mb: 0.3 }}>
                                    <ListItemIcon sx={{ minWidth: 32 }}><PersonIcon sx={{ fontSize: 18, color: '#10b981' }} /></ListItemIcon>
                                    <ListItemText primary={f.remark || f.nickname || String(f.user_id)} secondary={String(f.user_id)} primaryTypographyProps={{ fontSize: '0.82rem', fontWeight: 500 }} secondaryTypographyProps={{ fontSize: '0.7rem', fontFamily: 'monospace' }} />
                                </ListItemButton>
                            ))}
                            {contactFriends.length === 0 && <Typography sx={{ py: 2, textAlign: 'center', color: 'text.secondary', fontSize: '0.8rem' }}>{t('botManager.noFriends')}</Typography>}
                        </List>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setContactDialogOpen(false)} color="inherit" sx={{ borderRadius: 2 }}>{t('botManager.cancel')}</Button>
                </DialogActions>
            </Dialog>
        </>
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

export default BotManager;