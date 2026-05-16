import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Paper, Tab, Tabs, TextField, Typography, useTheme } from '@mui/material';

import { OperationLogsList } from '../components/OperationLogsList';
import { OperationLogsToolbar } from '../components/OperationLogsToolbar';
import { useToast } from '../components/Toast';
import { useOperationLogsFeed } from '../hooks/useOperationLogsFeed';
import { useTranslate } from '../i18n';
import { nodeApi } from '../services/api';
import { buildOperationLogsDownloadUrl } from '../services/operationLogs';

const OperationLogsPage: React.FC = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [limit, setLimit] = useState(50);
    const [page, setPage] = useState(1);
    const [operator, setOperator] = useState('');
    const [type, setType] = useState('');
    const [level, setLevel] = useState<'info' | 'warning' | 'error' | ''>('');
    const [managerLines, setManagerLines] = useState(500);
    const [managerLogs, setManagerLogs] = useState('');
    const [managerLoading, setManagerLoading] = useState(false);
    const [managerAutoRefresh, setManagerAutoRefresh] = useState(false);
    const theme = useTheme();
    const toast = useToast();
    const t = useTranslate();

    const { logs, loading, totalPages, pendingNewCount, highlightedLogIds, listRef, fetchLogs, scrollToTop } = useOperationLogsFeed(
        { limit, page, operator, type, level },
        (message) => toast.error(message),
    );

    const handleExport = () => {
        window.open(buildOperationLogsDownloadUrl({
            limit,
            page,
            operator: operator.trim(),
            type: type.trim(),
            level,
        }), '_blank');
    };

    const fetchManagerLogs = useCallback(async (lines: number) => {
        setManagerLoading(true);
        try {
            const data = await nodeApi.getLogs('local', lines);
            setManagerLogs(data.logs || '');
        } catch {
            toast.error(t('opLogs.managerFetchFailed'));
            setManagerLogs('');
        } finally {
            setManagerLoading(false);
        }
    }, [t, toast]);

    useEffect(() => {
        if (activeTab === 0 && !managerLogs && !managerLoading) {
            void fetchManagerLogs(managerLines);
        }
    }, [activeTab, fetchManagerLogs, managerLines, managerLoading, managerLogs]);

    useEffect(() => {
        if (activeTab !== 0 || !managerAutoRefresh) {
            return;
        }
        const interval = setInterval(() => {
            void fetchManagerLogs(managerLines);
        }, 5000);
        return () => clearInterval(interval);
    }, [activeTab, fetchManagerLogs, managerAutoRefresh, managerLines]);

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 3,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
                backdropFilter: 'blur(16px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                boxShadow: 'none', borderRadius: 3 }}>
                <Box sx={{ borderBottom: `1px solid ${theme.palette.divider}`, mb: 3 }}>
                    <Typography variant="h5" sx={{ mb: 2 }}>{t('opLogs.title')}</Typography>
                    <Tabs
                        value={activeTab}
                        onChange={(_, value) => setActiveTab(value)}
                        variant="scrollable"
                        scrollButtons="auto"
                    >
                        <Tab label={t('opLogs.tabs.manager')} />
                        <Tab label={t('opLogs.tabs.operation')} />
                    </Tabs>
                </Box>

                {activeTab === 1 && (
                    <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, gap: 2, flexWrap: 'wrap' }}>
                            <Typography variant="h6">{t('opLogs.operationTitle')}</Typography>
                            <OperationLogsToolbar
                                limit={limit}
                                page={page}
                                level={level}
                                operator={operator}
                                type={type}
                                totalPages={totalPages}
                                loading={loading}
                                onLimitChange={(value) => { setLimit(value); setPage(1); }}
                                onPageChange={setPage}
                                onOperatorChange={(value) => { setOperator(value); setPage(1); }}
                                onTypeChange={(value) => { setType(value); setPage(1); }}
                                onLevelChange={(value) => { setLevel(value); setPage(1); }}
                                onRefresh={() => { void fetchLogs('manual'); }}
                                onExport={handleExport}
                                t={t}
                            />
                        </Box>

                        {pendingNewCount > 0 && (
                            <Box sx={{ position: 'sticky', top: 0, zIndex: 1, display: 'flex', justifyContent: 'center', py: 1, mb: 2, backgroundColor: 'background.paper' }}>
                                <Button size="small" variant="contained" onClick={scrollToTop} sx={{ textTransform: 'none' }}>
                                    {t('opLogs.newLogsNotice').replace('{count}', String(pendingNewCount))}
                                </Button>
                            </Box>
                        )}

                        <OperationLogsList
                            logs={logs}
                            loading={loading}
                            highlightedLogIds={highlightedLogIds}
                            listRef={listRef}
                            t={t}
                        />
                    </>
                )}

                {activeTab === 0 && (
                    <>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
                            <Typography variant="h6">{t('opLogs.managerTitle')}</Typography>
                            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                                <TextField
                                    size="small"
                                    type="number"
                                    label={t('opLogs.managerLines')}
                                    value={managerLines}
                                    onChange={(event) => {
                                        const value = Number(event.target.value);
                                        setManagerLines(Math.max(50, Math.min(5000, Number.isFinite(value) ? value : 500)));
                                    }}
                                    sx={{ width: 120 }}
                                />
                                <Button
                                    variant="outlined"
                                    onClick={() => { void fetchManagerLogs(managerLines); }}
                                >
                                    {t('admin.refresh')}
                                </Button>
                                <Button
                                    variant={managerAutoRefresh ? 'contained' : 'outlined'}
                                    onClick={() => setManagerAutoRefresh((prev) => !prev)}
                                >
                                    {managerAutoRefresh ? t('opLogs.autoRefreshOn') : t('opLogs.autoRefreshOff')}
                                </Button>
                            </Box>
                        </Box>

                        <Box sx={{
                            borderRadius: 2,
                            p: 2,
                            minHeight: 420,
                            maxHeight: '70vh',
                            overflow: 'auto',
                            bgcolor: theme.palette.mode === 'dark' ? '#0d1117' : '#f8f9fa',
                            border: `1px solid ${theme.palette.divider}`,
                        }}>
                            {managerLoading && !managerLogs ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
                                    <CircularProgress size={28} />
                                </Box>
                            ) : !managerLogs ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 240 }}>
                                    <Typography color="text.secondary">{t('opLogs.noManagerLogs')}</Typography>
                                </Box>
                            ) : (
                                <Box component="pre" sx={{
                                    m: 0,
                                    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
                                    fontSize: '0.78rem',
                                    lineHeight: 1.7,
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                    color: theme.palette.mode === 'dark' ? '#c9d1d9' : '#24292f',
                                }}>
                                    {managerLogs}
                                </Box>
                            )}
                        </Box>
                    </>
                )}
            </Paper>
        </Box>
    );
};

export default OperationLogsPage;

