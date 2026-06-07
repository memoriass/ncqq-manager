import { useEffect, useRef, useState } from 'react';
import {
    Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    IconButton, InputAdornment, List, ListItemButton, ListItemIcon, ListItemText,
    Tab, Tabs, TextField, Tooltip, Typography, useTheme,
} from '@mui/material';
import AddCommentIcon from '@mui/icons-material/AddComment';
import GroupIcon from '@mui/icons-material/Group';
import PersonIcon from '@mui/icons-material/Person';
import SendIcon from '@mui/icons-material/Send';
import { useTranslate } from '../../i18n';
import { useWebSocket } from '../../hooks/useWebSocket';
import { botApi, type BotMessage } from '../../services/api';
import { useToast } from '../Toast';
import type { GlassStyle } from './types';

interface Conversation {
    id: string;
    type: 'group' | 'private';
    name: string;
    lastMsg: string;
    lastTime: number;
}

export function ChatPanel({ name, glass }: { name: string; glass: GlassStyle }) {
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

    const getMessageUniqueKey = (msg: BotMessage): string => {
        if (msg.message_id !== undefined && msg.message_id !== null) {
            return `id:${msg.message_id}`;
        }
        return [
            msg.time || 0,
            msg.message_type || '',
            msg.group_id || '',
            msg.user_id || '',
            msg.self_id || '',
            msg.raw_message || '',
        ].join('|');
    };

    const mergeUniqueMessages = (base: BotMessage[], incoming: BotMessage[]): BotMessage[] => {
        if (!incoming.length) return base;
        const result = [...base];
        const seen = new Set(base.map(getMessageUniqueKey));
        for (const msg of incoming) {
            const key = getMessageUniqueKey(msg);
            if (seen.has(key)) continue;
            seen.add(key);
            result.push(msg);
        }
        return result;
    };

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
        const timer = setInterval(fetchCached, 15000);
        return () => clearInterval(timer);
    }, [name]);

    // 实时消息 WebSocket — 仅在 ChatPanel 挂载时连接
    interface WsMsg { type: string; messages?: BotMessage[] }
    const { data: wsData } = useWebSocket<WsMsg>({ path: `/ws/bot_messages/${name}` });

    // 从 WS 消息更新会话列表的 lastMsg
    useEffect(() => {
        if (!wsData || !wsData.messages || wsData.messages.length === 0) return;
        setConversations(prev => {
            const updated = [...prev];
            for (const msg of wsData.messages!) {
                const convId = msg.message_type === 'group' ? String(msg.group_id) : String(msg.user_id);
                const conv = updated.find(c => c.id === convId);
                if (conv && msg.time > conv.lastTime) {
                    conv.lastMsg = msg.raw_message?.slice(0, 30) || '';
                    conv.lastTime = msg.time;
                }
            }
            return updated.sort((a, b) => b.lastTime - a.lastTime);
        });
    }, [wsData]);

    // WS 推送到达时更新消息列表
    useEffect(() => {
        if (!wsData) return;
        if (wsData.type === 'history') {
            const history = wsData.messages || [];
            setMessages(mergeUniqueMessages([], history));
        } else if (wsData.type === 'messages') {
            setMessages(prev => mergeUniqueMessages(prev, wsData.messages || []));
        }
    }, [wsData]);

    // 切换会话时清空（消息按会话过滤在渲染层处理）
    useEffect(() => {
        if (!activeConv) setMessages([]);
    }, [activeConv?.id, activeConv?.type]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !activeConv) return;
        setSending(true);
        try {
            const res = await botApi.send(name, activeConv.type, activeConv.id, input.trim());
            const now = Math.floor(Date.now() / 1000);
            const msgId = res.message_id || now;
            // user_id === self_id 触发 isSelf 判断
            const selfMsg: BotMessage = {
                time: now,
                message_id: msgId,
                message_type: activeConv.type,
                user_id: msgId,
                self_id: msgId,
                sender: { nickname: '', card: '' },
                raw_message: input.trim(),
                group_id: activeConv.type === 'group' ? activeConv.id : '',
                sub_type: '',
            };
            setMessages(prev => mergeUniqueMessages(prev, [selfMsg]));
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
                setMessages(prev => mergeUniqueMessages(hist, prev));
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
                                        ? <Box component="img" src={`/api/resource/group_avatar/${conv.id}`}
                                            sx={{ width: 24, height: 24, borderRadius: 1, objectFit: 'cover' }}
                                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && ((e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline-flex'); }}
                                        />
                                        : <Box component="img" src={`/api/resource/avatar/${conv.id}`}
                                            sx={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
                                            onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling && ((e.currentTarget.nextElementSibling as HTMLElement).style.display = 'inline-flex'); }}
                                        />}
                                    {conv.type === 'group'
                                        ? <GroupIcon sx={{ fontSize: 18, color: '#6366f1', display: 'none' }} />
                                        : <PersonIcon sx={{ fontSize: 18, color: '#10b981', display: 'none' }} />}
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
                                    ? <Box component="img" src={`/api/resource/group_avatar/${activeConv.id}`}
                                        sx={{ width: 28, height: 28, borderRadius: 1, objectFit: 'cover' }}
                                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
                                    />
                                    : <Box component="img" src={`/api/resource/avatar/${activeConv.id}`}
                                        sx={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }}
                                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = 'none'; }}
                                    />}
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
                                {messages.filter(msg => {
                                    if (!activeConv) return false;
                                    if (activeConv.type === 'group') return String(msg.group_id) === activeConv.id;
                                    return msg.message_type === 'private' && (String(msg.user_id) === activeConv.id || String(msg.self_id) === activeConv.id);
                                }).slice(-MAX_RENDER_MESSAGES).map((msg, i) => {
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
                                                    {(msg.raw_message || '').replace(/\[CQ:image[^\]]*\]/g, '[图片]').replace(/\[CQ:face[^\]]*\]/g, '[表情]').replace(/\[CQ:record[^\]]*\]/g, '[语音]').replace(/\[CQ:video[^\]]*\]/g, '[视频]').replace(/\[CQ:at[^\]]*\]/g, '[@]').replace(/\[CQ:[^\]]*\]/g, '[消息]')}
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
