/**
 * BotManager 组件 - Bot 管理（消息监控 / 消息发送 / 群管理）
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Typography, Button, TextField, Select, MenuItem, Chip,
    Paper, CircularProgress, IconButton,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    useTheme, InputLabel, FormControl, Tab, Tabs,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import SendIcon from '@mui/icons-material/Send';
import GroupIcon from '@mui/icons-material/Group';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import PersonIcon from '@mui/icons-material/Person';
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

function GroupsPanel({ name, glass }: { name: string; glass: Record<string, unknown> }) {
    const [groups, setGroups] = useState<Array<{ group_id: number; group_name: string; member_count: number; max_member_count: number }>>([]);
    const [loading, setLoading] = useState(false);
    const t = useTranslate();
    const toast = useToast();

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const res = await botApi.call(name, 'get_group_list');
            if (Array.isArray(res.data)) {
                setGroups(res.data as typeof groups);
            }
        } catch {
            toast.error(t('botManager.fetchGroupsFailed'));
        } finally {
            setLoading(false);
        }
    }, [name]);

    useEffect(() => { fetchGroups(); }, [fetchGroups]);

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
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {groups.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    {loading ? t('botManager.loading') : t('botManager.noGroups')}
                                </TableCell>
                            </TableRow>
                        ) : groups.map((g) => (
                            <TableRow key={g.group_id} hover>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{g.group_id}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{g.group_name}</TableCell>
                                <TableCell>{g.member_count}</TableCell>
                                <TableCell>{g.max_member_count}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

export default BotManager;
