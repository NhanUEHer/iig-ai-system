import React, { useEffect, useState } from 'react';
import { Alert, Button, FormField, Input, Modal, Select } from '../../../../design-system-v2';
import { EVALUATION_DIRECTIONS, KPI_FORMULAS } from '../constants';

const emptyForm = { name: '', unit: '', evaluationDirection: 'increase_good', inputMode: 'manual', formulaCode: '' };

export default function KpiEditorModal({ item, team, masterData, open, busy, onClose, onSave }) {
  const [form, setForm] = useState(emptyForm);
  useEffect(() => {
    setForm(item ? { name: item.name, unit: item.unit, evaluationDirection: item.evaluation_direction, inputMode: item.input_mode || 'manual', formulaCode: item.formula_code || '' } : emptyForm);
  }, [item, open]);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value, ...(key === 'inputMode' && value === 'manual' ? { formulaCode: '' } : {}) }));
  const submit = async event => { event.preventDefault(); if (await onSave(item, form)) onClose(); };
  return <Modal open={open} title={item ? `Chỉnh sửa ${item.code}` : 'Tạo chỉ số KPI'} description="Cấu hình áp dụng cho các kỳ báo cáo được tạo mới." onClose={busy ? undefined : onClose} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>Hủy</Button><Button type="submit" form="kpi-editor-form" loading={busy}>Lưu cấu hình</Button></>}>
    <form id="kpi-editor-form" className="kpi-config-form" onSubmit={submit}>
      {!item && <Alert tone="success" compact title="Mã KPI được hệ thống tự sinh">Mã được tạo theo bộ phận đang chọn.</Alert>}
      <FormField label="Tên KPI" required><Input autoFocus required maxLength="255" value={form.name} onChange={event => update('name', event.target.value)} placeholder="Nhập tên chỉ số" /></FormField>
      <div className="kpi-config-form__grid">
        <FormField label="Đơn vị" required><Select required value={form.unit} onChange={event => update('unit', event.target.value)}><option value="">Chọn đơn vị</option>{(masterData.unit || []).map(option => <option key={option.code} value={option.label}>{option.label}</option>)}</Select></FormField>
        <FormField label="Chiều đánh giá"><Select value={form.evaluationDirection} onChange={event => update('evaluationDirection', event.target.value)}>{EVALUATION_DIRECTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></FormField>
        <FormField label="Nguồn dữ liệu"><Select value={form.inputMode} onChange={event => update('inputMode', event.target.value)}><option value="manual">Nhập tay</option><option value="derived" disabled={!KPI_FORMULAS[team]?.length}>Công thức từ chi tiết</option></Select></FormField>
        {form.inputMode === 'derived' && <FormField label="Công thức" required><Select required value={form.formulaCode} onChange={event => update('formulaCode', event.target.value)}><option value="">Chọn công thức</option>{(KPI_FORMULAS[team] || []).map(code => <option key={code} value={code}>{code}</option>)}</Select></FormField>}
      </div>
    </form>
  </Modal>;
}
