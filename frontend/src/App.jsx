import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { CheckCircle, Clock, AlertTriangle, RefreshCw } from 'lucide-react';

import Sidebar from './components/layout/Sidebar';
import LoginPage from './features/auth/pages/LoginPage';
import SubmissionListPage from './features/submissions/pages/SubmissionListPage';
import SubmissionDetailPage from './features/submissions/pages/SubmissionDetailPage';
import MappingKeycodePage from './features/mappings/pages/MappingKeycodePage';
import AIConfigPage from './features/ai-config/pages/AIConfigPage';
import UserManagementPage from './features/users/pages/UserManagementPage';
import RoleManagementPage from './features/users/pages/RoleManagementPage';
import LocalTTSStudio from './components/local-tts/LocalTTSStudio';
import KpiReportPage from './features/reports/pages/KpiReportPage';
import ManualReportPage from './features/reports/pages/ManualReportPage';
import ReportPeriodManagementPage from './features/reports/pages/ReportPeriodManagementPage';
import KpiConfigurationPage from './features/reports/pages/KpiConfigurationPage';
import BankStatementImportsPage from './features/expenses/pages/BankStatementImportsPage';
import BankTransactionsPage from './features/expenses/pages/BankTransactionsPage';
import ExpenseDashboardPage from './features/expenses/pages/ExpenseDashboardPage';
import LogsConsolePage from './features/logs/pages/LogsConsolePage';
import { clearSession, readSession, saveSession } from './services/authSession';
import ChangePasswordPage from './features/auth/pages/ChangePasswordPage';
import BulkSyncPanel from './components/sync/BulkSyncPanel';
import KeyVocabPage from './features/key-vocab/pages/KeyVocabPage';

const API_BASE = '/api/submissions';
const AUTH_BASE = '/api/auth';

function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    return readSession();
  });
  const [authChecking, setAuthChecking] = useState(Boolean(currentUser));

  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  const hasPermission = permission => currentUser?.permissions?.includes(permission);

  let activeTab = 'submissions';
  if (path.startsWith('/mappings')) activeTab = 'mappings';
  else if (path.startsWith('/ai')) activeTab = 'ai';
  else if (path.startsWith('/users')) activeTab = 'users';
  else if (path.startsWith('/roles')) activeTab = 'roles';
  else if (path.startsWith('/local-tts')) activeTab = 'local-tts';
  else if (path.startsWith('/key-vocab')) activeTab = 'key-vocab';
  else if (path.startsWith('/logs')) activeTab = 'logs';
  else if (path.startsWith('/reports/kpi-config')) activeTab = 'report-kpi-config';
  else if (path.startsWith('/reports/manage')) activeTab = 'report-manage';
  else if (path.startsWith('/reports/kpi')) activeTab = 'report-kpi';
  else if (path.startsWith('/expenses/dashboard')) activeTab = 'expense-dashboard';
  else if (path.startsWith('/expenses/transactions')) activeTab = 'expense-transactions';
  else if (path.startsWith('/expenses')) activeTab = 'expenses';
  else if (path.startsWith('/change-password')) activeTab = 'change-password';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const [message, setMessage] = useState(null);
  const showMsg = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  };

  const [liveLogs, setLiveLogs] = useState([]);
  const addLiveLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString('vi-VN');
    setLiveLogs(prev => [{ time, text, type }, ...prev]);
  };

  // Auth State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const particles = [
    { left: '10%', size: 4, duration: 18, delay: 0 },
    { left: '25%', size: 6, duration: 22, delay: 3 },
    { left: '45%', size: 3, duration: 16, delay: 7 },
    { left: '65%', size: 5, duration: 20, delay: 2 },
    { left: '80%', size: 4, duration: 25, delay: 5 },
  ];

  const handleLogin = async (e, credentials = {}) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${AUTH_BASE}/login`, {
        email: credentials.email || loginUser,
        password: credentials.password || loginPass
      });
      if (res.data.success) {
        const userObj = { ...res.data.user, token: res.data.token };
        setCurrentUser(userObj);
        saveSession(userObj);
        showMsg(`Chào mừng ${userObj.name}!`, 'success');
        const returnTo=location.state?.from||sessionStorage.getItem('auth_return_to')||'/submissions';
        sessionStorage.removeItem('auth_return_to');
        navigate(returnTo,{replace:true});
      } else {
        showMsg(res.data.error || 'Đăng nhập thất bại', 'error');
      }
    } catch (err) {
      showMsg(err.response?.data?.error || 'Sai tên đăng nhập hoặc mật khẩu', 'error');
    }
  };

  const handleLogout = async () => {
    try { await axios.post(`${AUTH_BASE}/logout`); } catch { /* Session may already be expired. */ }
    setCurrentUser(null);
    clearSession(false);
    navigate('/login');
  };

  useEffect(() => {
    const onLogout = () => {
      setCurrentUser(null);
      navigate('/login');
    };
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, [navigate]);

  useEffect(() => {
    if (!currentUser?.token) {
      setAuthChecking(false);
      return;
    }
    axios.get(`${AUTH_BASE}/me`)
      .then(response => {
        const session = readSession();
        const userObj = { ...response.data.user, token: session?.token || currentUser.token };
        setCurrentUser(userObj);
        saveSession(userObj);
      })
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  // Submissions Data
  const [submissions, setSubmissions] = useState([]);
  const [submissionMeta, setSubmissionMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [syncJob, setSyncJob] = useState(null);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [syncPanelMinimized, setSyncPanelMinimized] = useState(false);

  const fetchSubmissions = async (params = { page: 1, limit: 10 }) => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await axios.get(API_BASE, { params });
      if (res.data && res.data.data) {
        setSubmissions(res.data.data);
        setSubmissionMeta(res.data.meta || { page: 1, limit: 10, total: res.data.data.length, totalPages: 1 });
      }
    } catch (err) {
      showMsg('Không thể tải danh sách bài chấm', 'error');
    } finally {
      setLoading(false);
    }
  };

  const runSyncItems = async items => {
    setSyncPanelOpen(true);
    setSyncPanelMinimized(false);
    setSyncJob({ status: 'running', items });
    let refreshed = false;
    for (const target of items) {
      setSyncJob(current => ({ ...current, items: current.items.map(item => item.keycode === target.keycode ? { ...item, status: 'syncing', message: 'Đang kết nối IIG Elearning…' } : item) }));
      try {
        await axios.post(`${API_BASE}/sync`, { keycode: target.keycode });
        refreshed = true;
        setSyncJob(current => ({ ...current, items: current.items.map(item => item.keycode === target.keycode ? { ...item, status: 'success', message: 'Đã cập nhật bài thi mới nhất' } : item) }));
      } catch (error) {
        const syncError = error.response?.data?.error || 'Không thể đồng bộ bài thi.';
        setSyncJob(current => ({ ...current, items: current.items.map(item => item.keycode === target.keycode ? { ...item, status: 'error', message: syncError } : item) }));
      }
    }
    setSyncJob(current => ({ ...current, status: 'completed' }));
    if (refreshed) await fetchSubmissions();
  };

  const startSubmissionSync = keycodes => runSyncItems(keycodes.map(keycode => ({ keycode, status: 'queued', message: 'Chờ đồng bộ' })));
  const retrySubmissionSync = keycode => runSyncItems([{ keycode, status: 'queued', message: 'Chờ thử lại' }]);

  useEffect(() => {
    if (currentUser) fetchSubmissions();
  }, [currentUser]);

  const filteredSubmissions = submissions.filter(sub => {
    const matchSearch = (sub.student_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (sub.keycode || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'all' ? true : String(sub.status) === String(statusFilter);
    return matchSearch && matchStatus;
  });

  // Mappings Data
  const [mappings, setMappings] = useState([]);
  const [mappingMeta, setMappingMeta] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [searchMapping, setSearchMapping] = useState('');
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const [mappingForm, setMappingForm] = useState({ keycode: '', course_scoring_id: '', student_name: '', test_name: '' });

  const fetchMappings = async (params = { page: 1, limit: 10 }) => {
    if (!hasPermission('mappings.view')) return;
    setLoadingMappings(true);
    try {
      const res = await axios.get(`${API_BASE}/mappings`, { params });
      if (res.data && res.data.success) {
        setMappings(res.data.data);
        setMappingMeta(res.data.meta || { page: 1, limit: 10, total: res.data.data.length, totalPages: 1 });
      }
    } catch (err) {
      console.error('Fetch Mappings Error:', err);
    } finally {
      setLoadingMappings(false);
    }
  };

  useEffect(() => {
    if (hasPermission('mappings.view')) fetchMappings();
  }, [currentUser]);

  const filteredMappings = mappings.filter(m =>
    (m.keycode || '').toLowerCase().includes(searchMapping.toLowerCase()) ||
    (m.course_scoring_id || '').toLowerCase().includes(searchMapping.toLowerCase()) ||
    (m.student_name || '').toLowerCase().includes(searchMapping.toLowerCase())
  );

  // Sync Batch Mappings
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const handleSyncAllMappings = async () => {
    setSyncAllLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/sync-mappings`, { pageSize: 1000 });
      if (res.data && res.data.success) {
        showMsg(`Đồng bộ thành công ${res.data.count || 0} cặp Keycode!`, 'success');
        fetchMappings();
      } else {
        showMsg('Đồng bộ thất bại: ' + res.data.error, 'error');
      }
    } catch (err) {
      showMsg('Lỗi hệ thống khi đồng bộ hàng loạt', 'error');
    } finally {
      setSyncAllLoading(false);
    }
  };

  // Sync Keycode Single Modal
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncKeycode, setSyncKeycode] = useState('');
  const [syncing, setSyncing] = useState(false);

  const handleSyncKeycode = async () => {
    if (!syncKeycode.trim()) return showMsg('Vui lòng nhập Keycode!', 'error');
    setSyncing(true);
    try {
      const res = await axios.post(`${API_BASE}/sync`, { keycode: syncKeycode.trim() });
      if (res.data && res.data.success) {
        showMsg('Đồng bộ thành công bài làm!', 'success');
        setShowSyncModal(false);
        setSyncKeycode('');
        fetchSubmissions();
      } else {
        showMsg('Lỗi đồng bộ: ' + (res.data.error || 'Không tìm thấy bài'), 'error');
      }
    } catch (err) {
      showMsg(err.response?.data?.error || 'Lỗi mạng khi đồng bộ', 'error');
    } finally {
      setSyncing(false);
    }
  };

  // AI Config Agents Data
  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [agentForm, setAgentForm] = useState({ name: '', description: '', api_endpoint: '', api_key: '', api_type: 'Grading', stt_target: 'student_answer', target_questions: [] });

  const fetchAgents = async () => {
    if (!hasPermission('agents.view')) return;
    setLoadingAgents(true);
    try {
      const res = await axios.get('/api/agents');
      if (res.data && res.data.success) {
        setAgents(res.data.data || []);
      }
    } catch (err) {
      console.error('Fetch Agents Error:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    if (hasPermission('agents.view')) fetchAgents();
  }, [currentUser]);

  // User Management Data
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ username: '', password: '', role: 'user' });

  const fetchUsers = async () => {
    if (!hasPermission('users.view')) return;
    setLoadingUsers(true);
    try {
      const res = await axios.get(`${AUTH_BASE}/users`);
      if (res.data && res.data.success) {
        setUsers(res.data.users);
      }
    } catch (err) {
      console.error('Fetch Users Error:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    if (hasPermission('users.view')) fetchUsers();
  }, [currentUser]);

  const getStatusBadge = (status) => {
    switch (String(status)) {
      case '1':
      case 'pending':
        return <span className="status-badge pending"><Clock size={12}/> Chưa chấm</span>;
      case '2':
      case 'grading':
        return <span className="status-badge grading"><RefreshCw size={12} className="spin"/> Đang chấm</span>;
      case '3':
      case 'graded':
        return <span className="status-badge graded"><CheckCircle size={12}/> Đã chấm</span>;
      case '4':
      case 'error':
        return <span className="status-badge error"><AlertTriangle size={12}/> Lỗi</span>;
      default:
        return <span className="status-badge pending">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--background)' }}>
      {message && (
        <div className={`toast ${message.type}`}>
          {message.text}
        </div>
      )}

      {authChecking ? (
        <div className="auth-loading"><div className="auth-loading-mark">IIG</div><span>Đang xác thực phiên làm việc…</span></div>
      ) : !currentUser ? (
        <Routes>
          <Route path="/login" element={
            <LoginPage
              particles={particles}
              message={message}
              handleLogin={handleLogin}
              loginUser={loginUser}
              setLoginUser={setLoginUser}
              loginPass={loginPass}
              setLoginPass={setLoginPass}
              showLoginPassword={showLoginPassword}
              setShowLoginPassword={setShowLoginPassword}
            />
          } />
          <Route path="/forgot-password" element={<LoginPage message={message} />} />
          <Route path="/reset-password" element={<LoginPage message={message} />} />
          <Route path="/setup-password" element={<LoginPage message={message} />} />
          <Route path="*" element={(()=>{const returnTo=`${location.pathname}${location.search}`;sessionStorage.setItem('auth_return_to',returnTo);return <Navigate to="/login" replace state={{from:returnTo}}/>;})()} />
        </Routes>
      ) : (
        <>
          <Sidebar
            sidebarCollapsed={sidebarCollapsed}
            toggleSidebar={toggleSidebar}
            activeTab={activeTab}
            navigate={navigate}
            currentUser={currentUser}
            handleLogout={handleLogout}
          />

          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <Routes>
              <Route path="/submissions" element={
                hasPermission('submissions.view') ? <SubmissionListPage
                  submissions={submissions}
                  meta={submissionMeta}
                  loading={loading}
                  filteredSubmissions={filteredSubmissions}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  getStatusBadge={getStatusBadge}
                  navigate={navigate}
                  onRefresh={fetchSubmissions}
                  onStartSync={startSubmissionSync}
                  currentUser={currentUser}
                /> : <Navigate to="/change-password" replace />
              } />

              <Route path="/submissions/:id" element={
                hasPermission('submissions.view') ? <SubmissionDetailPage
                  showMsg={showMsg}
                  getStatusBadge={getStatusBadge}
                  addLiveLog={addLiveLog}
                  currentUser={currentUser}
                /> : <Navigate to="/change-password" replace />
              } />

              <Route path="/mappings" element={
                hasPermission('mappings.view') ? (
                  <MappingKeycodePage
                    mappings={mappings}
                    meta={mappingMeta}
                    loadingMappings={loadingMappings}
                    onRefresh={fetchMappings}
                    showMsg={showMsg}
                    currentUser={currentUser}
                  />
                ) : <Navigate to="/submissions" replace />
              } />

              <Route path="/ai" element={
                hasPermission('agents.view') ? (
                  <AIConfigPage showMsg={showMsg} />
                ) : <Navigate to="/submissions" replace />
              } />

              <Route path="/users" element={
                hasPermission('users.view') ? (
                  <UserManagementPage
                    currentUser={currentUser}
                    showMsg={showMsg}
                  />
                ) : <Navigate to="/submissions" replace />
              } />

              <Route path="/roles" element={
                hasPermission('roles.view') ? <RoleManagementPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />

              <Route path="/local-tts" element={hasPermission('audio.view') ? <LocalTTSStudio /> : <Navigate to="/submissions" replace />} />
              <Route path="/key-vocab" element={['key_vocab.view','key_vocab.generate','key_vocab.manage'].some(hasPermission) ? <KeyVocabPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />} />

              <Route path="/change-password" element={<ChangePasswordPage onChanged={handleLogout} showMsg={showMsg} />} />

              <Route path="/logs" element={
                hasPermission('logs.view') ? <LogsConsolePage liveLogs={liveLogs} setLiveLogs={setLiveLogs} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />

              <Route path="/reports/kpi" element={
                ['reports.view','reports.forms.view','reports.entry','reports.review','reports.assign','reports.publish','reports.manage'].some(hasPermission) ? <KpiReportPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/reports/kpi/input" element={
                hasPermission('reports.view') ? <Navigate to="/reports/manage" replace /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/reports/manage" element={
                ['reports.forms.view','reports.entry','reports.review','reports.assign','reports.publish','reports.manage'].some(hasPermission) ? <ReportPeriodManagementPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/reports/manage/:periodId" element={
                ['reports.forms.view','reports.entry','reports.review','reports.assign','reports.publish','reports.manage'].some(hasPermission) ? <ManualReportPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/reports/manage/:periodId/:teamCode" element={
                ['reports.forms.view','reports.entry','reports.review','reports.assign','reports.publish','reports.manage'].some(hasPermission) ? <ManualReportPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/reports/kpi-config" element={
                hasPermission('reports.manage') ? <KpiConfigurationPage showMsg={showMsg} /> : <Navigate to="/reports/manage" replace />
              } />
              <Route path="/expenses/imports" element={
                ['expenses.view','expenses.import','expenses.manage'].some(hasPermission) ? <BankStatementImportsPage currentUser={currentUser} showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/expenses/transactions" element={
                ['expenses.view','expenses.manage'].some(hasPermission) ? <BankTransactionsPage showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />
              <Route path="/expenses/dashboard" element={
                ['expenses.view','expenses.manage'].some(hasPermission) ? <ExpenseDashboardPage showMsg={showMsg} /> : <Navigate to="/submissions" replace />
              } />

              <Route path="/" element={<Navigate to="/submissions" replace />} />
              <Route path="*" element={<Navigate to="/submissions" replace />} />
            </Routes>
          </main>
          <BulkSyncPanel
            job={syncJob}
            open={syncPanelOpen}
            minimized={syncPanelMinimized}
            onMinimize={() => { setSyncPanelOpen(value => !value); setSyncPanelMinimized(value => !value); }}
            onClose={() => { setSyncPanelOpen(false); setSyncPanelMinimized(false); setSyncJob(null); }}
            onRetry={retrySubmissionSync}
          />
        </>
      )}
    </div>
  );
}

export default App;
