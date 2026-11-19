import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button, Modal, Switch } from '../../../design-system-v2';
import { createSecureLectureShare, secureLectureError, updateSecureLectureShare } from '../../../services/secureLecturesApi';
import { createShareDefaults, toDateTimeLocal, validateShareForm } from '../shareForm';
import './SecureLectureDialogs.css';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function ShareDialog({ open, lecture, versions = [], share, showMsg, onClose, onSaved, onCreated }) {
  const [form, setForm] = useState(() => createShareDefaults());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const editing = Boolean(share);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(share ? {
      recipientName: share.recipientName || '', recipientEmail: share.recipientEmail || '',
      validFrom: toDateTimeLocal(share.validFrom), expiresAt: toDateTimeLocal(share.expiresAt),
      maxDevices: share.maxDevices, maxConcurrent: share.maxConcurrent,
      pinnedVersionId: share.pinnedVersionId || '', watermarkEnabled: share.watermarkEnabled,
      guardEnabled: share.guardEnabled,
    } : createShareDefaults());
  }, [open, share]);

  const currentVersion = useMemo(() => versions.find(item => item.id === lecture?.currentVersion?.id) || versions[0], [lecture, versions]);
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const setExpiryDays = days => set('expiresAt', toDateTimeLocal(new Date(new Date(form.validFrom).getTime() + days * DAY_MS)));
  const warning = editing && Number(form.maxDevices) < Number(share.deviceCount || 0);

  const save = async event => {
    event?.preventDefault();
    const nextErrors = validateShareForm(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setBusy(true);
    const input = {
      recipientName: form.recipientName.trim(), recipientEmail: form.recipientEmail.trim() || null,
      validFrom: new Date(form.validFrom).toISOString(), expiresAt: new Date(form.expiresAt).toISOString(),
      maxDevices: Number(form.maxDevices), maxConcurrent: Number(form.maxConcurrent),
      pinnedVersionId: form.pinnedVersionId || null,
      watermarkEnabled: form.watermarkEnabled, guardEnabled: form.guardEnabled,
    };
    try {
      if (editing) {
        const result = await updateSecureLectureShare(share.id, input);
        result.warnings?.forEach(item => showMsg?.(item.message, 'warning'));
        showMsg?.('Đã cập nhật link chia sẻ.', 'success');
        onSaved?.(result.share || result);
      } else {
        const result = await createSecureLectureShare(lecture.id, input);
        onCreated?.(result);
      }
    } catch (error) { showMsg?.(secureLectureError(error, 'Không thể lưu link chia sẻ.'), 'error'); }
    finally { setBusy(false); }
  };

  return <Modal open={open} title={editing ? 'Sửa link chia sẻ' : 'Tạo link chia sẻ'} size="md" onClose={busy ? undefined : onClose} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>Huỷ</Button><Button loading={busy} onClick={save}>{editing ? 'Lưu thay đổi' : 'Tạo link'}</Button></>}>
    <form className="sl-dialog-body sl-share-dialog" onSubmit={save}>
      <label className="sl-dialog-field"><span>Người nhận <small>(hiện trên watermark khi trình chiếu)</small></span><input autoFocus value={form.recipientName} onChange={event => set('recipientName', event.target.value)} />{errors.recipientName && <em>{errors.recipientName}</em>}</label>
      <label className="sl-dialog-field"><span>Email <small>(không bắt buộc, chỉ để ghi chú)</small></span><input type="email" value={form.recipientEmail} onChange={event => set('recipientEmail', event.target.value)} /></label>
      <div className="sl-share-grid">
        <label className="sl-dialog-field"><span>Bắt đầu</span><input type="datetime-local" value={form.validFrom} onChange={event => set('validFrom', event.target.value)} />{errors.validFrom && <em>{errors.validFrom}</em>}</label>
        <label className="sl-dialog-field"><span>Hết hạn</span><input type="datetime-local" value={form.expiresAt} onChange={event => set('expiresAt', event.target.value)} />{errors.expiresAt && <em>{errors.expiresAt}</em>}<small className="sl-share-quick">Nhanh: <button type="button" onClick={() => setExpiryDays(7)}>7 ngày</button> · <button type="button" onClick={() => setExpiryDays(30)}>30 ngày</button></small></label>
        <label className="sl-dialog-field"><span>Số thiết bị tối đa</span><input type="number" min="1" max="20" value={form.maxDevices} onChange={event => set('maxDevices', event.target.value)} /><small>Máy vượt giới hạn sẽ bị từ chối</small>{errors.maxDevices && <em>{errors.maxDevices}</em>}</label>
        <label className="sl-dialog-field"><span>Mở cùng lúc tối đa</span><input type="number" min="1" max="20" value={form.maxConcurrent} onChange={event => set('maxConcurrent', event.target.value)} /><small>Vượt thì giáo viên có thể đá máy cũ</small>{errors.maxConcurrent && <em>{errors.maxConcurrent}</em>}</label>
      </div>
      {warning && <div className="sl-share-warning"><AlertTriangle />Link đang có {share.deviceCount} thiết bị. Thiết bị mới sẽ bị chặn cho đến khi gỡ bớt.</div>}
      <label className="sl-dialog-field"><span>Phiên bản</span><select className="sl-folder-select" value={form.pinnedVersionId} onChange={event => set('pinnedVersionId', event.target.value)}><option value="">Luôn dùng bản mới nhất{currentVersion ? ` (v${currentVersion.versionNo})` : ''}</option>{versions.map(version => <option key={version.id} value={version.id}>Cố định v{version.versionNo} · {version.originalFilename}</option>)}</select></label>
      <div className="sl-share-switches">
        <Switch label="Watermark tên người nhận" description="Tên người nhận và thời điểm mở hiện mờ trên bài giảng" checked={form.watermarkEnabled} onChange={event => set('watermarkEnabled', event.target.checked)} />
        <Switch label="Chặn chuột phải, phím tắt, in, F12" description="Gây khó cho việc tải, xem mã nguồn hoặc in bài giảng" checked={form.guardEnabled} onChange={event => set('guardEnabled', event.target.checked)} />
      </div>
    </form>
  </Modal>;
}
