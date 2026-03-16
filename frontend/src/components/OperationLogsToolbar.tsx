import { Box, Button, FormControl, MenuItem, Pagination, Select, TextField } from '@mui/material';
import { Download as DownloadIcon, Refresh as RefreshIcon } from '@mui/icons-material';

interface OperationLogsToolbarProps {
    limit: number;
    page: number;
    level: 'info' | 'warning' | 'error' | '';
    operator: string;
    type: string;
    totalPages: number;
    loading: boolean;
    onLimitChange: (value: number) => void;
    onPageChange: (value: number) => void;
    onOperatorChange: (value: string) => void;
    onTypeChange: (value: string) => void;
    onLevelChange: (value: 'info' | 'warning' | 'error' | '') => void;
    onRefresh: () => void;
    onExport: () => void;
    t: (key: string) => string;
}

export function OperationLogsToolbar({
    limit,
    page,
    level,
    operator,
    type,
    totalPages,
    loading,
    onLimitChange,
    onPageChange,
    onOperatorChange,
    onTypeChange,
    onLevelChange,
    onRefresh,
    onExport,
    t,
}: OperationLogsToolbarProps) {
    return (
        <>
            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select value={limit} onChange={(e) => onLimitChange(Number(e.target.value))}>
                        <MenuItem value={20}>20 {t('opLogs.records')}</MenuItem>
                        <MenuItem value={50}>50 {t('opLogs.records')}</MenuItem>
                        <MenuItem value={100}>100 {t('opLogs.records')}</MenuItem>
                        <MenuItem value={200}>200 {t('opLogs.records')}</MenuItem>
                    </Select>
                </FormControl>
                <TextField size="small" label={t('opLogs.operator')} value={operator} onChange={(e) => onOperatorChange(e.target.value)} />
                <TextField size="small" label={t('opLogs.type')} value={type} onChange={(e) => onTypeChange(e.target.value)} />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <Select displayEmpty value={level} onChange={(e) => onLevelChange(e.target.value as 'info' | 'warning' | 'error' | '')}>
                        <MenuItem value="">{t('opLogs.allLevels')}</MenuItem>
                        <MenuItem value="info">info</MenuItem>
                        <MenuItem value="warning">warning</MenuItem>
                        <MenuItem value="error">error</MenuItem>
                    </Select>
                </FormControl>
                <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={loading}>
                    {t('admin.refresh')}
                </Button>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={onExport}>
                    {t('config.exportLogs')}
                </Button>
            </Box>
            {totalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                    <Pagination color="primary" count={totalPages} page={page} onChange={(_, value) => onPageChange(value)} />
                </Box>
            )}
        </>
    );
}

