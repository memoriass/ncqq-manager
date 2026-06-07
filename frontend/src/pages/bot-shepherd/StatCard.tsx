import type { ReactNode } from 'react';
import { Box, Typography, useTheme } from '@mui/material';

export function StatCard({ icon, label, value, color }: { icon: ReactNode; label: string; value: number; color: string }) {
    const theme = useTheme();
    return (
        <Box sx={{ p: 1.5, borderRadius: 2,
            bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
            backdropFilter: 'blur(16px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
            border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
            display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box sx={{ color, display: 'flex' }}>{icon}</Box>
            <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{value}</Typography>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
        </Box>
    );
}
