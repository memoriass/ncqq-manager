import { useState } from 'react';
import { Box, Tab, Tabs, useTheme } from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import GroupIcon from '@mui/icons-material/Group';
import { useTranslate } from '../../i18n';
import { ChatPanel } from './ChatPanel';
import { GroupsPanel } from './GroupsPanel';
import type { BotManagerProps } from './types';

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

export default BotManager;
