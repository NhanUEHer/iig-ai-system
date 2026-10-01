import React, { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import { createQuestion, listQuestionGroups } from '../../../services/questionBankService';
import './QuestionBankCreatePage.css';

const QUESTION_TYPES = [
  { value: 'MCQ_SINGLE', label: 'Trắc nghiệm đơn (MCQ)' },
  { value: 'RECORD', label: 'Thu âm / Nói (Record)' },
  { value: 'WRITING', label: 'Tự luận / Viết (Writing)' },
];

export default function QuestionBankCreatePage({ navigate, showMsg }) {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ questionName: '', groupId: '', questionType: 'MCQ_SINGLE', status: 'DRAFT', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listQuestionGroups().then(result => { if (active) setGroups(result.data || []); }).catch(() => { if (active) setError('Không thể tải danh sách nhóm câu hỏi.'); });
    return () => { active = false; };
  }, []);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    setError('');
    if (!form.questionName.trim() || !form.groupId) { setError('Vui lòng nhập tên câu hỏi và chọn nhóm câu hỏi.'); return; }
    try {
      setSaving(true);
      const result = await createQuestion(form);
      showMsg?.('Đã tạo câu hỏi chính. Tiếp tục thêm nội dung và câu hỏi con.', 'success');
      navigate(`/question-bank/${result.data.id}/edit`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không thể tạo câu hỏi.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="question-bank-create-page">
    <header className="question-bank-create-topbar">
      <nav aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate('/question-bank')}>Ngân hàng câu hỏi</button>
        <ChevronRight />
        <strong>Tạo câu hỏi</strong>
      </nav>
    </header>
    <main className="question-bank-create-workspace">
      <form className="question-bank-create-form" onSubmit={submit}>
        <section className="question-bank-create-card">
          <header className="question-bank-create-card__header">
            <div><h1>Thông tin câu hỏi</h1><span className="question-bank-draft"><i />Nháp</span></div>
            <p>Các trường có dấu <b>*</b> là bắt buộc</p>
          </header>
          <div className="question-bank-create-card__body">
            <div className="question-bank-create-grid question-bank-create-grid--top">
              <label className="question-bank-create-field question-bank-create-field--name"><span>Tên câu hỏi <em>*</em></span><input value={form.questionName} maxLength="240" onChange={event => set('questionName', event.target.value)} placeholder="Nhập tên câu hỏi (ví dụ: TOEIC P5 - Câu 101: Giới từ chỉ nơi chốn...)" autoFocus required /></label>
              <label className="question-bank-create-field"><span>Trạng thái <em>*</em></span><span className="question-bank-native-select"><select value={form.status} disabled aria-describedby="question-create-status-hint"><option value="DRAFT">Nháp</option></select><ChevronDown /></span><small id="question-create-status-hint">Hoàn thiện nội dung và đáp án trước khi chuyển sang Hoạt động.</small></label>
            </div>
            <div className="question-bank-create-grid">
              <label className="question-bank-create-field"><span>Chọn nhóm câu hỏi <em>*</em></span><span className="question-bank-native-select"><select value={form.groupId} onChange={event => set('groupId', event.target.value)} required><option value="">Chọn nhóm câu hỏi</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select><ChevronDown /></span></label>
              <label className="question-bank-create-field"><span>Chọn dạng câu hỏi <em>*</em></span><span className="question-bank-native-select"><select value={form.questionType} onChange={event => set('questionType', event.target.value)}>{QUESTION_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select><ChevronDown /></span></label>
            </div>
            <label className="question-bank-create-field question-bank-create-note"><span><span>Ghi chú cho câu hỏi</span><small>{form.note.length} / 500 ký tự</small></span><textarea value={form.note} maxLength="500" onChange={event => set('note', event.target.value)} placeholder="Nhập ghi chú cho câu hỏi (tiêu chí chấm, giải thích đáp án hoặc hướng dẫn làm bài)..." rows="4" /></label>
            {error && <p className="question-bank-create-error">{error}</p>}
            <footer className="question-bank-create-footer"><button type="button" onClick={() => navigate('/question-bank')}>Hủy</button><button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : <><Check />Lưu câu hỏi</>}</button></footer>
          </div>
        </section>
      </form>
    </main>
  </section>;
}
