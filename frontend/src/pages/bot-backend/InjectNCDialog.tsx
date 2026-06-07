import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, TextField, Typography } from '@mui/material';
import { useTranslate } from '../../i18n';
import type { Container } from '../../services/api';
import type { EndpointEntry } from './types';

interface InjectNCDialogProps {
    open: boolean;
    entry: EndpointEntry;
    containers: Container[];
    onClose: () => void;
    onConfirm: (containerNames: string[]) => Promise<void>;
}

export function InjectNCDialog({ open, entry, containers, onClose, onConfirm }: InjectNCDialogProps) {
    const t = useTranslate();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (open) { setSelected([]); setSearch(''); setPage(1); } }, [open]);

    const allOptions = containers
        .filter(c => c.uin && c.uin !== '鏈櫥褰?/ Not Logged In')
        .map(c => ({ name: c.name, label: `${c.name}  (${c.uin})` }));
    const filtered = allOptions.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const toggle = (name: string) => {
        setSelected(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
    };
    const toggleAll = () => {
        const pageNames = pageItems.map(o => o.name);
        const allChecked = pageNames.every(n => selected.includes(n));
        if (allChecked) setSelected(prev => prev.filter(n => !pageNames.includes(n)));
        else setSelected(prev => [...new Set([...prev, ...pageNames])]);
    };

    const handleConfirm = async () => {
        if (selected.length === 0) return;
        setLoading(true);
        await onConfirm(selected);
        setLoading(false);
        onClose();
    };

    const pageNames = pageItems.map(o => o.name);
    const allPageChecked = pageNames.length > 0 && pageNames.every(n => selected.includes(n));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
                {t('botBackend.injectNCTitle')}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {entry.alias || entry.url}
                </Typography>
            </DialogTitle>
            <DialogContent>
                {allOptions.length === 0 ? (
                    <Alert severity="warning" sx={{ mt: 1 }}>{t('botBackend.noNC')}</Alert>
                ) : (
                    <>
                        <TextField size="small" fullWidth placeholder={t('botBackend.searchPlaceholder')}
                            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            sx={{ mb: 1.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Checkbox size="small" checked={allPageChecked}
                                indeterminate={pageNames.some(n => selected.includes(n)) && !allPageChecked}
                                onChange={toggleAll} />
                            <Typography variant="caption" color="text.secondary">
                                {t('botBackend.selected').replace('{n}', String(selected.length))}
                            </Typography>
                        </Box>
                        {pageItems.map(o => (
                            <Box key={o.name} sx={{ display: 'flex', alignItems: 'center' }}>
                                <Checkbox size="small" checked={selected.includes(o.name)}
                                    onChange={() => toggle(o.name)} />
                                <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{o.label}</Typography>
                            </Box>
                        ))}
                        {pageCount > 1 && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                                <Pagination count={pageCount} page={page} size="small"
                                    onChange={(_, v) => setPage(v)} />
                            </Box>
                        )}
                        <Alert severity="warning" sx={{ mt: 1.5, fontSize: '0.75rem' }}>
                            {t('botBackend.ncReloadHint')}
                        </Alert>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('botBackend.cancelText')}</Button>
                <Button variant="contained" disabled={selected.length === 0 || loading}
                    onClick={handleConfirm} startIcon={loading ? <CircularProgress size={16} /> : undefined}>
                    {t('botBackend.confirmInject')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}


// 鈹€鈹€鈹€ EndpointCard锛氱幇浠ｆ墎骞冲寲璁捐 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
