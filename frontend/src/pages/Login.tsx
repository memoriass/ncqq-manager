import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Paper,
    TextField,
    Button,
    Typography,
    Alert,
    IconButton,
    useTheme,
    CircularProgress,
    Container,
    Fade,
    InputAdornment
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import LockIcon from '@mui/icons-material/Lock';
import Brightness4Icon from '@mui/icons-material/Brightness4';
import Brightness7Icon from '@mui/icons-material/Brightness7';
import TranslateIcon from '@mui/icons-material/Translate';
import { ThemeModeContext, LanguageContext } from '../App';
import { useTranslate } from '../i18n';
import { authApi } from '../services/api';

export default function LoginPage() {
    const navigate = useNavigate();
    const theme = useTheme();
    const colorMode = useContext(ThemeModeContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const t = useTranslate();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!username || !password) {
            setError(t('login.error'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            const data = await authApi.login(username, password);
            if (data.status === 'ok') {
                navigate('/admin');
            } else {
                setError(data.message || t('login.error'));
            }
        } catch (err) {
            setError(t('login.error'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'background.default',
                position: 'relative',
                overflow: 'hidden',
                p: 2,
            }}
        >
            {/* Absolute positioned corner system for Login Page */}
            <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1, zIndex: 10 }}>
                <IconButton onClick={toggleLanguage} size="small" aria-label="Toggle language" color="inherit">
                    <TranslateIcon fontSize="small" />
                </IconButton>
                <IconButton onClick={colorMode.toggleTheme} size="small" aria-label="Toggle theme" color="inherit">
                    {theme.palette.mode === 'dark' ? <Brightness7Icon fontSize="small" /> : <Brightness4Icon fontSize="small" />}
                </IconButton>
            </Box>

            <Container maxWidth="lg" sx={{ display: 'flex', justifyContent: 'center', zIndex: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>

                    <Fade in timeout={800}>
                        <Box sx={{ flex: 1, textAlign: 'center', display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <Box
                                component="img"
                                src="https://napneko.github.io/assets/newnewlogo.png"
                                sx={{
                                    width: '100%',
                                    maxWidth: 320,
                                    height: 'auto',
                                    mb: 4,
                                    borderRadius: '50%',
                                    filter: theme.palette.mode === 'dark' ? 'drop-shadow(0px 10px 30px rgba(59,130,246,0.2))' : 'drop-shadow(0px 20px 40px rgba(59,130,246,0.3))',
                                    animation: 'float 6s ease-in-out infinite',
                                    '@keyframes float': {
                                        '0%': { transform: 'translateY(0px)' },
                                        '50%': { transform: 'translateY(-15px)' },
                                        '100%': { transform: 'translateY(0px)' }
                                    }
                                }}
                            />
                            <Typography variant="h3" sx={{ fontWeight: 800, background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: '-0.02em' }}>
                                {t('login.agentTitle')}
                            </Typography>
                            <Typography variant="h6" color="text.secondary" sx={{ mt: 1, fontWeight: 500, opacity: 0.8 }}>
                                {t('login.agentSubtitle')}
                            </Typography>
                        </Box>
                    </Fade>

                    <Fade in timeout={500}>
                        <Paper elevation={0} sx={{
                            p: 4, width: '100%', maxWidth: 450,
                            background: theme.palette.background.paper,
                            border: `1px solid ${theme.palette.divider}`,
                            borderRadius: '16px',
                            boxShadow: theme.palette.mode === 'dark' ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(0,0,0,0.1)',
                        }}>
                            <Typography variant="h5" sx={{ mb: 1, fontWeight: 600, textAlign: 'center' }}>{t('login.title')}</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 4, textAlign: 'center' }}>{t('login.subtitle')}</Typography>

                            {error && (
                                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                                    {error}
                                </Alert>
                            )}

                            <TextField fullWidth label={t('login.username')} variant="outlined" margin="normal" value={username} onChange={e => setUsername(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><PersonIcon color="disabled" /></InputAdornment>,
                                }}
                                sx={{ mb: 2 }}
                            />

                            <TextField fullWidth label={t('login.password')} type="password" variant="outlined" margin="normal" value={password} onChange={e => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><LockIcon color="disabled" /></InputAdornment>,
                                }}
                                sx={{ mb: 4 }}
                            />

                            <Button fullWidth variant="contained" onClick={handleLogin} disabled={loading}
                                sx={{
                                    py: 1.5,
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    fontSize: '1.05rem',
                                }}
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : t('login.submit')}
                            </Button>
                        </Paper>
                    </Fade>
                </Box>
            </Container>
        </Box>
    );
}
