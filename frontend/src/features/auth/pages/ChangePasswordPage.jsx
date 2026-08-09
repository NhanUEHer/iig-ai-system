import { useMemo, useState } from 'react';
import axios from 'axios';
import { Check, Eye, EyeOff, KeyRound, LockKeyhole, LogOut, ShieldCheck } from 'lucide-react';
import './ChangePasswordPage.css';

export default function ChangePasswordPage({ onChanged, showMsg }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [visible, setVisible] = useState({ currentPassword: false, newPassword: false, confirmPassword: false });
  const [busy, setBusy] = useState(false);
  const rules = useMemo(() => [
    { label: 'Tối thiểu 10 ký tự', valid: form.newPassword.length >= 10 },
    { label: 'Có ít nhất một chữ cái', valid: /[A-Za-z]/.test(form.newPassword) },
    { label: 'Có ít nhất một chữ số', valid: /\d/.test(form.newPassword) },
    { label: 'Mật khẩu xác nhận khớp', valid: Boolean(form.confirmPassword) && form.newPassword === form.confirmPassword }
  ], [form.newPassword, form.confirmPassword]);
  const ready = Boolean(form.currentPassword) && rules.every(rule => rule.valid);

  const submit = async event => {
    event.preventDefault();
    if (!ready) return showMsg('Vui lòng hoàn thành đầy đủ yêu cầu mật khẩu.', 'error');
    setBusy(true);
    try {
      await axios.post('/api/auth/change-password', form);
      showMsg('Đổi mật khẩu thành công. Vui lòng đăng nhập lại.', 'success');
      setTimeout(onChanged, 700);
    } catch (error) { showMsg(error.response?.data?.error || 'Không thể đổi mật khẩu.', 'error'); }
    finally { setBusy(false); }
  };
  const passwordField = (label, key, placeholder) => <label className="password-field" key={key}><span>{label}</span><div><LockKeyhole /><input type={visible[key] ? 'text' : 'password'} value={form[key]} onChange={event => setForm({ ...form, [key]: event.target.value })} autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} placeholder={placeholder} required /><button type="button" aria-label={visible[key] ? `Ẩn ${label.toLowerCase()}` : `Hiện ${label.toLowerCase()}`} onClick={() => setVisible(current => ({ ...current, [key]: !current[key] }))}>{visible[key] ? <EyeOff /> : <Eye />}</button></div></label>;

  return <div className="change-password-page">
    <header className="change-password-heading"><span className="change-password-eyebrow">TÀI KHOẢN · BẢO MẬT</span><h1>Đổi mật khẩu</h1><p>Cập nhật mật khẩu định kỳ để bảo vệ tài khoản và dữ liệu nội bộ.</p></header>
    <div className="change-password-layout">
      <form className="change-password-card" onSubmit={submit}>
        <div className="change-password-card-head"><span><KeyRound /></span><div><h2>Thiết lập mật khẩu mới</h2><p>Nhập mật khẩu hiện tại để xác nhận danh tính.</p></div></div>
        {passwordField('Mật khẩu hiện tại', 'currentPassword', 'Nhập mật khẩu đang sử dụng')}
        <div className="password-divider" />
        {passwordField('Mật khẩu mới', 'newPassword', 'Nhập mật khẩu mới')}
        {passwordField('Xác nhận mật khẩu mới', 'confirmPassword', 'Nhập lại mật khẩu mới')}
        <div className="password-rules">{rules.map(rule => <span className={rule.valid ? 'valid' : ''} key={rule.label}><Check />{rule.label}</span>)}</div>
        <button className="btn-primary change-password-submit" disabled={busy || !ready}>{busy ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}</button>
      </form>
      <aside className="password-security-card"><span><ShieldCheck /></span><h2>Sau khi đổi mật khẩu</h2><ul><li><LogOut />Tất cả phiên đăng nhập hiện tại sẽ kết thúc.</li><li><KeyRound />Bạn cần đăng nhập lại bằng mật khẩu mới.</li><li><ShieldCheck />Token cũ sẽ bị thu hồi ngay lập tức.</li></ul><div><strong>Lưu ý bảo mật</strong><p>Không sử dụng lại mật khẩu email hoặc chia sẻ mật khẩu qua tin nhắn.</p></div></aside>
    </div>
  </div>;
}
