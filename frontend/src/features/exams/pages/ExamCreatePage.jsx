import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import RichTextEditor from '../../../components/common/RichTextEditor';
import Button from '../../../components/ui/Button';
import { FormField, Input, Textarea } from '../../../components/ui/FormField';
import { Breadcrumb } from '../../../components/ui/Layout';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { createExam, createExamGroup, listExamGroups, uploadExamCardImage } from '../../../services/examService';
import ExamCatalogFields from '../components/ExamCatalogFields';
import './ExamCreatePage.css';
import './ExamCreatePageOverrides.css';

const EXAM_TYPE_OPTIONS = [
  { value: 'LISTENING_READING', label: 'Đề Listening & Reading' },
  { value: 'READING', label: 'Đề Reading' },
  { value: 'LISTENING', label: 'Đề Listening' },
  { value: 'SPEAKING_WRITING', label: 'Đề Speaking & Writing' },
  { value: 'SPEAKING', label: 'Đề Speaking' },
  { value: 'WRITING', label: 'Đề Writing' },
];

const initialForm = { title: '', status: 'DRAFT', examType: '', description: '', introduction: '', displayLabel: '', difficulty: 'INTERMEDIATE', groupIds: [] };
function validate(form) {
  const errors = {};
  if (!form.title.trim()) errors.title = 'Vui lòng nhập tên đề thi.';
  if (!form.examType) errors.examType = 'Vui lòng chọn kiểu đề thi.';
  if (!form.difficulty) errors.difficulty = 'Vui lòng chọn độ khó.';
  if (!form.groupIds.length) errors.groupIds = 'Vui lòng chọn ít nhất một nhóm đề thi.';
  if (form.introduction.length > 5000) errors.introduction = 'Giới thiệu đề thi không được vượt quá 5000 ký tự.';
  return errors;
}

export default function ExamCreatePage({ navigate, showMsg }) {
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const imagePreview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : '', [imageFile]);
  useEffect(() => { listExamGroups().then(setGroups).catch(() => showMsg?.('Không thể tải danh sách nhóm đề thi.', 'error')); }, [showMsg]);
  useEffect(() => () => { if (imagePreview) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
  };
  const save = async event => {
    event.preventDefault();
    if (saving) return;
    const nextErrors = validate(form);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      showMsg?.('Vui lòng kiểm tra lại các trường bắt buộc.', 'error');
      return;
    }
    setSaving(true);
    try {
      const exam = await createExam({
        title: form.title.trim(),
        status: 'DRAFT',
        examType: form.examType,
        description: form.description.trim(),
        introduction: form.introduction,
        displayLabel: form.displayLabel.trim(),
        difficulty: form.difficulty,
        groupIds: form.groupIds,
      });
      if (imageFile) await uploadExamCardImage(exam.id, imageFile);
      showMsg?.('Đã tạo đề thi. Bạn có thể tiếp tục thiết lập cấu trúc đề.', 'success');
      navigate(`/exams/${exam.id}/edit?tab=details`);
    } catch (error) {
      showMsg?.(error.response?.data?.error || 'Không thể tạo đề thi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return <section className="exam-create-page">
    <header className="exam-create-header">
      <Breadcrumb separator={<ChevronRight />} items={[{ label: 'Quản lý đề thi' }, { label: 'Thêm mới đề thi', current: true }]} />
    </header>
    <main className="exam-create-main">
      <form className="exam-create-card" onSubmit={save} noValidate>
        <div className="exam-create-card-header">
          <div className="exam-create-title-row"><h1>Thông tin đề thi</h1><span><i />Bản nháp</span></div>
          <small>Các trường có dấu <b>*</b> là bắt buộc</small>
        </div>
        <div className="exam-create-form">
          <div className="exam-create-grid exam-create-grid--primary">
            <FormField id="exam-title" label="Tên đề thi" required error={errors.title}>
              <Input id="exam-title" value={form.title} maxLength={240} onChange={event => update('title', event.target.value)} placeholder="Nhập tên đề thi" autoFocus />
            </FormField>
            <FormField id="exam-status" label="Trạng thái">
              <MultiSelectFilter single disabled className="exam-create-single-select exam-create-status-select" value={form.status} options={[{ value: 'DRAFT', label: 'Bản nháp' }]} placeholder="Bản nháp" />
            </FormField>
          </div>
          <FormField id="exam-type" label="Kiểu đề thi" required error={errors.examType}>
            <MultiSelectFilter single className="exam-create-single-select exam-create-type-select" value={form.examType} onApply={value => update('examType', value)} options={EXAM_TYPE_OPTIONS} placeholder="Chọn kiểu đề thi" searchPlaceholder="Tìm kiểu đề thi..." />
          </FormField>
          <ExamCatalogFields value={form} onChange={setForm} groupOptions={groups.map(group => ({ value: group.id, label: group.name }))} errors={errors} imageItem={imageFile?{id:'local-card-image',mediaType:'IMAGE',url:imagePreview,originalName:imageFile.name,fileSize:imageFile.size}:null} onPickImage={setImageFile} onRemoveImage={() => setImageFile(null)} onCreateGroup={async name => { try { const group=await createExamGroup(name); setGroups(current => current.some(item=>item.id===group.id)?current:[...current,group]); update('groupIds',[...new Set([...form.groupIds,group.id])]); showMsg?.('Đã thêm nhóm đề thi mới.','success'); } catch(error) { showMsg?.(error.response?.data?.error||'Không thể thêm nhóm đề thi.','error'); throw error; } }} />
          <FormField id="exam-description" label="Mô tả đề thi">
            <div className="exam-create-counted-control">
              <Textarea id="exam-description" rows={4} maxLength={500} value={form.description} onChange={event => update('description', event.target.value)} placeholder="Nhập mô tả đề thi..." />
              <span>{form.description.length}/500</span>
            </div>
          </FormField>
          <FormField id="exam-introduction" label="Giới thiệu đề thi" error={errors.introduction}>
            <RichTextEditor value={form.introduction} onChange={value => update('introduction', value)} placeholder="Nhập giới thiệu, quy định và lưu ý trước khi làm bài..." minHeight="104px" variant="stitch" />
          </FormField>
        </div>
        <footer className="exam-create-footer">
          <aside>
            <Button type="button" size="sm" variant="secondary" onClick={() => navigate('/exams')}>Hủy</Button>
            <Button type="submit" size="sm" icon={<Check />} loading={saving}>Tạo đề thi</Button>
          </aside>
        </footer>
      </form>
    </main>
  </section>;
}
