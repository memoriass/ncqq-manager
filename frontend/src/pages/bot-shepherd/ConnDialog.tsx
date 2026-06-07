import { useState } from 'react';
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Switch, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import type { BSConnection } from '../../services/api';

export function ConnDialog({ dlg, setDlg, onSave, t }: {
    dlg: { mode: 'add' | 'edit' | 'copy'; id: string; data: Partial<BSConnection> };
    setDlg: (v: null) => void; onSave: (id: string, data: Partial<BSConnection>) => void; t: (k: string) => string;
}) {
    const isCopy = dlg.mode === 'copy';
    const title = isCopy ? t('botshepherd.copyConnection')
        : dlg.mode === 'add' ? t('botshepherd.addConnection')
        : t('botshepherd.editConnection');

    // 用内部 state 让输入受控
    const [form, setForm] = useState<any>({ ...dlg.data });
    const [editId, setEditId] = useState(dlg.id);
    const setField = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

    return (
        <Dialog open maxWidth="sm" fullWidth onClose={() => setDlg(null)}>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
                {isCopy ? (<>
                    <TextField label={t('botshepherd.connNewId')} size="small" fullWidth
                        value={form._copyNewId ?? ''} onChange={e => setField('_copyNewId', e.target.value)} />
                    <TextField label={t('botshepherd.connNewName')} size="small" fullWidth
                        value={form._copyNewName ?? ''} onChange={e => setField('_copyNewName', e.target.value)} />
                </>) : (<>
                    {dlg.mode === 'add' && (
                        <TextField label={t('botshepherd.connId')} size="small" fullWidth
                            value={editId} onChange={e => setEditId(e.target.value)} />
                    )}
                    <TextField label={t('botshepherd.connName')} size="small" fullWidth
                        value={form.name ?? ''} onChange={e => setField('name', e.target.value)} />
                    <TextField label={t('botshepherd.connDescription')} size="small" fullWidth multiline rows={2}
                        value={form.description ?? ''} onChange={e => setField('description', e.target.value)} />
                    <TextField label={t('botshepherd.clientEndpoint')} size="small" fullWidth
                        value={form.client_endpoint ?? ''} onChange={e => setField('client_endpoint', e.target.value)}
                        placeholder="ws://127.0.0.1:PORT/PATH" />
                    {/* 目标端点 —— Tag 列表，每行一个输入框 + 增删按钮 */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                            {t('botshepherd.targetEndpoints')}
                        </Typography>
                        {(form.target_endpoints ?? []).map((ep: string, i: number) => (
                            <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.8 }}>
                                <TextField size="small" fullWidth
                                    value={ep}
                                    placeholder="ws://127.0.0.1:PORT/PATH"
                                    onChange={e => {
                                        const arr = [...(form.target_endpoints ?? [])];
                                        arr[i] = e.target.value;
                                        setField('target_endpoints', arr);
                                    }} />
                                <IconButton size="small" color="error" onClick={() => {
                                    const arr = (form.target_endpoints ?? []).filter((_: string, j: number) => j !== i);
                                    setField('target_endpoints', arr);
                                }}><DeleteIcon fontSize="small" /></IconButton>
                            </Box>
                        ))}
                        <Button size="small" startIcon={<AddIcon />} onClick={() =>
                            setField('target_endpoints', [...(form.target_endpoints ?? []), ''])
                        }>
                            {t('botshepherd.addEndpoint')}
                        </Button>
                    </Box>
                    <FormControlLabel control={
                        <Switch checked={form.enabled !== false} onChange={e => setField('enabled', e.target.checked)} />
                    } label={t('botshepherd.connEnabled')} />
                </>)}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDlg(null)}>{t('botshepherd.connCancel')}</Button>
                <Button variant="contained" onClick={() => onSave(editId, form)}>{t('botshepherd.connSave')}</Button>
            </DialogActions>
        </Dialog>
    );
}

/* ---- 账号编辑对话框 ---- */
