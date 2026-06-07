import { useEffect, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Pagination, TextField, Typography } from '@mui/material';
import { useTranslate } from '../../i18n';
import type { BSConnection } from '../../services/api';
import type { EndpointEntry } from './types';

interface InjectBSDialogProps {
    open: boolean;
    entry: EndpointEntry;
    bsConnections: Record<string, BSConnection>;
    onClose: () => void;
    onConfirm: (connIds: string[]) => Promise<void>;
}

const PAGE_SIZE = 8;

export function InjectBSDialog({ open, entry, bsConnections, onClose, onConfirm }: InjectBSDialogProps) {
    const t = useTranslate();
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    useEffect(() => { if (open) { setSelected([]); setSearch(''); setPage(1); } }, [open]);

    const allOptions = Object.entries(bsConnections).map(([id, c]) => ({
        id, label: `${c.name || id}  (${id})`,
    }));
    const filtered = allOptions.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const toggle = (id: string) => {
        setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };
    const toggleAll = () => {
        const pageIds = pageItems.map(o => o.id);
        const allChecked = pageIds.every(id => selected.includes(id));
        if (allChecked) setSelected(prev => prev.filter(id => !pageIds.includes(id)));
        else setSelected(prev => [...new Set([...prev, ...pageIds])]);
    };

    const handleConfirm = async () => {
        if (selected.length === 0) return;
        setLoading(true);
        await onConfirm(selected);
        setLoading(false);
        onClose();
    };

    const pageIds = pageItems.map(o => o.id);
    const allPageChecked = pageIds.length > 0 && pageIds.every(id => selected.includes(id));

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>
                {t('botBackend.injectBSTitle')}
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {entry.alias || entry.url}
                </Typography>
            </DialogTitle>
            <DialogContent>
                {allOptions.length === 0 ? (
                    <Alert severity="warning" sx={{ mt: 1 }}>{t('botBackend.noBS')}</Alert>
                ) : (
                    <>
                        <TextField size="small" fullWidth placeholder={t('botBackend.searchPlaceholder')}
                            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
                            sx={{ mb: 1.5 }} />
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                            <Checkbox size="small" checked={allPageChecked}
                                indeterminate={pageIds.some(id => selected.includes(id)) && !allPageChecked}
                                onChange={toggleAll} />
                            <Typography variant="caption" color="text.secondary">
                                {t('botBackend.selected').replace('{n}', String(selected.length))}
                            </Typography>
                        </Box>
                        {pageItems.map(o => (
                            <Box key={o.id} sx={{ display: 'flex', alignItems: 'center' }}>
                                <Checkbox size="small" checked={selected.includes(o.id)}
                                    onChange={() => toggle(o.id)} />
                                <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{o.label}</Typography>
                            </Box>
                        ))}
                        {pageCount > 1 && (
                            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1.5 }}>
                                <Pagination count={pageCount} page={page} size="small"
                                    onChange={(_, v) => setPage(v)} />
                            </Box>
                        )}
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



// 鈹€鈹€鈹€ InjectNCDialog锛氭敞鍏ュ埌 NCQQ 瀹炰緥锛堝閫?+ 鍒嗛〉锛?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
