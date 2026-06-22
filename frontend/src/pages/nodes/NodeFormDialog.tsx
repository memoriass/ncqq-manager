import { Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, TextField, Tooltip, Typography, Box, useTheme } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useTranslate } from '../../i18n';

interface NodeFormDialogProps {
    open: boolean;
    editNodeId: string | null;
    nodeName: string;
    nodeAddress: string;
    nodeApiKey: string;
    nodeApiKeyLoading: boolean;
    onClose: () => void;
    onSave: () => void;
    onNodeNameChange: (value: string) => void;
    onNodeAddressChange: (value: string) => void;
    onNodeApiKeyChange: (value: string) => void;
    onCopyApiKey: () => void;
    onGenerateApiKey: () => void;
}

export default function NodeFormDialog({
    open,
    editNodeId,
    nodeName,
    nodeAddress,
    nodeApiKey,
    nodeApiKeyLoading,
    onClose,
    onSave,
    onNodeNameChange,
    onNodeAddressChange,
    onNodeApiKeyChange,
    onCopyApiKey,
    onGenerateApiKey,
}: NodeFormDialogProps) {
    const theme = useTheme();
    const t = useTranslate();

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none', bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff' } }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700 }}>
                <SettingsIcon color="primary" /> {editNodeId ? t('nodePanel.editNode') : t('nodePanel.addNodeConfig')}
            </DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 1 }}>
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('nodePanel.remarkInfo')}</Typography>
                        <TextField fullWidth size="small" placeholder={t('nodePanel.remarkPlaceholder')} value={nodeName} onChange={e => onNodeNameChange(e.target.value)} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('nodePanel.remoteAddress')}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {t('nodePanel.remoteAddressHelp')}
                        </Typography>
                        <TextField fullWidth size="small" placeholder={t('nodePanel.remoteAddressPlaceholder')} value={nodeAddress} onChange={e => onNodeAddressChange(e.target.value)} />
                    </Box>
                    <Box>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>{t('nodePanel.apiKeyLabel')}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            {t('nodePanel.apiKeyHelp')}
                        </Typography>
                        <TextField
                            fullWidth
                            size="small"
                            placeholder={t('nodePanel.apiKeyPlaceholder')}
                            value={nodeApiKey}
                            onChange={e => onNodeApiKeyChange(e.target.value.trim())}
                            disabled={nodeApiKeyLoading}
                            inputProps={{ style: { fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace' } }}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        {nodeApiKeyLoading ? (
                                            <CircularProgress size={18} />
                                        ) : (
                                            <>
                                                <Tooltip title={t('nodePanel.copyApiKey')}>
                                                    <span>
                                                        <IconButton size="small" edge="end" onClick={onCopyApiKey} disabled={!nodeApiKey} aria-label={t('nodePanel.copyApiKey')}>
                                                            <ContentCopyIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title={t('nodePanel.generateApiKey')}>
                                                    <IconButton size="small" edge="end" onClick={onGenerateApiKey} aria-label={t('nodePanel.generateApiKey')}>
                                                        <RefreshIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </>
                                        )}
                                    </InputAdornment>
                                ),
                            }}
                        />
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions sx={{ p: 3, pt: 0 }}>
                <Button onClick={onClose} color="inherit" sx={{ borderRadius: 2 }}>{t('nodePanel.cancel')}</Button>
                <Button variant="contained" onClick={onSave} disabled={!nodeName || !nodeAddress || nodeApiKeyLoading} sx={{ borderRadius: 2, boxShadow: 'none' }}>{t('nodePanel.saveNode')}</Button>
            </DialogActions>
        </Dialog>
    );
}
