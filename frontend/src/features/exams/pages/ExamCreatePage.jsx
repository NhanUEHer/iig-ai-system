import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Info, Save } from 'lucide-react';
import RichTextEditor from '../../../components/common/RichTextEditor';
import { createExam } from '../../../services/examService';
import { EXAM_STATUS_OPTIONS, examStatusMeta } from '../examStatus';
import './ExamCreatePage.css';
import './ExamCreatePageOverrides.css';

const initialForm = { title: '', status: 'DRAFT', durationMinutes: '60', scoreScale: '100', examCode: '', description: '', introduction: '' };

export default function ExamCreatePage({ navigate, showMsg }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const statusMeta = examStatusMeta(form.status);
  const save = async event => {
    event?.preventDefault();
    if (saving) return;
    const introText = form.introduction.replace(/<[^>]*>/g, '').trim();
    if (!form.title.trim() || !introText) { showMsg?.('Vui lòng nhập đầy đủ các trường bắt buộc.', 'error'); return; }
    setSaving(true);
    try {
      const exam = await createExam({ title: form.title, status: form.status, durationSeconds: Number(form.durationMinutes) * 60, scoreScale: Number(form.scoreScale), examCode: form.examCode, description: form.description, introduction: form.introduction });
      showMsg?.('Đã lưu thông tin đề thi.', 'success');
      navigate(`/exams/${exam.id}/edit`);
    } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể tạo đề thi.', 'error'); }
    finally { setSaving(false); }
  };

  return <section className="exam-create-page">
    <header className="exam-create-header">
      <div className="exam-create-breadcrumb"><button type="button" title="Quay lại danh sách đề thi" onClick={() => navigate('/exams')}><ArrowLeft /></button><span>Quản lý đề thi</span><ChevronRight /><strong>Thêm mới đề thi</strong></div>
    </header>
    <main className="exam-create-main"><div className="exam-create-container"><section className="exam-create-card">
      <div className="exam-create-card-header"><div><div className="exam-create-title-row"><h1>Thông tin chung đề thi</h1><span className={`is-${statusMeta.tone}`}><i />{statusMeta.label}</span></div><p>Điền các thông tin cơ bản, mô tả và hướng dẫn thi cho đề thi mới trước khi thiết lập các phần thi.</p></div><div className="exam-create-required"><b>*</b> Trường bắt buộc</div></div>
      <form className="exam-create-form" onSubmit={save}>
        <div className="exam-create-grid title-row"><label><span>Tên đề thi <b>*</b></span><input value={form.title} maxLength="240" onChange={event => update('title', event.target.value)} placeholder="Nhập tên đề thi" required /><small>Ví dụ: Đề thi thử TOEIC Định kỳ Quý 1 - Format 2026</small></label><label><span>Trạng thái <b>*</b></span><select className={`status-select is-${statusMeta.tone}`} value={form.status} onChange={event => update('status', event.target.value)}>{EXAM_STATUS_OPTIONS.map(option=><option key={option.value} value={option.value} disabled={option.value==='ACTIVE'}>{option.value==='ACTIVE'?'Hoạt động — sau khi đủ cấu trúc':option.label}</option>)}</select><small>Đề thi được kích hoạt sau khi cấu trúc và câu hỏi hợp lệ</small></label></div>
        <div className="exam-create-grid metrics-row"><label><span>Thời gian làm bài (phút) <b>*</b></span><input type="number" min="1" max="600" step="1" value={form.durationMinutes} onChange={event => update('durationMinutes', event.target.value)} required /><small>Thời lượng thực tế khi tính giờ làm bài</small></label><label><span>Tổng điểm / Thang điểm</span><input type="number" min="1" step="0.01" value={form.scoreScale} onChange={event => update('scoreScale', event.target.value)} placeholder="Ví dụ: 100 hoặc 990" /><small>Thang điểm tổng kết quả bài kiểm tra</small></label><label><span>Mã đề thi (Code)</span><input className="code" value="" disabled readOnly /><small>Mã định danh duy nhất được hệ thống tự động tạo</small></label></div>
        <label className="exam-create-description"><span>Mô tả đề thi <em>{form.description.length} / 500 ký tự</em></span><textarea rows="3" maxLength="500" value={form.description} onChange={event => update('description', event.target.value)} placeholder="Nhập mô tả tóm tắt mục đích đánh giá, phạm vi kiến thức và đối tượng học viên..." /></label>
        <label className="exam-create-introduction"><span>Giới thiệu &amp; Hướng dẫn làm bài cho thí sinh <b>*</b></span><RichTextEditor value={form.introduction} onChange={value => update('introduction', value)} placeholder="Nhập nội dung quy định, lưu ý trước khi làm bài..." minHeight="104px" variant="stitch" /></label>
        <footer className="exam-create-footer"><div><Info /><span>Sau khi lưu đề thi, bạn sẽ chuyển sang bước tạo cấu trúc các Phần thi và gán Câu hỏi.</span></div><aside><button type="button" className="secondary" onClick={() => navigate('/exams')}>Hủy</button><button type="submit" className="primary" disabled={saving}><Save />Lưu</button></aside></footer>
      </form>
    </section></div></main>
  </section>;
}
