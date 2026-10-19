import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Info, ListChecks, Settings2 } from 'lucide-react';
import { Breadcrumb } from '../../../components/ui/Layout';
import Button from '../../../components/ui/Button';
import { FormField, Input, Textarea } from '../../../components/ui/FormField';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { createScoreScale, getScoreScale, updateScoreScale, updateScoreScaleStatus } from '../../../services/scoreScaleService';
import './ScoreScaleCreatePage.css';
import './ScoreScaleCreatePageOverrides.css';

const initialForm = { name: '', status: 'DRAFT', questionCount: '', minScore: '', maxScore: '', scoreStep: '', description: '' };
const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Bản nháp' },
  { value: 'ACTIVE', label: 'Đang sử dụng' },
  { value: 'INACTIVE', label: 'Ngừng sử dụng' },
];
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(option => [option.value, option.label]));
const makeRows = (count, previous = []) => Array.from({ length: Math.max(0, Number(count) || 0) + 1 }, (_, correctCount) => ({
  correctCount,
  convertedScore: previous.find(row => row.correctCount === correctCount)?.convertedScore ?? '',
}));

function validateInfo(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Vui lòng nhập tên thang điểm.';
  if (form.questionCount === '' || !Number.isInteger(Number(form.questionCount)) || Number(form.questionCount) <= 0) errors.questionCount = 'Số câu hỏi phải là số nguyên dương.';
  if (form.minScore === '' || !Number.isFinite(Number(form.minScore)) || Number(form.minScore) < 0) errors.minScore = 'Vui lòng nhập điểm tối thiểu hợp lệ.';
  if (form.maxScore === '' || !Number.isFinite(Number(form.maxScore)) || Number(form.maxScore) < Number(form.minScore)) errors.maxScore = 'Điểm tối đa phải lớn hơn hoặc bằng điểm tối thiểu.';
  if (form.scoreStep === '' || !Number.isFinite(Number(form.scoreStep)) || Number(form.scoreStep) <= 0) errors.scoreStep = 'Vui lòng nhập khoảng cách lớn hơn 0.';
  return errors;
}

function validateRanges(form, rows) {
  const invalidRow = rows.find(row => row.convertedScore === '' || !Number.isFinite(Number(row.convertedScore)) || Number(row.convertedScore) < Number(form.minScore) || Number(row.convertedScore) > Number(form.maxScore));
  if (invalidRow) return { ranges: `Vui lòng nhập điểm hợp lệ cho số câu đúng ${invalidRow.correctCount}.` };
  const decreasing = rows.find((row, index) => index > 0 && Number(row.convertedScore) < Number(rows[index - 1].convertedScore));
  if (decreasing) return { ranges: `Điểm của ${decreasing.correctCount} câu đúng không được thấp hơn dòng trước.` };
  if (Number(rows[0]?.convertedScore) !== Number(form.minScore) || Number(rows.at(-1)?.convertedScore) !== Number(form.maxScore)) {
    return { ranges: 'Điểm của 0 câu đúng phải bằng điểm tối thiểu và điểm của toàn bộ câu đúng phải bằng điểm tối đa.' };
  }
  return {};
}

export default function ScoreScaleCreatePage({ navigate, showMsg, scoreScaleId = '', canManage = true }) {
  const [form, setForm] = useState(initialForm);
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(Boolean(scoreScaleId));
  const [saving, setSaving] = useState(false);
  const [scaleId, setScaleId] = useState(scoreScaleId);
  const [persistedStatus, setPersistedStatus] = useState('DRAFT');
  const [activeTab, setActiveTab] = useState('information');
  const mappingRef = useRef(null);
  const editable = canManage && persistedStatus === 'DRAFT';
  const isEdit = Boolean(scoreScaleId);

  useEffect(() => {
    if (!scoreScaleId) return;
    let active = true;
    setLoading(true);
    getScoreScale(scoreScaleId)
      .then(detail => {
        if (!active) return;
        setForm({ name: detail.name || '', status: detail.status || 'DRAFT', questionCount: detail.questionCount ?? '', minScore: detail.minScore ?? '', maxScore: detail.maxScore ?? '', scoreStep: detail.scoreStep ?? '', description: detail.description || '' });
        setRows(makeRows(detail.questionCount, detail.rawRanges || []));
        setPersistedStatus(detail.status || 'DRAFT');
      })
      .catch(error => {
        showMsg?.(error.response?.data?.error || 'Không thể tải thông tin thang điểm.', 'error');
        navigate('/score-scales');
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [scoreScaleId]);

  useEffect(() => {
    if (!scaleId || activeTab !== 'mapping') return;
    const frame = window.requestAnimationFrame(() => mappingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [scaleId, activeTab]);

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '', ranges: key === 'minScore' || key === 'maxScore' ? '' : current.ranges }));
    if (key === 'questionCount' && Number.isInteger(Number(value)) && Number(value) > 0 && Number(value) <= 500) setRows(current => makeRows(value, current));
  };
  const setRowScore = (index, value) => {
    setRows(current => current.map((row, rowIndex) => rowIndex === index ? { ...row, convertedScore: value } : row));
    setErrors(current => ({ ...current, ranges: '' }));
  };
  const scoreRange = score => {
    if (score === '' || !Number.isFinite(Number(score))) return '—';
    const from = Number(score); const to = Math.min(Number(form.maxScore), from + Number(form.scoreStep || 0));
    return `${from.toLocaleString('vi-VN')} – ${to.toLocaleString('vi-VN')}`;
  };
  const completed = useMemo(() => rows.filter(row => row.convertedScore !== '' && Number.isFinite(Number(row.convertedScore))).length, [rows]);
  const save = async event => {
    event.preventDefault(); if (saving || !editable) return;
    const nextErrors = { ...validateInfo(form), ...(activeTab === 'mapping' ? validateRanges(form, rows) : {}) }; setErrors(nextErrors);
    if (Object.keys(nextErrors).length) { showMsg?.('Vui lòng kiểm tra lại thông tin thang điểm.', 'error'); return; }
    setSaving(true);
    try {
      const basePayload = { name: form.name.trim(), questionCount: Number(form.questionCount), minScore: Number(form.minScore), maxScore: Number(form.maxScore), scoreStep: Number(form.scoreStep), description: form.description.trim() };
      if (!scaleId) {
        const created = await createScoreScale(basePayload);
        setScaleId(created.id);
        setRows(makeRows(form.questionCount));
        setActiveTab('mapping');
        showMsg?.('Đã lưu thông tin chung. Vui lòng thiết lập chi tiết thang điểm.', 'success');
      } else if (activeTab === 'information') {
        await updateScoreScale(scaleId, basePayload);
        setRows(current => makeRows(form.questionCount, current));
        setActiveTab('mapping');
        showMsg?.('Đã cập nhật thông tin chung.', 'success');
      } else {
        await updateScoreScale(scaleId, { ...basePayload, rawRanges: rows.map(row => ({ correctCount: row.correctCount, convertedScore: Number(row.convertedScore) })) });
        if (form.status !== 'DRAFT') await updateScoreScaleStatus(scaleId, form.status);
        showMsg?.('Đã lưu chi tiết thang điểm.', 'success');
        navigate('/score-scales');
      }
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể lưu thang điểm.', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <section className="score-scale-create-page"><main className="score-scale-create-main"><div className="score-scale-create-card score-scale-create-loading">Đang tải thông tin thang điểm...</div></main></section>;
  const pageTitle = isEdit ? (editable ? 'Chỉnh sửa thang điểm' : 'Chi tiết thang điểm') : 'Thêm mới thang điểm';
  return <section className="score-scale-create-page">
    <header className="score-scale-create-header"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Quản lý thang điểm' }, { label: pageTitle, current: true }]} /></header>
    <main className="score-scale-create-main"><form className="score-scale-create-card" onSubmit={save} noValidate>
      <header className="score-scale-create-card-header"><div><h1>{isEdit ? pageTitle : 'Thông tin thang điểm'}</h1><span className={`is-${form.status.toLowerCase()}`}><i />{STATUS_LABELS[form.status]}</span></div>{editable && <small>Các trường có dấu <b>*</b> là bắt buộc</small>}</header>
      <nav className="score-scale-create-tabs" aria-label="Thiết lập thang điểm">
        <button type="button" className={activeTab === 'information' ? 'is-active' : ''} onClick={() => setActiveTab('information')}><Settings2 />Thông tin chung{scaleId && <i>✓</i>}</button>
        <button type="button" className={activeTab === 'mapping' ? 'is-active' : ''} disabled={!scaleId} onClick={() => scaleId && setActiveTab('mapping')}><ListChecks />Chi tiết thang điểm<span>{scaleId ? `${completed}/${rows.length}` : 'Lưu thông tin trước'}</span></button>
      </nav>
      {activeTab === 'information' && <div className="score-scale-create-body">
        <div className="score-scale-create-row is-full">
          <FormField id="scale-name" label="Tên thang điểm" required error={errors.name}><Input id="scale-name" value={form.name} maxLength={255} disabled={!editable} onChange={event => update('name', event.target.value)} placeholder="Ví dụ: TOEIC Listening 100 câu" autoFocus /></FormField>
        </div>
        <div className="score-scale-create-row">
          <FormField id="scale-status" label="Trạng thái" required><MultiSelectFilter single disabled={!editable} className="score-scale-single-select" value={form.status} onApply={value => update('status', value)} options={STATUS_OPTIONS} placeholder="Chọn trạng thái" /></FormField>
          <FormField id="scale-type" label="Loại thang điểm"><MultiSelectFilter single disabled className="score-scale-single-select" value="LR_RAW_CORRECT" options={[{ value: 'LR_RAW_CORRECT', label: 'Theo số câu đúng (LR)' }]} placeholder="Theo số câu đúng (LR)" /></FormField>
        </div>
        <div className="score-scale-create-row">
          <FormField id="scale-question-count" label="Số câu hỏi" required error={errors.questionCount}><Input id="scale-question-count" type="number" min="1" max="500" value={form.questionCount} disabled={!editable} onChange={event => update('questionCount', event.target.value)} placeholder="Nhập số câu hỏi" /></FormField>
          <FormField id="scale-step" label="Khoảng cách dãy điểm" required error={errors.scoreStep}><Input id="scale-step" type="number" min="0.01" step="0.01" value={form.scoreStep} disabled={!editable} onChange={event => update('scoreStep', event.target.value)} placeholder="Nhập khoảng cách" /></FormField>
        </div>
        <div className="score-scale-create-row">
          <FormField id="scale-min" label="Điểm tối thiểu" required error={errors.minScore}><Input id="scale-min" type="number" min="0" step="0.01" value={form.minScore} disabled={!editable} onChange={event => update('minScore', event.target.value)} placeholder="Nhập điểm tối thiểu" /></FormField>
          <FormField id="scale-max" label="Điểm tối đa" required error={errors.maxScore}><Input id="scale-max" type="number" min="0" step="0.01" value={form.maxScore} disabled={!editable} onChange={event => update('maxScore', event.target.value)} placeholder="Nhập điểm tối đa" /></FormField>
        </div>
        <FormField id="scale-description" label="Mô tả"><Textarea id="scale-description" rows={3} maxLength={1000} value={form.description} disabled={!editable} onChange={event => update('description', event.target.value)} placeholder="Nhập mô tả hoặc ghi chú cho thang điểm..." /></FormField>
      </div>}
      {scaleId && activeTab === 'mapping' && <section className="score-scale-mapping" ref={mappingRef}>
        <header><div><h2>Chi tiết thang điểm</h2><p>{editable ? 'Nhập điểm chính xác tương ứng với từng số câu đúng.' : 'Điểm chính xác tương ứng với từng số câu đúng.'}</p></div><strong>{completed}/{rows.length} dòng đã nhập</strong></header>
        <div className="score-scale-mapping-note"><Info /><span>Dãy điểm được tính từ điểm chính xác đến điểm chính xác cộng khoảng cách, không vượt quá điểm tối đa.</span></div>
        <div className="score-scale-mapping-wrap"><table><thead><tr><th>Số câu đúng</th><th>Điểm chính xác</th><th>Dãy điểm</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.correctCount}><td><b>{row.correctCount}</b><small>/{form.questionCount}</small></td><td><Input type="number" min={form.minScore} max={form.maxScore} step="0.01" value={row.convertedScore} disabled={!editable} onChange={event => setRowScore(index, event.target.value)} placeholder="Nhập điểm" aria-label={`Điểm cho ${row.correctCount} câu đúng`} /></td><td><span>{scoreRange(row.convertedScore)}</span></td></tr>)}</tbody></table></div>
        {errors.ranges && <p className="score-scale-mapping-error" role="alert">{errors.ranges}</p>}
      </section>}
      <footer className="score-scale-create-footer"><Button type="button" size="sm" variant="secondary" onClick={() => navigate('/score-scales')}>{editable ? 'Hủy' : 'Quay lại'}</Button>{editable && <Button type="submit" size="sm" icon={<Check />} loading={saving}>{activeTab === 'mapping' ? 'Lưu chi tiết thang điểm' : 'Lưu và tiếp tục'}</Button>}</footer>
    </form></main>
  </section>;
}
