import React, { useEffect, useState } from 'react';
import { Button, FormField, Input, Modal, Select, Switch } from '../../../../design-system-v2';

const initialForm = team => ({ rowCode: '', rowName: '', rowGroup: '', sectionKey: team === 'ADS' ? 'traffic' : 'primary', isRequired: false, isActive: true });

export default function DetailRowEditorModal({ item, team, masterData, open, busy, onClose, onSave }) {
  const [form, setForm] = useState(initialForm(team));
  useEffect(() => {
    setForm(item ? { rowCode: item.row_code, rowName: item.row_name, rowGroup: item.row_group || '', sectionKey: item.section_key || 'primary', isRequired: item.is_required, isActive: item.is_active } : initialForm(team));
  }, [item, open, team]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value, ...(key === 'sectionKey' && value !== 'products' ? { rowGroup: '' } : {}) }));
  const needsGroup = team === 'REV' || (team === 'ADS' && form.sectionKey === 'products');
  const submit = async event => { event.preventDefault(); if (await onSave(item, form)) onClose(); };
  return <Modal open={open} title={item ? `Chỉnh sửa ${item.row_code}` : 'Thêm dòng mẫu'} description="Dòng dữ liệu chi tiết dùng khi tạo kỳ báo cáo mới." onClose={busy ? undefined : onClose} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button type="submit" form="detail-row-editor-form" loading={busy}>Lưu dòng</Button></>}>
    <form id="detail-row-editor-form" className="kpi-config-form" onSubmit={submit}>
      <FormField label="Tên dòng" required><Input autoFocus required value={form.rowName} onChange={event => update('rowName', event.target.value)} placeholder="Nhập tên dòng" /></FormField>
      <div className="kpi-config-form__grid">
        <FormField label="Mã dòng" required><Input required disabled={Boolean(item)} value={form.rowCode} onChange={event => update('rowCode', event.target.value.toUpperCase())} placeholder="Ví dụ: REV_TOEIC_LR" /></FormField>
        {team === 'ADS' && <FormField label="Khối chi tiết"><Select value={form.sectionKey} onChange={event => update('sectionKey', event.target.value)}><option value="traffic">Chi tiết theo nguồn Traffic</option><option value="products">Tỷ trọng Ads theo sản phẩm</option></Select></FormField>}
        {needsGroup && <FormField label="Nhóm sản phẩm" required><Select required value={form.rowGroup} onChange={event => update('rowGroup', event.target.value)}><option value="">Chọn nhóm sản phẩm</option>{(masterData.product_group || []).map(option => <option key={option.code} value={option.label}>{option.label}</option>)}</Select></FormField>}
      </div>
      <div className="kpi-config-form__switches"><Switch label="Bắt buộc" description="Yêu cầu nhập dòng này trong báo cáo." checked={form.isRequired} onChange={event => update('isRequired', event.target.checked)} />{item && <Switch label="Đang sử dụng" description="Hiển thị trong kỳ báo cáo mới." checked={form.isActive} onChange={event => update('isActive', event.target.checked)} />}</div>
    </form>
  </Modal>;
}
