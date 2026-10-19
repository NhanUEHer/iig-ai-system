import { useState } from 'react';
import { BarChart3, BookOpenText, Eye, EyeOff, Headphones, LogIn, Search, ShieldCheck, Sparkles, WandSparkles } from 'lucide-react';
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
  const [email, setEmail] = useState(props.loginUser || '');
  const [password, setPassword] = useState(props.loginPass || '');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    try {
      props.setLoginUser?.(email);
      props.setLoginPass?.(password);
      await props.handleLogin?.({ preventDefault() {} }, { email, password });
    } finally {
      setBusy(false);
    }
  };

  const title = 'Chào mừng trở lại';
  const subtitle = 'Đăng nhập để tiếp tục vào không gian làm việc của bạn.';

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
          <div className="workspace-auth-heading"><h2>{title}</h2><p>{subtitle}</p></div>
          {props.message && (
            <div className={`workspace-alert ${props.message.type}`}>{props.message.text}</div>
          )}

          <form onSubmit={submit} className="workspace-auth-form">
            <label><span>Email</span><input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="tenban@iigvietnam.com" autoComplete="email" required autoFocus /></label>
            <label><span>Mật khẩu</span><div className="workspace-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="Nhập mật khẩu" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            <button className="workspace-submit" type="submit" disabled={busy}>{busy ? <span className="workspace-spinner" /> : <LogIn size={18} />}{busy ? 'Đang xử lý…' : 'Đăng nhập'}</button>
          </form>

          <p className="workspace-copyright">© 2026 IIG Vietnam. Internal use only.</p>
        </div>
      </section>
    </div>
  );
}
