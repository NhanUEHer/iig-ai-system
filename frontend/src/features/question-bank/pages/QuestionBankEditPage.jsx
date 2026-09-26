import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, CircleHelp, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import { FormField, Input, Select, Textarea } from '../../../components/ui/FormField';
import RichTextEditor from '../../../components/common/RichTextEditor';
import MediaUploader from '../../../components/common/MediaUploader';
import RecordQuestionEditor from '../components/RecordQuestionEditor';
import McqQuestionEditor from '../components/McqQuestionEditor';
import { useDialog } from '../../../components/feedback/dialogContext';
import { getQuestion, updateQuestion, listQuestionGroups, listQuestionTags, createQuestionTag, listQuestionContents, createQuestionContent, updateQuestionContent, deleteQuestionContent, listContentMedia, deleteQuestionMedia, listSubQuestions, createSubQuestion, updateSubQuestion, deleteSubQuestion } from '../../../services/questionBankService';
import './QuestionBankEditPage.css';
import './QuestionBankEditButtons.css';

const blankOption = (key, correct = false) => ({ optionKey: key, optionText: '', isCorrect: correct });
const blankSubQuestion = () => ({ promptHtml: '', hint: '', note: '', explanation: '', tags: [], options: [blankOption('A', true), blankOption('B')] });
const blankRecordQuestion = () => ({ promptHtml: '', instructionHtml: '', note: '', preparationDurationSeconds: 60, recordingDurationSeconds: 120, options: [], sampleAnswers: [] });
const blankWritingQuestion = () => ({ promptHtml: '', instructionHtml: '', note: '', maxCharacterCount: 2500, minWordCount: 250, options: [], sampleAnswers: [] });

export default function QuestionBankEditPage({ navigate, showMsg }) {
  const { id } = useParams();
  const { confirm: confirmDialog } = useDialog();
  const [tab, setTab] = useState('content');
  const [groups, setGroups] = useState([]);
  const [tags, setTags] = useState([]);
  const [question, setQuestion] = useState(null);
  const [contents, setContents] = useState([]);
  const [contentMedia, setContentMedia] = useState({});
  const [subQuestions, setSubQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [addingSub, setAddingSub] = useState(false);
  const [savingSubKeys, setSavingSubKeys] = useState([]);
  const savingSubRef = useRef(new Set());
  const load = async () => { try { const [q, g, t, c, s] = await Promise.all([getQuestion(id), listQuestionGroups(), listQuestionTags(), listQuestionContents(id), listSubQuestions(id)]); const contentItems = c.data || []; const mediaEntries = await Promise.all(contentItems.map(async item => [item.id, (await listContentMedia(item.id)).data || []])); setQuestion(q.data); setGroups(g.data || []); setTags(t.data || []); setContents(contentItems); setContentMedia(Object.fromEntries(mediaEntries)); setSubQuestions(s.data || []); } catch (e) { showMsg?.(e.response?.data?.error || 'Không thể tải câu hỏi.', 'error'); } };
  useEffect(() => { load(); }, [id]);
  const setQuestionField = (key, value) => setQuestion(current => ({ ...current, [key]: value }));
  const saveQuestion = async () => { setSaving(true); try { const res = await updateQuestion(id, question); setQuestion(res.data); showMsg?.(question.status === 'ACTIVE' ? 'Câu hỏi đã được kiểm tra và chuyển sang Hoạt động.' : 'Thông tin câu hỏi đã được lưu thành công.', 'success'); } catch (e) { showMsg?.(e.response?.data?.error || 'Không thể lưu câu hỏi. Vui lòng kiểm tra lại thông tin.', 'error'); } finally { setSaving(false); } };
  const addContent = async () => { try { const res = await createQuestionContent(id, { title: `Nội dung ${contents.length + 1}` }); setContents(items => [...items, res.data]); setTab('content'); } catch (e) { showMsg?.(e.response?.data?.error || 'Không thể thêm nội dung.', 'error'); } };
  const patchContent = (contentId, key, value) => setContents(items => items.map(item => item.id === contentId ? { ...item, [key]: value } : item));
  const saveContent = async item => { try { const res = await updateQuestionContent(id, item.id, item); setContents(items => items.map(value => value.id === item.id ? res.data : value)); showMsg?.('Đã lưu nội dung.', 'success'); } catch (e) { showMsg?.(e.response?.data?.error || 'Không thể lưu nội dung.', 'error'); } };
  const removeContent = async contentId => { if (!await confirmDialog({ title: 'Xóa nội dung?', message: 'Nội dung và các tệp media liên quan sẽ bị xóa.', confirmText: 'Xóa nội dung' })) return; await deleteQuestionContent(id, contentId); setContents(items => items.filter(item => item.id !== contentId)); };
  const refreshContentMedia = async contentId => { const res = await listContentMedia(contentId); setContentMedia(current => ({ ...current, [contentId]: res.data || [] })); };
  const removeMedia = async (contentId, media) => { await deleteQuestionMedia(media.id); setContentMedia(current => ({ ...current, [contentId]: (current[contentId] || []).filter(item => item.id !== media.id) })); };
  const addSub = async () => {
    setTab('questions');
    if (['RECORD', 'WRITING'].includes(question?.questionType)) {
      if (addingSub) return;
      setAddingSub(true);
      try { await createSubQuestion(id, { ...(question.questionType === 'WRITING' ? blankWritingQuestion() : blankRecordQuestion()), draft: true }); await load(); }
      catch (e) { showMsg?.(e.response?.data?.error || 'Không thể thêm câu hỏi.', 'error'); }
      finally { setAddingSub(false); }
      return;
    }
    setSubQuestions(items => [...items, { ...blankSubQuestion(), clientId: crypto.randomUUID() }]);
  };
  const patchSub = (key, field, value) => setSubQuestions(items => items.map(item => (item.id || item.clientId) === key ? { ...item, [field]: value } : item));
  const createAndSelectTag = async (key, name) => {
    try {
      const response = await createQuestionTag(name);
      const tag = response.data;
      setTags(items => items.some(item => item.id === tag.id) ? items : [...items, tag].sort((a, b) => a.name.localeCompare(b.name)));
      setSubQuestions(items => items.map(item => (item.id || item.clientId) === key ? { ...item, tags: [...new Set([...(item.tags || []).map(value => value.name || value), tag.name])] } : item));
    } catch (error) {
      showMsg?.(error.response?.data?.error || 'Không thể tạo Tag.', 'error');
    }
  };
  const addOption = key => setSubQuestions(items => items.map(item => {
    if ((item.id || item.clientId) !== key) return item;
    const options = [...item.options, blankOption(String.fromCharCode(65 + item.options.length))];
    return { ...item, options };
  }));
  const removeOption = (key, optionIndex) => setSubQuestions(items => items.map(item => {
    if ((item.id || item.clientId) !== key || item.options.length <= 2) return item;
    const removedCorrect = item.options[optionIndex]?.isCorrect;
    const options = item.options
      .filter((_, index) => index !== optionIndex)
      .map((option, index) => ({ ...option, optionKey: String.fromCharCode(65 + index), isCorrect: removedCorrect ? index === 0 : option.isCorrect }));
    return { ...item, options };
  }));
  const saveSub = async item => {
    const key = item.id || item.clientId;
    if (!key || savingSubRef.current.has(key)) return;
    savingSubRef.current.add(key);
    setSavingSubKeys(keys => [...keys, key]);
    try {
      if (item.id) await updateSubQuestion(id, item.id, item);
      else await createSubQuestion(id, item);
      await load();
      showMsg?.('Đã lưu câu hỏi con.', 'success');
    } catch (e) {
      showMsg?.(e.response?.data?.error || 'Không thể lưu câu hỏi con.', 'error');
    } finally {
      savingSubRef.current.delete(key);
      setSavingSubKeys(keys => keys.filter(value => value !== key));
    }
  };
  const removeSub = async item => { if (item.id) await deleteSubQuestion(id, item.id); setSubQuestions(items => items.filter(value => (value.id || value.clientId) !== (item.id || item.clientId))); };
  if (!question) return <div className="question-bank-edit-loading">Đang tải...</div>;
  return <section className="question-bank-edit-page">
    <header className="question-bank-edit-header">
      <nav aria-label="Breadcrumb">
        <button type="button" onClick={() => navigate('/question-bank')}>Ngân hàng câu hỏi</button>
        <ChevronRight aria-hidden="true" />
        <span>Cập nhật câu hỏi</span>
      </nav>
    </header>
    <section className="question-bank-edit-info" aria-labelledby="question-general-title">
      <header className="question-bank-edit-info__header">
        <div className="question-bank-edit-info__heading">
          <h2 id="question-general-title">Thông tin câu hỏi</h2>
          <span className={`question-bank-edit-info__status question-bank-edit-info__status--${String(question.status || 'DRAFT').toLowerCase()}`}>
            <i />{question.status === 'ACTIVE' ? 'Hoạt động' : question.status === 'INACTIVE' ? 'Dừng hoạt động' : 'Nháp'}
          </span>
        </div>
        <span className="question-bank-edit-info__required-note">Các trường có dấu <b>*</b> là bắt buộc</span>
      </header>
      <form className="question-bank-edit-info__form" onSubmit={event => { event.preventDefault(); saveQuestion(); }}>
        <div className="question-bank-edit-info__primary-row">
          <FormField id="question-name" label="Tên câu hỏi" required>
            <Input id="question-name" name="question_name" required placeholder="Nhập tên câu hỏi (ví dụ: TOEIC P5 - Câu 101: Giới từ chỉ nơi chốn...)" value={question.questionName || ''} onChange={e => setQuestionField('questionName', e.target.value)} />
          </FormField>
          <FormField id="question-status" label="Trạng thái" required>
            <Select id="question-status" name="status" value={question.status} onChange={e => setQuestionField('status', e.target.value)}><option value="DRAFT">Nháp</option><option value="ACTIVE">Hoạt động</option><option value="INACTIVE">Dừng hoạt động</option></Select>
          </FormField>
        </div>
        <div className="question-bank-edit-info__secondary-row">
          <FormField id="question-group" label="Chọn nhóm câu hỏi" required>
            <Select id="question-group" name="question_group" value={question.groupId || ''} onChange={e => setQuestionField('groupId', e.target.value)}>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select>
          </FormField>
          <FormField id="question-type" label="Chọn dạng câu hỏi" required>
            <Select id="question-type" name="question_type" value={question.questionType} disabled><option value="MCQ_SINGLE">Trắc nghiệm đơn (MCQ)</option><option value="RECORD">Thu âm / Nói (Speaking)</option><option value="WRITING">Tự luận / Viết (Writing)</option></Select>
          </FormField>
        </div>
        <FormField className="question-bank-edit-info__note" label={<><span>Ghi chú cho câu hỏi</span><small>{(question.note || '').length} / 500 ký tự</small></>}>
          <Textarea rows={4} maxLength={500} placeholder="Nhập ghi chú cho câu hỏi (tiêu chí chấm, giải thích đáp án hoặc hướng dẫn làm bài)..." value={question.note || ''} onChange={e => setQuestionField('note', e.target.value)} />
        </FormField>
        <footer className="question-bank-edit-info__actions">
          <Button type="button" variant="ghost" className="question-info-cancel" onClick={load}>Hủy</Button>
          <Button type="submit" className="question-info-save" icon={<Check />} loading={saving}>Cập nhật thông tin</Button>
        </footer>
      </form>
    </section>
    <section className="question-bank-edit-workspace">
      <nav className="question-builder-tabs" aria-label="Các bước biên soạn câu hỏi">
        <button type="button" className={tab === 'content' ? 'is-active' : ''} onClick={() => setTab('content')}><FileText />Nội dung</button>
        <button type="button" className={tab === 'questions' ? 'is-active' : ''} onClick={() => setTab('questions')}><CircleHelp />Câu hỏi &amp; câu trả lời</button>
      </nav>
      {tab === 'content' ? <div className="question-bank-edit-tab"><div className="question-bank-edit-section-title"><h2>Nội dung</h2><Button className="question-content-add" size="sm" icon={<Plus />} onClick={addContent}>Thêm nội dung</Button></div>{contents.length === 0 && <div className="question-content-empty"><FileText /><strong>Chưa có nội dung</strong><span>Thêm nội dung đầu tiên để bắt đầu biên soạn câu hỏi.</span></div>}{contents.map((item, index) => <article className="question-content-editor" key={item.id}><header><strong>Phần {index + 1}</strong><div><Button className="question-content-delete" size="sm" variant="danger" icon={<Trash2 />} onClick={() => removeContent(item.id)}>Xóa nội dung</Button></div></header><div className="question-content-editor__body"><FormField label="Tiêu đề" required><Input placeholder="Nhập tiêu đề phần nội dung..." value={item.title || ''} onChange={e => patchContent(item.id, 'title', e.target.value)} /></FormField><div className="question-content-editor__uploads"><ContentMediaField label="Audio (MP3, WAV, Max 10MB)" endpoint={`/api/question-bank/contents/${item.id}/media`} accept={['audio/*']} maxFileSize={10 * 1024 * 1024} note="Kéo thả hoặc chọn tệp audio" items={(contentMedia[item.id] || []).filter(media => media.mediaType === 'AUDIO')} onUploaded={() => refreshContentMedia(item.id)} onDelete={media => removeMedia(item.id, media)} /><ContentMediaField label="Video (MP4, MOV, Max 20MB)" endpoint={`/api/question-bank/contents/${item.id}/media`} accept={['video/*']} maxFileSize={20 * 1024 * 1024} note="Kéo thả hoặc chọn tệp video" items={(contentMedia[item.id] || []).filter(media => media.mediaType === 'VIDEO')} onUploaded={() => refreshContentMedia(item.id)} onDelete={media => removeMedia(item.id, media)} /><ContentMediaField label="Hình ảnh (JPG, PNG, Max 2MB)" endpoint={`/api/question-bank/contents/${item.id}/media`} accept={['image/*']} maxFileSize={2 * 1024 * 1024} note="Kéo thả hoặc chọn hình ảnh" items={(contentMedia[item.id] || []).filter(media => media.mediaType === 'IMAGE')} onUploaded={() => refreshContentMedia(item.id)} onDelete={media => removeMedia(item.id, media)} /></div><FormField label="Script"><RichTextEditor value={item.scriptHtml || ''} onChange={value => patchContent(item.id, 'scriptHtml', value)} placeholder="Nhập script hoặc đoạn hội thoại..." minHeight="96px" /></FormField><FormField label="Nội dung chính"><RichTextEditor value={item.contentHtml || ''} onChange={value => patchContent(item.id, 'contentHtml', value)} placeholder="Nhập nội dung chính..." minHeight="96px" /></FormField><FormField label="Bản dịch tiếng Việt"><RichTextEditor value={item.translationHtml || ''} onChange={value => patchContent(item.id, 'translationHtml', value)} placeholder="Nhập bản dịch tiếng Việt..." minHeight="96px" /></FormField><div className="question-content-editor__actions"><Button className="question-content-cancel" size="sm" variant="ghost" onClick={load}>Hủy</Button><Button className="question-content-save" size="sm" icon={<Save />} onClick={() => saveContent(item)}>Lưu nội dung</Button></div></div></article>)}</div>
      : <div className="question-bank-edit-tab"><div className="question-bank-edit-section-title"><h2>Câu hỏi & câu trả lời</h2><Button icon={<Plus />} onClick={addSub}>Thêm câu hỏi</Button></div>{['RECORD', 'WRITING'].includes(question.questionType) ? subQuestions.map((item, index) => { const key = item.id || item.clientId; return <RecordQuestionEditor key={key} item={item} index={index} tags={tags} writing={question.questionType === 'WRITING'} saving={savingSubKeys.includes(key)} onPatch={(field, value) => patchSub(key, field, value)} onCreateTag={createAndSelectTag} onSave={() => saveSub(item)} onCancel={load} onRemove={() => removeSub(item)} />; }) : subQuestions.map((item, index) => { const key = item.id || item.clientId; return <McqQuestionEditor key={key} item={item} index={index} tags={tags} saving={savingSubKeys.includes(key)} onPatch={(field, value) => patchSub(key, field, value)} onCreateTag={createAndSelectTag} onAddOption={() => addOption(key)} onRemoveOption={optionIndex => removeOption(key, optionIndex)} onSave={() => saveSub(item)} onCancel={load} onRemove={() => removeSub(item)} />; })}</div>}
    </section>
  </section>;
}

function ContentMediaField({ label, items, onUploaded, onDelete, ...props }) {
  const replaceMedia = async (file, uploaded) => {
    await Promise.all(items.filter(item => item.id !== uploaded?.id).map(item => onDelete?.(item)));
    await onUploaded?.(file, uploaded);
  };
  return <FormField className="question-content-media" label={<><span>{label}</span>{items.length > 0 && <em>✓ Đã tải lên</em>}</>}><MediaUploader {...props} variant="content" items={items} multiple={false} height={96} onUploaded={replaceMedia} onDelete={onDelete} /></FormField>;
}
