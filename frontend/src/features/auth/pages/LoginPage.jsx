import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, BarChart3, BookOpenText, Check, Eye, EyeOff, Headphones, KeyRound, LogIn, Mail, Search, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
import './LoginPage.css';
import './LoginRefinements.css';

const tools = [
  { icon: Sparkles, label: 'AI Scoring', tone: 'blue' },
  { icon: Headphones, label: 'Audio Studio', tone: 'violet' },
  { icon: WandSparkles, label: 'Question Gen', tone: 'amber' },
  { icon: BookOpenText, label: 'Lesson Content', tone: 'green' },
  { icon: Search, label: 'Tra cứu', tone: 'cyan' },
  { icon: BarChart3, label: 'Báo cáo', tone: 'rose' }
];

export default function LoginPage(props) {
  const location = useLocation();
  const navigate = useNavigate();
  const isForgot = location.pathname === '/forgot-password';
  const isPasswordAction = ['/reset-password', '/setup-password'].includes(location.pathname);
  const isSetup = location.pathname === '/setup-password';
  const [email, setEmail] = useState(props.loginUser || '');
  const [password, setPassword] = useState(props.loginPass || '');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const token = new URLSearchParams(location.search).get('token');
  const passwordChecks = [
    { label: 'Ít nhất 10 ký tự', valid: password.length >= 10 },
    { label: 'Có ít nhất một chữ cái', valid: /[a-z]/i.test(password) },
    { label: 'Có ít nhất một chữ số', valid: /\d/.test(password) }
  ];

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (isForgot) {
        const response = await axios.post('/api/auth/forgot-password', { email });
        setNotice({ type: 'success', text: response.data.message });
      } else if (isPasswordAction) {
        if (password !== confirmPassword) throw new Error('Mật khẩu xác nhận chưa khớp.');
        if (!token) throw new Error('Liên kết không hợp lệ hoặc bị thiếu mã xác thực.');
        await axios.post('/api/auth/reset-password', { token, password });
        setNotice({ type: 'success', text: 'Đã thiết lập mật khẩu. Đang chuyển về đăng nhập…' });
        setTimeout(() => navigate('/login'), 1200);
      } else {
        props.setLoginUser?.(email);
        props.setLoginPass?.(password);
        await props.handleLogin?.({ preventDefault() {} }, { email, password });
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.response?.data?.error || error.message || 'Không thể thực hiện yêu cầu.' });
    } finally {
      setBusy(false);
    }
  };

  const title = isForgot ? 'Khôi phục mật khẩu'
    : isPasswordAction ? (isSetup ? 'Thiết lập tài khoản' : 'Đặt lại mật khẩu')
      : 'Chào mừng trở lại';
  const subtitle = isForgot
    ? 'Nhập email để nhận liên kết đặt lại mật khẩu.'
    : isPasswordAction
      ? 'Tạo mật khẩu mới gồm ít nhất 10 ký tự, có cả chữ và số.'
      : 'Đăng nhập để tiếp tục vào không gian làm việc của bạn.';

  return (
    <div className="workspace-login">
      <section className="workspace-story">
        <div className="workspace-glow workspace-glow-one" />
        <div className="workspace-glow workspace-glow-two" />
        <header className="workspace-brand">
          <div className="workspace-logo"><img src="/IIG_logo.webp" alt="IIG Vietnam" /></div>
          <div><strong>IIG Workspace</strong><span>Operations & AI Platform</span></div>
        </header>

        <div className="workspace-copy">
          <span className="workspace-eyebrow"><ShieldCheck size={15} /> Một nền tảng, mọi công cụ</span>
          <h1>Một không gian.<br />Mọi công cụ cần thiết.</h1>
          <p>Cổng công cụ nội bộ dành cho đội ngũ IIG — từ AI, nội dung và âm thanh đến tra cứu dữ liệu và báo cáo vận hành.</p>
          <div className="workspace-tool-grid">
            {tools.map(({ icon: Icon, label, tone }) => (
              <div className={`workspace-tool ${tone}`} key={label}><Icon size={19} /><span>{label}</span></div>
            ))}
          </div>
        </div>

        <footer className="workspace-story-footer">
          IIG Viet Nam Digital Product Department © 2026
        </footer>
      </section>

      <section className="workspace-auth-panel">
        <div className="workspace-auth-card">
          <div className="workspace-mobile-brand"><div className="workspace-logo"><img src="/IIG_logo.webp" alt="IIG" /></div><strong>IIG Workspace</strong></div>
          {(isForgot || isPasswordAction) && (
            <button className="workspace-back" type="button" onClick={() => navigate('/login')}><ArrowLeft size={16} /> Quay lại đăng nhập</button>
          )}
          <div className="workspace-auth-heading"><h2>{title}</h2><p>{subtitle}</p></div>

          {isForgot && <div className="workspace-action-icon"><Mail size={22} /></div>}
          {isPasswordAction && <div className="workspace-action-icon"><KeyRound size={22} /></div>}

          {isPasswordAction && !token && (
            <div className="workspace-alert error">Liên kết không hợp lệ hoặc bị thiếu mã xác thực. Vui lòng yêu cầu một email mới.</div>
          )}

          {(notice || props.message) && (
            <div className={`workspace-alert ${(notice || props.message).type}`}>{(notice || props.message).text}</div>
          )}

          <form onSubmit={submit} className="workspace-auth-form">
            {!isPasswordAction && (
              <label><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="tenban@iigvietnam.com" autoComplete="email" required autoFocus /></label>
            )}
            {!isForgot && (
              <label><span>{isPasswordAction ? 'Mật khẩu mới' : 'Mật khẩu'}</span><div className="workspace-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu" autoComplete={isPasswordAction ? 'new-password' : 'current-password'} required /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            )}
            {isPasswordAction && (
              <>
                <div className="workspace-password-rules">
                  {passwordChecks.map(item => <span className={item.valid ? 'valid' : ''} key={item.label}><Check size={13} />{item.label}</span>)}
                </div>
                <label><span>Xác nhận mật khẩu mới</span><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu" autoComplete="new-password" required /></label>
              </>
            )}
            {!isForgot && !isPasswordAction && <button className="workspace-forgot" type="button" onClick={() => navigate('/forgot-password')}>Quên mật khẩu?</button>}
            <button className="workspace-submit" type="submit" disabled={busy || (isPasswordAction && !token)}>{busy ? <span className="workspace-spinner" /> : <LogIn size={18} />}{busy ? 'Đang xử lý…' : isForgot ? 'Gửi email khôi phục' : isSetup ? 'Kích hoạt tài khoản' : isPasswordAction ? 'Đặt lại mật khẩu' : 'Đăng nhập'}</button>
          </form>

          <p className="workspace-copyright">© 2026 IIG Vietnam. Internal use only.</p>
        </div>
      </section>
    </div>
  );
}
