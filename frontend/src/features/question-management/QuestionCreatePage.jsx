import React, { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Breadcrumb, Button, FormField, Input, Textarea } from '../../components/ui';
import MultiSelectFilter from '../../components/ui/MultiSelectFilter';
import { createQuestion, listQuestionGroups } from '../../services/questionBankService';
import { apiError, QUESTION_TYPES } from './constants';
import './question-management.css';

export default function QuestionCreatePage({ navigate, showMsg }) {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ questionName: '', groupId: '', questionType: 'MCQ_SINGLE', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { listQuestionGroups().then(response => setGroups(response.data || [])).catch(error => setError(apiError(error, 'Không thể tải nhóm câu hỏi.'))); }, []);
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault(); setError('');
    if (!form.questionName.trim() || !form.groupId) { setError('Vui lòng nhập tên và chọn nhóm câu hỏi.'); return; }
    try {
      setSaving(true);
      const response = await createQuestion(form);
      showMsg?.('Đã tạo câu hỏi. Hãy tiếp tục nhập nội dung và câu hỏi con.', 'success');
      navigate(`/question-bank/${response.data.id}/edit`);
    } catch (requestError) { setError(apiError(requestError, 'Không thể tạo câu hỏi.')); }
    finally { setSaving(false); }
  };
  return <section className="qm-editor-page">
    <header className="qm-editor-topbar"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Ngân hàng câu hỏi' }, { label: 'Tạo câu hỏi', current: true }]} /></header>
    <main className="qm-editor-main qm-create-main"><form className="qm-form-card qm-create-card" onSubmit={submit}>
      <header className="qm-card-header"><div><h1>Thông tin câu hỏi</h1><span className="qm-status is-draft"><i />Bản nháp</span></div><small>Các trường có dấu <b>*</b> là bắt buộc</small></header>
      <div className="qm-card-body">
        <div className="qm-create-grid qm-create-grid--primary">
          <FormField id="qm-name" label="Tên câu hỏi" required><Input id="qm-name" size="sm" value={form.questionName} maxLength={240} onChange={event => set('questionName', event.target.value)} placeholder="Nhập tên câu hỏi (ví dụ: TOEIC P5 - Câu 101...)" autoFocus /></FormField>
          <FormField id="qm-create-status" label="Trạng thái ban đầu"><MultiSelectFilter single disabled className="qm-single-select qm-status-select" value="DRAFT" options={[{ value: 'DRAFT', label: 'Bản nháp' }]} placeholder="Bản nháp" /></FormField>
        </div>
        <div className="qm-create-grid">
          <FormField id="qm-group" label="Nhóm câu hỏi" required><MultiSelectFilter single className="qm-single-select qm-group-select" value={form.groupId} onApply={value => set('groupId', value)} options={groups.map(group => ({ value: group.id, label: group.name }))} placeholder="Chọn nhóm câu hỏi" searchPlaceholder="Tìm nhóm câu hỏi..." /></FormField>
          <FormField id="qm-type" label="Dạng câu hỏi" required><MultiSelectFilter single className="qm-single-select qm-type-select" value={form.questionType} onApply={value => set('questionType', value)} options={QUESTION_TYPES} placeholder="Chọn dạng câu hỏi" searchPlaceholder="Tìm dạng câu hỏi..." /></FormField>
        </div>
        <FormField id="qm-note" label="Ghi chú nội bộ" hint={`${form.note.length}/500 ký tự`}><Textarea id="qm-note" value={form.note} rows={4} maxLength={500} onChange={event => set('note', event.target.value)} placeholder="Nhập ghi chú nội bộ..." /></FormField>
        {error && <p className="qm-form-error" role="alert">{error}</p>}
      </div>
      <footer className="qm-form-footer"><Button type="button" size="sm" variant="secondary" onClick={() => navigate('/question-bank')}>Hủy</Button><Button type="submit" size="sm" icon={<Check />} loading={saving}>Tạo câu hỏi</Button></footer>
    </form></main>
  </section>;
}
