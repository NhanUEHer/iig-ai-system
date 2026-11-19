import React, { useState } from 'react';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { Button, Modal } from '../../../design-system-v2';
import './SecureLectureDialogs.css';

const dateTime = value => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));

export default function ShareCreatedDialog({ result, showMsg, onClose }) {
  const [copied, setCopied] = useState(false);
  const share = result?.share;
  const copy = async () => {
    try { await navigator.clipboard.writeText(result.url); setCopied(true); showMsg?.('Đã copy', 'success'); }
    catch { showMsg?.('Không thể copy tự động. Hãy chọn và sao chép link.', 'error'); }
  };
  return <Modal open={Boolean(result)} title="Link chia sẻ" size="md" onClose={onClose} footer={<Button onClick={onClose}>Xong</Button>}>
    <div className="sl-created-dialog">
      <span className="sl-created-check"><Check /></span>
      <strong>Đã tạo link cho {share?.recipientName}</strong>
      <small>Hết hạn {share?.expiresAt ? dateTime(share.expiresAt) : '—'} · {share?.maxDevices} thiết bị · {share?.maxConcurrent} cùng lúc</small>
      <div className="sl-created-url"><input readOnly value={result?.url || ''} onFocus={event => event.target.select()} /><Button icon={copied ? <Check /> : <Copy />} onClick={copy}>{copied ? 'Đã copy' : 'Copy'}</Button></div>
      <div className="sl-created-warning"><TriangleAlert /><span>Link chỉ hiện đầy đủ <b>một lần</b>. Đóng hộp thoại là không xem lại được; nếu mất, thu hồi và tạo link mới.</span></div>
    </div>
  </Modal>;
}
