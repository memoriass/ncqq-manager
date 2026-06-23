import { useState, useEffect, useMemo, useRef } from 'react';
import { Alert, Box, Typography, Button, TextField, Skeleton, IconButton, useTheme, Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel, Chip, Checkbox, InputAdornment, Pagination, CircularProgress } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditIcon from '@mui/icons-material/Edit';
import KeyIcon from '@mui/icons-material/Key';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SettingsIcon from '@mui/icons-material/Settings';
import SearchIcon from '@mui/icons-material/Search';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useTranslate } from '../i18n';
import { containerApi, userApi, type User, type Container, type InstanceRef, type UserEditPayload } from '../services/api';
import { copyTextToClipboard, selectTextInput } from '../utils/clipboard';

type KeyDialogState = {
    open: boolean;
    uuid: string;
    apiKey: string;
    copied: boolean;
    loading: boolean;
    error: string;
};

export default function Users() {
    const theme = useTheme();
    const t = useTranslate();
    const [loading, setLoading] = useState(true);
    const [users, setUsers] = useState<User[]>([]);
    const [allContainers, setAllContainers] = useState<Container[]>([]);
    
    // UI state
    const [openDialog, setOpenDialog] = useState(false);
    const [openInstancesDialog, setOpenInstancesDialog] = useState(false);
    const [editUuid, setEditUuid] = useState<string | null>(null);
    const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; uuid: string; name: string }>({
        open: false,
        uuid: '',
        name: '',
    });
    const [keyDialog, setKeyDialog] = useState<KeyDialogState>({
        open: false,
        uuid: '',
        apiKey: '',
        copied: false,
        loading: false,
        error: '',
    });
    const apiKeyInputRef = useRef<HTMLInputElement | null>(null);

    // Form state
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [permission, setPermission] = useState(1);

    // Assign instances state
    const [assignTargetUuid, setAssignTargetUuid] = useState<string | null>(null);
    const [selectedInstances, setSelectedInstances] = useState<string[]>([]);
    const [instanceSearch, setInstanceSearch] = useState('');
    const [instancePage, setInstancePage] = useState(1);
    const INSTANCES_PER_PAGE = 10;

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await userApi.list();
            setUsers(data.data || []);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const fetchContainers = async () => {
        try {
            const data = await containerApi.list();
            setAllContainers(data.containers || []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => {
        fetchUsers();
        fetchContainers();
    }, []);

    const handleOpenAdd = () => {
        setEditUuid(null);
        setUsername('');
        setPassword('');
        setPermission(1);
        setOpenDialog(true);
    };

    const handleOpenEdit = (u: User) => {
        setEditUuid(u.uuid);
        setUsername(u.userName);
        setPassword('');
        setPermission(u.permission);
        setOpenDialog(true);
    };

    const handleOpenAssign = (u: User) => {
        setAssignTargetUuid(u.uuid);
        const insts = (u.instances || []).map((i: InstanceRef) => `${i.node_id}/${i.container_name}`);
        setSelectedInstances(insts);
        setInstanceSearch('');
        setInstancePage(1);
        setOpenInstancesDialog(true);
    };

    const handleSaveUser = async () => {
        try {
            if (editUuid) {
                const payload: UserEditPayload = { userName: username, permission };
                if (password) payload.passWord = password;
                await userApi.edit(editUuid, payload);
            } else {
                await userApi.create(username, password, permission);
            }
            setOpenDialog(false);
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    const handleDeleteUser = async () => {
        if (!deleteDialog.uuid) return;
        try {
            await userApi.delete(deleteDialog.uuid);
            setDeleteDialog({ open: false, uuid: '', name: '' });
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    const handleOpenKeyDialog = (uuid: string) => {
        setKeyDialog({ open: true, uuid, apiKey: '', copied: false, loading: false, error: '' });
    };

    const handleCloseKeyDialog = () => {
        setKeyDialog({ open: false, uuid: '', apiKey: '', copied: false, loading: false, error: '' });
    };

    const handleRegenerateKey = async () => {
        if (!keyDialog.uuid || keyDialog.loading) return;
        setKeyDialog(prev => ({ ...prev, loading: true, error: '' }));
        try {
            const result = await userApi.regenerateApiKey(keyDialog.uuid);
            setKeyDialog(prev => ({ ...prev, apiKey: result.apiKey, copied: false, loading: false, error: '' }));
            fetchUsers();
        } catch (e) {
            console.error(e);
            setKeyDialog(prev => ({
                ...prev,
                loading: false,
                error: t('userMgmt.apiKeyGenerateFailed'),
            }));
        }
    };

    const handleCopyApiKey = async () => {
        if (!keyDialog.apiKey) return;
        try {
            await copyTextToClipboard(keyDialog.apiKey);
            setKeyDialog(prev => ({ ...prev, copied: true, error: '' }));
        } catch (e) {
            console.error(e);
            const selected = selectTextInput(apiKeyInputRef.current);
            setKeyDialog(prev => ({
                ...prev,
                copied: false,
                error: selected
                    ? '浏览器阻止自动复制，已选中 API Key，请按 Ctrl+C 复制'
                    : '浏览器阻止自动复制，请手动选中 API Key 后复制',
            }));
        }
    };

    const handleSaveInstances = async () => {
        if (!assignTargetUuid) return;
        try {
            const payloadInstances: InstanceRef[] = selectedInstances.map(s => {
                const parts = s.split('/');
                const node_id = parts[0];
                const container_name = parts.slice(1).join('/');
                return { node_id, container_name };
            });
            await userApi.assignInstances(assignTargetUuid, payloadInstances);
            setOpenInstancesDialog(false);
            fetchUsers();
        } catch (e) { console.error(e); }
    };

    // Filtered & paginated instance list
    const allInstanceKeys = useMemo(() => allContainers.map(c => `${c.node_id}/${c.name}`), [allContainers]);
    const filteredInstances = useMemo(() => {
        if (!instanceSearch.trim()) return allInstanceKeys;
        const q = instanceSearch.toLowerCase();
        return allInstanceKeys.filter(k => k.toLowerCase().includes(q));
    }, [allInstanceKeys, instanceSearch]);
    const totalPages = Math.max(1, Math.ceil(filteredInstances.length / INSTANCES_PER_PAGE));
    const pagedInstances = useMemo(() => {
        const start = (instancePage - 1) * INSTANCES_PER_PAGE;
        return filteredInstances.slice(start, start + INSTANCES_PER_PAGE);
    }, [filteredInstances, instancePage]);

    const toggleInstance = (key: string) => {
        setSelectedInstances(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };
    const isAllPageSelected = pagedInstances.length > 0 && pagedInstances.every(k => selectedInstances.includes(k));
    const togglePageAll = () => {
        if (isAllPageSelected) {
            setSelectedInstances(prev => prev.filter(k => !pagedInstances.includes(k)));
        } else {
            setSelectedInstances(prev => [...new Set([...prev, ...pagedInstances])]);
        }
    };

    return (
        <Box sx={{ p: { xs: 3, md: 6 }, maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{t('userMgmt.breadcrumb')}</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PeopleIcon sx={{ color: '#3b82f6' }} /> {t('userMgmt.title')}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button variant="outlined" color="inherit" onClick={fetchUsers} startIcon={<RefreshIcon />} sx={{ borderRadius: 2 }}>
                            {t('admin.refresh')}
                        </Button>
                        <Button variant="contained" onClick={handleOpenAdd} startIcon={<AddIcon />} sx={{ borderRadius: 2, bgcolor: '#2563eb', '&:hover': { bgcolor: '#1d4ed8' }, boxShadow: 'none' }}>
                            {t('userMgmt.addUser')}
                        </Button>
                    </Box>
                </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: 3 }}>
                {loading ? (
                    [...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" height={260} sx={{ borderRadius: 3 }} />)
                ) : users.length === 0 ? (
                    <Box sx={{ gridColumn: '1 / -1', p: 8, textAlign: 'center', border: `1px dashed ${theme.palette.divider}`, borderRadius: 3 }}>
                        <Typography color="text.secondary">{t('userMgmt.noData')}</Typography>
                    </Box>
                ) : (
                    users.map(u => (
                        <Box key={u.uuid} sx={{ p: 3, borderRadius: 3, background: theme.palette.mode === 'dark' ? 'rgba(30,30,32,0.35)' : 'rgba(255,255,255,0.25)', backdropFilter: 'blur(16px) saturate(1.2)', WebkitBackdropFilter: 'blur(16px) saturate(1.2)', border: `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, boxShadow: theme.palette.mode === 'dark' ? 'none' : '0 2px 12px rgba(0,0,0,0.06)', position: 'relative' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                                <Typography variant="h6" sx={{ fontWeight: 600 }}>{u.userName}</Typography>
                                <Typography variant="caption" sx={{ px: 1.5, py: 0.5, borderRadius: 8, bgcolor: u.permission >= 10 ? 'rgba(59,130,246,0.1)' : 'rgba(16,185,129,0.1)', color: u.permission >= 10 ? '#3b82f6' : '#10b981', fontWeight: 600 }}>
                                    {u.permission >= 10 ? t('userMgmt.admin') : t('userMgmt.normalUser')}
                                </Typography>
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr', gap: 2, mb: 3 }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">UUID</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{u.uuid}</Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">{t('userMgmt.apiKeyHint')}</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {u.hasApiKey ? t('userMgmt.apiKeySet') : t('userMgmt.apiKeyNotSet')}
                                        <IconButton
                                            size="small"
                                            onClick={() => handleOpenKeyDialog(u.uuid)}
                                            sx={{ color: '#3b82f6' }}
                                        >
                                            <KeyIcon fontSize="small" />
                                        </IconButton>
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary" display="block">{t('userMgmt.assignedInstances')}</Typography>
                                    <Typography variant="body2">{u.instances && u.instances.length > 0 ? t('userMgmt.instanceCount').replace('{count}', String(u.instances.length)) : t('userMgmt.allOrNone')}</Typography>
                                </Box>
                            </Box>

                            <Box sx={{ display: 'flex', gap: 1, borderTop: `1px solid ${theme.palette.divider}`, pt: 2 }}>
                                <Button variant="outlined" size="small" onClick={() => handleOpenEdit(u)} startIcon={<EditIcon />} sx={{ flex: 1, borderRadius: 2 }}>
                                    {t('userMgmt.edit')}
                                </Button>
                                {u.permission < 10 && (
                                    <Button variant="outlined" size="small" onClick={() => handleOpenAssign(u)} startIcon={<SettingsIcon />} sx={{ flex: 1, borderRadius: 2 }}>
                                        {t('userMgmt.assignInstances')}
                                    </Button>
                                )}
                                <Button
                                    variant="outlined"
                                    size="small"
                                    color="error"
                                    onClick={() => setDeleteDialog({ open: true, uuid: u.uuid, name: u.userName })}
                                    sx={{ flex: 1, borderRadius: 2 }}
                                >
                                    {t('userMgmt.delete')}
                                </Button>
                            </Box>
                        </Box>
                    ))
                )}
            </Box>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{editUuid ? t('userMgmt.editUser') : t('userMgmt.createUser')}</DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>
                    <TextField label={t('userMgmt.username')} value={username} onChange={e => setUsername(e.target.value)} fullWidth size="small" sx={{ mt: 1 }} />
                    <TextField label={editUuid ? t('userMgmt.passwordEditHint') : t('userMgmt.password')} value={password} onChange={e => setPassword(e.target.value)} fullWidth size="small" type="password" />
                    <FormControl fullWidth size="small">
                        <InputLabel>{t('userMgmt.permGroup')}</InputLabel>
                        <Select value={permission} label={t('userMgmt.permGroup')} onChange={e => setPermission(Number(e.target.value))}>
                            <MenuItem value={1}>{t('userMgmt.normalUserDesc')}</MenuItem>
                            <MenuItem value={10}>{t('userMgmt.adminDesc')}</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setOpenDialog(false)} color="inherit">{t('userMgmt.cancel')}</Button>
                    <Button onClick={handleSaveUser} variant="contained" disabled={!username || (!editUuid && !password)}>
                        {t('userMgmt.save')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={openInstancesDialog} onClose={() => setOpenInstancesDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3, backgroundImage: 'none', bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#fff' } }}>
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
                    <SettingsIcon color="primary" /> {t('userMgmt.assignTitle')}
                </DialogTitle>
                <DialogContent sx={{ px: 3, pb: 0 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {t('userMgmt.assignHint')}
                    </Typography>

                    {/* Selected chips */}
                    {selectedInstances.length > 0 && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2, p: 1.5, borderRadius: 2, bgcolor: theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)', border: `1px solid ${theme.palette.divider}` }}>
                            {selectedInstances.map(key => (
                                <Chip
                                    key={key}
                                    label={key}
                                    size="small"
                                    onDelete={() => toggleInstance(key)}
                                    sx={{ borderRadius: 1.5, fontSize: '0.75rem' }}
                                />
                            ))}
                        </Box>
                    )}

                    {/* Search */}
                    <TextField
                        fullWidth
                        size="small"
                        placeholder={t('userMgmt.searchInstances')}
                        value={instanceSearch}
                        onChange={e => { setInstanceSearch(e.target.value); setInstancePage(1); }}
                        sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="action" /></InputAdornment>
                        }}
                    />

                    {/* Select all on page */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Checkbox size="small" checked={isAllPageSelected} onChange={togglePageAll} sx={{ p: 0.5 }} />
                            <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                {t('userMgmt.selectAll')}
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            {t('userMgmt.selectedCount').replace('{count}', String(selectedInstances.length)).replace('{total}', String(allInstanceKeys.length))}
                        </Typography>
                    </Box>

                    {/* Instance list */}
                    <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: 2, overflow: 'hidden' }}>
                        {pagedInstances.length === 0 ? (
                            <Box sx={{ p: 3, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary">{t('userMgmt.noData')}</Typography>
                            </Box>
                        ) : pagedInstances.map((key, idx) => {
                            const checked = selectedInstances.includes(key);
                            const parts = key.split('/');
                            const nodeId = parts[0];
                            const containerName = parts.slice(1).join('/');
                            const container = allContainers.find(c => c.node_id === nodeId && c.name === containerName);
                            return (
                                <Box
                                    key={key}
                                    onClick={() => toggleInstance(key)}
                                    sx={{
                                        display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1,
                                        cursor: 'pointer', transition: 'background 0.15s',
                                        bgcolor: checked ? (theme.palette.mode === 'dark' ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.06)') : 'transparent',
                                        '&:hover': { bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)' },
                                        ...(idx < pagedInstances.length - 1 ? { borderBottom: `1px solid ${theme.palette.divider}` } : {}),
                                    }}
                                >
                                    <Checkbox size="small" checked={checked} sx={{ p: 0.5 }} tabIndex={-1} />
                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: container?.status === 'running' ? '#10b981' : '#94a3b8', flexShrink: 0 }} />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography variant="body2" noWrap sx={{ fontWeight: checked ? 600 : 400 }}>{containerName}</Typography>
                                        <Typography variant="caption" color="text.secondary" noWrap>{nodeId}</Typography>
                                    </Box>
                                </Box>
                            );
                        })}
                    </Box>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
                            <Pagination
                                count={totalPages}
                                page={instancePage}
                                onChange={(_, p) => setInstancePage(p)}
                                size="small"
                                shape="rounded"
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2.5, pt: 1 }}>
                    <Button onClick={() => setOpenInstancesDialog(false)} color="inherit" sx={{ borderRadius: 2 }}>{t('userMgmt.cancel')}</Button>
                    <Button onClick={handleSaveInstances} variant="contained" sx={{ borderRadius: 2, boxShadow: 'none' }}>
                        {t('userMgmt.saveAssign')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={deleteDialog.open}
                onClose={() => setDeleteDialog({ open: false, uuid: '', name: '' })}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: 420 } }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <WarningAmberIcon sx={{ color: '#ef4444' }} />
                    {t('userMgmt.delete')}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        {t('user.confirmDeleteUser').replace('{name}', deleteDialog.name)}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    <Button onClick={() => setDeleteDialog({ open: false, uuid: '', name: '' })} color="inherit" sx={{ borderRadius: 2 }}>
                        {t('userMgmt.cancel')}
                    </Button>
                    <Button onClick={handleDeleteUser} variant="contained" color="error" disableElevation sx={{ borderRadius: 2 }}>
                        {t('userMgmt.delete')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={keyDialog.open}
                onClose={handleCloseKeyDialog}
                PaperProps={{ sx: { borderRadius: 3, p: 1, minWidth: { xs: 'calc(100vw - 32px)', sm: 420 } } }}
            >
                <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {keyDialog.apiKey ? <KeyIcon color="primary" /> : <WarningAmberIcon sx={{ color: '#ef4444' }} />}
                    {keyDialog.apiKey ? t('userMgmt.apiKeyGeneratedTitle') : t('userMgmt.apiKeyHint')}
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {keyDialog.apiKey ? (
                        <>
                            <Typography variant="body2" sx={{ color: 'warning.main' }}>
                                {t('userMgmt.apiKeyOneTimeWarning')}
                            </Typography>
                            <TextField
                                label={t('userMgmt.apiKeyTokenLabel')}
                                value={keyDialog.apiKey}
                                fullWidth
                                size="small"
                                inputRef={apiKeyInputRef}
                                InputProps={{ readOnly: true }}
                                sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace' } }}
                            />
                            {keyDialog.error && (
                                <Alert severity="error" sx={{ borderRadius: 2 }}>
                                    {keyDialog.error}
                                </Alert>
                            )}
                        </>
                    ) : (
                        <>
                            <Typography variant="body2">
                                {t('user.confirmRegenerateKey')}
                            </Typography>
                            {keyDialog.error && (
                                <Alert severity="error" sx={{ borderRadius: 2 }}>
                                    {keyDialog.error}
                                </Alert>
                            )}
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, pt: 0 }}>
                    {keyDialog.apiKey ? (
                        <>
                            <Button onClick={handleCopyApiKey} startIcon={<ContentCopyIcon />} sx={{ borderRadius: 2 }}>
                                {keyDialog.copied ? t('userMgmt.copied') : t('userMgmt.copyApiKey')}
                            </Button>
                            <Button onClick={handleCloseKeyDialog} variant="contained" disableElevation sx={{ borderRadius: 2 }}>
                                {t('userMgmt.close')}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button onClick={handleCloseKeyDialog} color="inherit" sx={{ borderRadius: 2 }}>
                                {t('userMgmt.cancel')}
                            </Button>
                            <Button
                                onClick={handleRegenerateKey}
                                variant="contained"
                                color="error"
                                disableElevation
                                disabled={keyDialog.loading}
                                startIcon={keyDialog.loading ? <CircularProgress size={16} color="inherit" /> : undefined}
                                sx={{ borderRadius: 2 }}
                            >
                                {keyDialog.loading ? t('userMgmt.apiKeyGenerating') : t('userMgmt.regenerateKey')}
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}

