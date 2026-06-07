import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Switch, TextField } from '@mui/material';
import type { BSAccount } from '../../services/api';

export function AcctDialog({ dlg, setDlg, onSave, t }: {
    dlg: { id: string; data: Partial<BSAccount> };
    setDlg: (v: null) => void; onSave: (data: Partial<BSAccount>) => void; t: (k: string) => string;
}) {
    const [form, setForm] = useState<any>({ ...dlg.data });
    const setField = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={() => setDlg(null)}>
            <DialogTitle>{t('botshepherd.editAccount')} — {dlg.id}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                <TextField label={t('botshepherd.accountName')} size="small" fullWidth
                    value={form.name ?? ''} onChange={e => setField('name', e.target.value)} />
                <TextField label={t('botshepherd.connDescription')} size="small" fullWidth multiline rows={2}
                    value={form.description ?? ''} onChange={e => setField('description', e.target.value)} />
                <FormControlLabel control={
                    <Switch checked={form.enabled !== false} onChange={e => setField('enabled', e.target.checked)} />
                } label={t('botshepherd.accountEnabled')} />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDlg(null)}>{t('botshepherd.connCancel')}</Button>
                <Button variant="contained" onClick={() => onSave(form)}>{t('botshepherd.connSave')}</Button>
            </DialogActions>
        </Dialog>
    );
}
