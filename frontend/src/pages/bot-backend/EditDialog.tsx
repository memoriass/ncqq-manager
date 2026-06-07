import { useEffect, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';
import { useTranslate } from '../../i18n';
import { useToast } from '../../components/Toast';
import type { EndpointEntry } from './types';
import { isValidWsUrl } from './validators';

interface EditDialogProps {
    open: boolean;
    entry: EndpointEntry;
    allAliases: string[];
    onClose: () => void;
    onSave: (patch: { url: string; alias: string; token: string }) => void;
}

export function EditDialog({ open, entry, allAliases, onClose, onSave }: EditDialogProps) {
    const t = useTranslate();
    const toast = useToast();
    const [url, setUrl] = useState(entry.url);
    const [alias, setAlias] = useState(entry.alias);
    const [token, setToken] = useState(entry.token);

    useEffect(() => {
        if (open) { setUrl(entry.url); setAlias(entry.alias); setToken(entry.token); }
    }, [open, entry]);

    const handleSave = () => {
        const trimUrl = url.trim();
        if (!isValidWsUrl(trimUrl)) { toast.error(t('botBackend.invalidUrl')); return; }
        const trimAlias = alias.trim();
        if (trimAlias && trimAlias !== entry.alias &&
            allAliases.filter(a => a === trimAlias).length > 0) {
            toast.warning(t('botBackend.aliasDuplicate')); return;
        }
        onSave({ url: trimUrl, alias: trimAlias, token: token.trim() });
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>{t('botBackend.editEndpoint')}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField label="WebSocket URL" placeholder={t('botBackend.urlPlaceholder')}
                    value={url} onChange={e => setUrl(e.target.value)} fullWidth size="small"
                    inputProps={{ style: { fontFamily: 'monospace' } }} />
                <TextField label={t('botBackend.alias')} placeholder={t('botBackend.aliasPlaceholder')}
                    value={alias} onChange={e => setAlias(e.target.value)} fullWidth size="small" />
                <TextField label={t('botBackend.token')} placeholder="Bearer token / access_token"
                    value={token} onChange={e => setToken(e.target.value)} fullWidth size="small" />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('botBackend.cancelText')}</Button>
                <Button variant="contained" onClick={handleSave}>淇濆瓨 / Save</Button>
            </DialogActions>
        </Dialog>
    );
}

// 鈹€鈹€鈹€ InjectBSDialog锛氭敞鍏ュ埌 BS 杩炴帴锛堝閫?+ 鍒嗛〉锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
