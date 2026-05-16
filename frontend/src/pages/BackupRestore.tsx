import { useState, useEffect, useRef } from 'react';
import { Box, Typography, Button, Paper, useTheme, CircularProgress, Chip, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import BackupIcon from '@mui/icons-material/Backup';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import StorageIcon from '@mui/icons-material/Storage';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { backupApi } from '../services/api';
import { useTranslate } from '../i18n';

export default function BackupRestore() {
    const theme = useTheme();
    const t = useTranslate();
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [info, setInfo] = useState<{ exists: boolean; size: number; modified: string; path: string } | null>(null);
    const [msg, setMsg] = useState('');
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchInfo = async () => {
        try {
            const data = await backupApi.getInfo();
            setInfo(data.info);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchInfo(); }, []);

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingFile(file);
        setRestoreDialogOpen(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleRestoreConfirm = async () => {
        if (!pendingFile) return;
        setRestoreDialogOpen(false);
        setUploading(true);
        setMsg('');
        try {
            const result = await backupApi.upload(pendingFile);
            setMsg(result.message || t('backup.restoreSuccess'));
            fetchInfo();
        } catch (err) {
            setMsg(t('backup.restoreFailed'));
        } finally {
            setUploading(false);
            setPendingFile(null);
        }
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'rgba(139,92,246,0.1)', display: 'flex' }}>
                    <BackupIcon sx={{ fontSize: 28, color: '#8b5cf6' }} />
                </Box>
                <Box>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>{t('backup.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('backup.subtitle')}</Typography>
                </Box>
            </Box>

            {/* 备份信息 */}
            <Paper elevation={0} sx={{ p: 3, borderRadius: 3, mb: 3,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)',
                backdropFilter: 'blur(16px) saturate(1.2)',
                WebkitBackdropFilter: 'blur(16px) saturate(1.2)',
                border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                    <StorageIcon color="action" />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{t('backup.dbInfo')}</Typography>
                </Box>
                {info && (
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Chip label={`${t('backup.size')}: ${info.size} KB`} variant="outlined" />
                        <Chip label={`${t('backup.lastModified')}: ${info.modified}`} variant="outlined" />
                    </Box>
                )}
            </Paper>

            {/* 操作按钮 */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Button variant="contained" startIcon={<DownloadIcon />}
                    onClick={() => backupApi.download()}
                    sx={{ borderRadius: 2, background: '#2563eb', boxShadow: 'none', '&:hover': { background: '#1d4ed8' } }}>
                    {t('backup.download')}
                </Button>
                <Button variant="outlined" startIcon={<UploadIcon />}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    sx={{ borderRadius: 2 }}>
                    {uploading ? t('backup.uploading') : t('backup.restore')}
                </Button>
                <input type="file" accept=".zip" ref={fileInputRef}
                    style={{ display: 'none' }} onChange={handleUpload} />
            </Box>

            {msg && (
                <Typography variant="body2" sx={{ mt: 2 }} color={msg.includes('fail') ? 'error.main' : 'success.main'}>
                    {msg}
                </Typography>
            )}

            <Typography variant="caption" color="text.secondary" sx={{ mt: 3, display: 'block' }}>
                {t('backup.hint')}
            </Typography>

            <Dialog
                open={restoreDialogOpen}
                onClose={() => { setRestoreDialogOpen(false); setPendingFile(null); }}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('backup.restore')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('backup.confirmRestore')}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => { setRestoreDialogOpen(false); setPendingFile(null); }} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('admin.cancelText')}
                    </Button>
                    <Button onClick={handleRestoreConfirm} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {t('backup.restore')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

