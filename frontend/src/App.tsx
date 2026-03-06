import { useState, useMemo, createContext, useEffect } from 'react';
import { createTheme, ThemeProvider, CssBaseline, useMediaQuery, CircularProgress, Box } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/Login';
import SetupPage from './pages/Setup';
import Dashboard from './pages/Dashboard';
import UserDashboard from './pages/UserDashboard';
import AdminLayout from './layouts/AdminLayout';
import ConfigEditor from './pages/ConfigEditor';
import ClusterSettings from './pages/ClusterSettings';
import Nodes from './pages/Nodes';
import OperationLogs from './pages/OperationLogs';
import Users from './pages/Users';
import ImageManager from './pages/ImageManager';
import AlertSettings from './pages/AlertSettings';
import BackupRestore from './pages/BackupRestore';
import ScheduledTasks from './pages/ScheduledTasks';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { setupApi } from './services/api';

export const ThemeModeContext = createContext({ toggleTheme: () => { } });
export const LanguageContext = createContext({ language: 'zh', toggleLanguage: () => { } });

// We define exact standard colors that match Napcat native
const getDesignTokens = (mode: 'light' | 'dark') => ({
  palette: {
    mode,
    ...(mode === 'light'
      ? {
        primary: { main: '#3b82f6' },
        background: { default: '#f3f4f6', paper: '#ffffff' },
        text: { primary: '#1f2937', secondary: '#4b5563' },
      }
      : {
        primary: { main: '#3b82f6' },
        background: { default: '#1e1e1e', paper: '#252526' },
        text: { primary: '#e5e7eb', secondary: '#9ca3af' },
      }),
  },
  typography: { fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif' },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: 'none' } } },
    MuiButton: { styleOverrides: { root: { textTransform: 'none', borderRadius: '8px' } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } }
  },
});

function App() {
  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = useState<'light' | 'dark'>(prefersDarkMode ? 'dark' : 'light');
  const [language, setLanguage] = useState('zh');
  const [initialized, setInitialized] = useState<boolean | null>(null);

  useEffect(() => {
    const savedMode = localStorage.getItem('themeMode');
    if (savedMode === 'light' || savedMode === 'dark') setMode(savedMode);
    const savedLang = localStorage.getItem('appLang');
    if (savedLang) setLanguage(savedLang);

    // 检查系统是否已初始化
    setupApi.getStatus()
      .then(data => setInitialized(data.initialized))
      .catch(() => setInitialized(true)); // 出错时默认已初始化，走正常登录流程
  }, []);

  const colorMode = useMemo(
    () => ({
      toggleTheme: () => {
        setMode((prev) => {
          const next = prev === 'light' ? 'dark' : 'light';
          localStorage.setItem('themeMode', next);
          return next;
        });
      },
    }),
    [],
  );

  const langMode = useMemo(
    () => ({
      language,
      toggleLanguage: () => {
        setLanguage((prev) => {
          const next = prev === 'zh' ? 'en' : 'zh';
          localStorage.setItem('appLang', next);
          return next;
        });
      }
    }),
    [language]
  );

  const theme = useMemo(() => createTheme(getDesignTokens(mode)), [mode]);

  // 等待初始化状态检查完成
  if (initialized === null) {
    return (
      <ThemeModeContext.Provider value={colorMode}>
        <LanguageContext.Provider value={langMode}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
              <CircularProgress />
            </Box>
          </ThemeProvider>
        </LanguageContext.Provider>
      </ThemeModeContext.Provider>
    );
  }

  return (
    <ErrorBoundary>
    <ThemeModeContext.Provider value={colorMode}>
      <LanguageContext.Provider value={langMode}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                {/* 首次部署：未初始化时所有路由重定向到 /setup */}
                <Route path="/setup" element={initialized ? <Navigate to="/login" replace /> : <SetupPage />} />
                <Route path="/" element={initialized ? <UserDashboard /> : <Navigate to="/setup" replace />} />
                <Route path="/login" element={initialized ? <LoginPage /> : <Navigate to="/setup" replace />} />
                <Route path="/admin" element={initialized ? <AdminLayout /> : <Navigate to="/setup" replace />}>
                  <Route index element={<Dashboard />} />
                  <Route path="config/:node_id/:name" element={<ConfigEditor />} />
                  <Route path="cluster-settings" element={<ClusterSettings />} />
                  <Route path="nodes" element={<Nodes />} />
                  <Route path="users" element={<Users />} />
                  <Route path="images" element={<ImageManager />} />
                  <Route path="alerts" element={<AlertSettings />} />
                  <Route path="backup" element={<BackupRestore />} />
                  <Route path="scheduler" element={<ScheduledTasks />} />
                  <Route path="operation-logs" element={<OperationLogs />} />
                </Route>
                <Route path="*" element={<Navigate to={initialized ? "/" : "/setup"} replace />} />
              </Routes>
            </BrowserRouter>
          </ToastProvider>
        </ThemeProvider>
      </LanguageContext.Provider>
    </ThemeModeContext.Provider>
    </ErrorBoundary>
  );
}

export default App;
