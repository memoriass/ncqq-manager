import type { ReactElement } from 'react';
import { Chip, CircularProgress, IconButton, TableCell, TableRow, Tooltip, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HearingIcon from '@mui/icons-material/Hearing';
import LinkIcon from '@mui/icons-material/Link';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import type { BSConnection } from '../../services/api';

const STATUS_MAP: Record<string, { color: 'success' | 'info' | 'warning' | 'default' | 'error'; key: string; icon: ReactElement | null }> = {
    connected: { color: 'success', key: 'botshepherd.statusConnected', icon: <LinkIcon fontSize="small" /> },
    listening: { color: 'info', key: 'botshepherd.statusListening', icon: <HearingIcon fontSize="small" /> },
    starting: { color: 'warning', key: 'botshepherd.statusStarting', icon: <CircularProgress size={14} /> },
    disabled: { color: 'default', key: 'botshepherd.statusDisabled', icon: <LinkOffIcon fontSize="small" /> },
    error: { color: 'error', key: 'botshepherd.statusError', icon: <ErrorOutlineIcon fontSize="small" /> },
};

export function ConnRow({ id, conn, t, showActions, onEdit, onCopy, onDelete }: {
    id: string; conn: BSConnection; t: (k: string) => string;
    showActions?: boolean; onEdit?: () => void; onCopy?: () => void; onDelete?: () => void;
}) {
    const cs = conn.status?.client_status ?? (conn.enabled === false ? 'disabled' : 'unknown');
    const sm = STATUS_MAP[cs] ?? { color: 'default' as const, key: cs, icon: null };
    const targetList = conn.target_endpoints ?? [];

    return (
        <TableRow hover>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{id}</Typography>
            </TableCell>
            <TableCell>
                <Typography variant="body2">{conn.name ?? '-'}</Typography>
            </TableCell>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {conn.client_endpoint ?? conn.status?.client_endpoint ?? '-'}
                </Typography>
            </TableCell>
            <TableCell>
                {targetList.length > 0 ? targetList.map((ep, i) => (
                    <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ep}</Typography>
                )) : <Typography variant="body2" color="text.secondary">-</Typography>}
            </TableCell>
            <TableCell>
                <Chip size="small" icon={sm.icon ?? undefined}
                    label={t(sm.key)} color={sm.color} variant="outlined" />
                {conn.status?.error && (
                    <Tooltip title={conn.status.error}><ErrorOutlineIcon fontSize="small" color="error" sx={{ ml: 0.5 }} /></Tooltip>
                )}
            </TableCell>
            <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {conn.status?.self_id ?? '-'}
                </Typography>
            </TableCell>
            {showActions && (
                <TableCell align="right">
                    <Tooltip title={t('botshepherd.editConnection')}>
                        <IconButton size="small" onClick={onEdit}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={t('botshepherd.copyConnection')}>
                        <IconButton size="small" onClick={onCopy}><ContentCopyIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={t('botshepherd.deleteConnection')}>
                        <IconButton size="small" color="error" onClick={onDelete}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                </TableCell>
            )}
        </TableRow>
    );
}

/* ---- 连接编辑/新建/复制 对话框 ---- */
