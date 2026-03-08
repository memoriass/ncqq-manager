import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    FormControl,
    Select,
    MenuItem,
    Button,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
    CircularProgress,
} from '@mui/material';
import { Refresh as RefreshIcon, FiberManualRecord as DotIcon, Download as DownloadIcon } from '@mui/icons-material';
import { operationLogsApi, type OperationLog } from '../services/api';
import { useToast } from '../components/Toast';
import { useTranslate } from '../i18n';

const OperationLogs: React.FC = () => {
    const [logs, setLogs] = useState<OperationLog[]>([]);
    const [loading, setLoading] = useState(false);
    const [limit, setLimit] = useState(50);
    const t = useTranslate();

    const toast = useToast();

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const data = await operationLogsApi.list(limit);
            setLogs((data.logs || []).reverse());
        } catch (error) {
            toast.error('获取操作日志失败');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, [limit]);

    // 15s 自动刷新 + 可见性感知
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        const start = () => { interval = setInterval(fetchLogs, 15000); };
        const stop = () => { clearInterval(interval); };
        const onVis = () => { document.hidden ? stop() : start(); };
        if (!document.hidden) start();
        document.addEventListener('visibilitychange', onVis);
        return () => { stop(); document.removeEventListener('visibilitychange', onVis); };
    }, [limit]);

    const getLevelColor = (level: string): 'info' | 'warning' | 'error' | 'default' => {
        switch (level) {
            case 'info':
                return 'info';
            case 'warning':
                return 'warning';
            case 'error':
                return 'error';
            default:
                return 'default';
        }
    };

    const formatLogText = (log: OperationLog): string => {
        const operator = log.operator || log.id;
        const target = log.target || '';

        switch (log.type) {
            case 'container_start':
                return t('opLogs.containerStart').replace('{operator}', operator).replace('{target}', target);
            case 'container_stop':
                return t('opLogs.containerStop').replace('{operator}', operator).replace('{target}', target);
            case 'container_restart':
                return t('opLogs.containerRestart').replace('{operator}', operator).replace('{target}', target);
            case 'container_create':
                return t('opLogs.containerCreate').replace('{operator}', operator).replace('{target}', target);
            case 'container_delete':
                return t('opLogs.containerDelete').replace('{operator}', operator).replace('{target}', target);
            case 'user_login':
                return t('opLogs.userLogin').replace('{operator}', operator).replace('{ip}', log.operator_ip || 'unknown');
            case 'user_create':
                return t('opLogs.userCreate').replace('{operator}', operator).replace('{target}', target);
            case 'user_delete':
                return t('opLogs.userDelete').replace('{operator}', operator).replace('{target}', target);
            case 'config_change':
                return t('opLogs.configChange').replace('{operator}', operator);
            case 'node_create':
                return t('opLogs.nodeCreate').replace('{operator}', operator).replace('{target}', target);
            case 'node_delete':
                return t('opLogs.nodeDelete').replace('{operator}', operator).replace('{target}', target);
            default:
                return t('opLogs.unknownAction').replace('{operator}', operator).replace('{type}', log.type);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                    <Typography variant="h5">{t('opLogs.title')}</Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                            <Select
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                            >
                                <MenuItem value={20}>20 {t('opLogs.records')}</MenuItem>
                                <MenuItem value={50}>50 {t('opLogs.records')}</MenuItem>
                                <MenuItem value={100}>100 {t('opLogs.records')}</MenuItem>
                                <MenuItem value={200}>200 {t('opLogs.records')}</MenuItem>
                            </Select>
                        </FormControl>
                        <Button
                            variant="outlined"
                            startIcon={<RefreshIcon />}
                            onClick={fetchLogs}
                            disabled={loading}
                        >
                            {t('admin.refresh')}
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<DownloadIcon />}
                            onClick={() => window.open(`/api/operation_logs/download?limit=${limit}`, '_blank')}
                        >
                            {t('config.exportLogs')}
                        </Button>
                 </Box>
                </Box>

                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
                        <CircularProgress />
                    </Box>
                ) : logs.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 5, color: 'text.secondary' }}>
                        <Typography variant="body1">{t('opLogs.noLogs')}</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            {t('opLogs.noLogsHint')}
                        </Typography>
                    </Box>
                ) : (
                    <List dense>
                        {logs.map((log) => (
                            <ListItem key={log.id || log.timestamp} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                <ListItemIcon sx={{ minWidth: 32 }}>
                                    <DotIcon sx={{ fontSize: 12, color: getLevelColor(log.level) === 'info' ? 'info.main' : getLevelColor(log.level) === 'warning' ? 'warning.main' : getLevelColor(log.level) === 'error' ? 'error.main' : 'grey.500' }} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={formatLogText(log)}
                                    secondary={log.time}
                                />
                                <Chip label={log.level} size="small" color={getLevelColor(log.level)} variant="outlined" />
                            </ListItem>
                        ))}
                    </List>
                )}
            </Paper>
        </Box>
    );
};

export default OperationLogs;

