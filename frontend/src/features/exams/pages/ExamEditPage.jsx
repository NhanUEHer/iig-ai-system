import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,BookOpen,CheckCircle2,ChevronDown,ChevronUp,CirclePause,GripHorizontal,GripVertical,Info,Pencil,Plus,Save,Search,Trash2} from 'lucide-react';
import {FormField,Input} from '../../../components/ui/FormField';
import Button from '../../../components/ui/Button';
import {Alert} from '../../../components/ui/Feedback';
import RichTextEditor from '../../../components/common/RichTextEditor';
import MediaUploader from '../../../components/common/MediaUploader';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import DurationInput from '../../../components/ui/DurationInput';
import {useDialog} from '../../../components/feedback/dialogContext';
import ExamQuestionPicker from '../components/ExamQuestionPicker';
import ExamAddPartModal from '../components/ExamAddPartModal';
import ExamCreatePartModal from '../components/ExamCreatePartModal';
import {activateExam,addExamQuestions,createExamPart,createExamSection,deactivateExam,deleteExamPartInstructionAudio,deleteExamQuestion,deleteExamSection,deleteExamSectionPart,getExam,reorderExamQuestions,reorderExamSectionParts,reorderExamSections,updateExam,updateExamPartContent,updateExamSection} from '../../../services/examService';
import {EXAM_STATUS_OPTIONS} from '../examStatus';
import './ExamEditPage.css';
import './ExamEditPageOverrides.css';

const statusName=Object.fromEntries(EXAM_STATUS_OPTIONS.map(option=>[option.value,option.label]));
const EXAM_TYPE_OPTIONS=[
  {value:'LISTENING_READING',label:'Đề Listening & Reading'},
  {value:'READING',label:'Đề Reading'},
  {value:'LISTENING',label:'Đề Listening'},
  {value:'SPEAKING_WRITING',label:'Đề Speaking & Writing'},
  {value:'SPEAKING',label:'Đề Speaking'},
  {value:'WRITING',label:'Đề Writing'},
];
const typeName=type=>type==='RECORD'?'Record':type==='WRITING'?'Writing':'Trắc nghiệm đơn';
const normalizeExam=data=>{
  if(!data)return data;
  const rawSections=Array.isArray(data.sections)?data.sections:[];
  const sections=rawSections.map(section=>({...section,parts:(Array.isArray(section.parts)?section.parts:[]).map(part=>({...part,sectionId:part.sectionId||section.id,sectionTitle:section.title,examMode:part.examMode||section.examMode,questions:Array.isArray(part.questions)?part.questions:[]}))}));
  const parts=Array.isArray(data.parts)?data.parts:sections.flatMap(section=>section.parts);
  return {...data,sections,parts,sectionCount:Number(data.sectionCount??sections.length),partCount:Number(data.partCount??parts.length),subQuestionCount:Number(data.subQuestionCount||0),durationSeconds:Number(data.durationSeconds||data.configuredDurationSeconds||0),scoreScale:Number(data.scoreScale||0),pointsPerSubQuestion:Number(data.pointsPerSubQuestion||0)};
};

export default function ExamEditPage({navigate,showMsg}){
  const id=location.pathname.split('/')[2];const {confirm:requestConfirm}=useDialog();
  const showMsgRef=useRef(showMsg);
  useEffect(()=>{showMsgRef.current=showMsg;},[showMsg]);
  const [exam,setExam]=useState(null);const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('');
  const [deactivating,setDeactivating]=useState(false);const [activating,setActivating]=useState(false);const [activationErrors,setActivationErrors]=useState([]);
  const [activeTab,setActiveTab]=useState(()=>new URLSearchParams(location.search).get('tab')==='general'?'general':'details');
  const [partModalOpen,setPartModalOpen]=useState(false);const [addingPart,setAddingPart]=useState(false);
  const [generalForm,setGeneralForm]=useState(null);const [savingGeneral,setSavingGeneral]=useState(false);
  const [editingPart,setEditingPart]=useState(null);const [renamingPart,setRenamingPart]=useState(false);
  const [selectedSectionId,setSelectedSectionId]=useState(null);const [selectedPartId,setSelectedPartId]=useState(null);
  const [createPartOpen,setCreatePartOpen]=useState(false);const [creatingPart,setCreatingPart]=useState(false);
  const [editingChildPart,setEditingChildPart]=useState(null);const [savingChildPart,setSavingChildPart]=useState(false);
  const [pickerPart,setPickerPart]=useState(null);const [expanded,setExpanded]=useState({});const [searches,setSearches]=useState({});
  const [partDraftDirty,setPartDraftDirty]=useState(false);
  const load=useCallback(async()=>{setLoading(true);setLoadError('');try{const data=normalizeExam(await getExam(id));setExam(data);setExpanded(current=>data.parts.reduce((out,part,index)=>({...out,[part.id]:current[part.id]??index===0}),{}));}catch(error){const message=error.response?.data?.error||'Không thể tải đề thi.';setExam(null);setLoadError(message);showMsgRef.current?.(message,'error');}finally{setLoading(false);}},[id]);
  useEffect(()=>{load();},[load]);
  useEffect(()=>{if(!exam)return;setSelectedSectionId(current=>exam.sections.some(section=>section.id===current)?current:exam.sections[0]?.id||null);},[exam]);
  useEffect(()=>{if(!exam||!selectedSectionId){setSelectedPartId(null);return;}const section=exam.sections.find(item=>item.id===selectedSectionId);setSelectedPartId(current=>section?.parts?.some(part=>part.id===current)?current:section?.parts?.[0]?.id||null);},[exam,selectedSectionId]);
  useEffect(()=>{const warn=event=>{if(!partDraftDirty)return;event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[partDraftDirty]);
  const locked=exam?.status==='ACTIVE';
  const confirmDiscardPartDraft=async()=>!partDraftDirty||requestConfirm({title:'Bỏ thay đổi chưa lưu?',message:'Thông tin Part đang có thay đổi chưa được lưu. Nếu tiếp tục, các thay đổi này sẽ bị mất.',confirmText:'Bỏ thay đổi'});
  const selectSection=async sectionId=>{if(sectionId===selectedSectionId)return;if(await confirmDiscardPartDraft()){setPartDraftDirty(false);setSelectedSectionId(sectionId);}};
  const selectPart=async partId=>{if(partId===selectedPartId)return;if(await confirmDiscardPartDraft()){setPartDraftDirty(false);setSelectedPartId(partId);}};
  const leaveEditor=async action=>{if(await confirmDiscardPartDraft()){setPartDraftDirty(false);action();}};
  const handleDeactivate=async()=>{if(!locked||deactivating)return;const confirmed=await requestConfirm({title:'Ngừng hoạt động đề thi?',message:'Đề thi sẽ được mở khóa để chỉnh sửa. Sau khi hoàn tất, bạn cần kích hoạt lại để tạo phiên bản đề mới.',confirmText:'Ngừng hoạt động'});if(!confirmed)return;setDeactivating(true);try{const updated=normalizeExam(await deactivateExam(id));setExam(updated);setGeneralForm(current=>current?{...current,status:updated.status}:current);showMsg?.('Đề thi đã ngừng hoạt động. Bạn có thể chỉnh sửa nội dung và cấu trúc.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể ngừng hoạt động đề thi.','error');}finally{setDeactivating(false);}};
  const handleActivate=async()=>{if(locked||activating)return;const confirmed=await requestConfirm({title:'Kích hoạt đề thi?',message:'Hệ thống sẽ kiểm tra toàn bộ cấu trúc và tạo một phiên bản đề mới. Sau khi kích hoạt, đề thi sẽ được khóa chỉnh sửa.',confirmText:'Kiểm tra & kích hoạt'});if(!confirmed)return;setActivating(true);setActivationErrors([]);try{const updated=normalizeExam(await activateExam(id));setExam(updated);setGeneralForm(current=>current?{...current,status:updated.status}:current);showMsg?.('Đề thi đã được kích hoạt thành công.','success');}catch(error){const details=error.response?.data?.details;setActivationErrors(Array.isArray(details)?details.filter(Boolean):[]);showMsg?.(error.response?.data?.error||'Không thể kích hoạt đề thi.','error');}finally{setActivating(false);}};
  const openGeneral=()=>leaveEditor(()=>{setGeneralForm({title:exam.title,status:exam.status,examType:exam.examType||'',description:exam.description||'',introduction:exam.introduction||''});setActiveTab('general');});
  const saveGeneral=async()=>{if(!generalForm?.title.trim()||!generalForm.examType||savingGeneral)return;setSavingGeneral(true);try{const updated=normalizeExam(await updateExam(id,{title:generalForm.title.trim(),status:generalForm.status,examType:generalForm.examType,description:generalForm.description||'',introduction:generalForm.introduction||''}));setExam(updated);setGeneralForm({title:updated.title,status:updated.status,examType:updated.examType||'',description:updated.description||'',introduction:updated.introduction||''});showMsg?.('Đã cập nhật thông tin chung.','success');setActiveTab('details');}catch(error){showMsg?.(error.response?.data?.error||'Không thể cập nhật thông tin chung.','error');}finally{setSavingGeneral(false);}};
  const handleAddPart=async(sectionData)=>{if(!sectionData.title.trim()||addingPart)return;setAddingPart(true);try{const data=normalizeExam(await createExamSection(id,sectionData));setExam(data);const created=data.sections[data.sections.length-1];if(created)setSelectedSectionId(created.id);setPartModalOpen(false);showMsg?.('Đã thêm phần thi thành công.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể thêm phần thi.','error');}finally{setAddingPart(false);}};
  const renamePart=async sectionData=>{if(!sectionData.title.trim()||!editingPart||renamingPart)return;setRenamingPart(true);try{setExam(normalizeExam(await updateExamSection(id,editingPart.id,sectionData)));setEditingPart(null);showMsg?.('Đã cập nhật phần thi.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể cập nhật phần thi.','error');}finally{setRenamingPart(false);}};
  const removePart=async section=>{if(!await requestConfirm({title:'Xóa phần thi?',message:`Toàn bộ Part và câu hỏi trong “${section.title}” sẽ được gỡ khỏi đề.`,confirmText:'Xóa phần thi'}))return;try{setExam(normalizeExam(await deleteExamSection(id,section.id)));showMsg?.('Đã xóa phần thi.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể xóa phần thi.','error');}};
  const movePart=async(index,delta)=>{const ids=exam.sections.map(section=>section.id);const target=index+delta;if(target<0||target>=ids.length)return;[ids[index],ids[target]]=[ids[target],ids[index]];try{setExam(normalizeExam(await reorderExamSections(id,ids)));}catch(error){showMsg?.(error.response?.data?.error||'Không thể sắp xếp phần thi.','error');}};
  const handleCreatePart=async partData=>{if(!selectedSectionId||creatingPart)return;setCreatingPart(true);try{const response=await createExamPart(id,selectedSectionId,partData);const data=normalizeExam(response.exam||response);setExam(data);if(response.part?.id)setSelectedPartId(response.part.id);setCreatePartOpen(false);showMsg?.('Đã thêm Part thành công.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể thêm Part.','error');}finally{setCreatingPart(false);}};
  const renameSectionPart=async({title})=>{if(!editingChildPart||savingChildPart||!title.trim())return;setSavingChildPart(true);try{setExam(normalizeExam(await updateExamPartContent(id,editingChildPart.sectionId,editingChildPart.id,{title:title.trim()})));setEditingChildPart(null);showMsg?.('Đã cập nhật tên Part.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể cập nhật tên Part.','error');}finally{setSavingChildPart(false);}};
  const removeSectionPart=async part=>{if(!await requestConfirm({title:'Xóa Part?',message:`Toàn bộ câu hỏi trong “${part.title}” sẽ được gỡ khỏi đề.`,confirmText:'Xóa Part'}))return;try{setExam(normalizeExam(await deleteExamSectionPart(id,part.sectionId,part.id)));showMsg?.('Đã xóa Part.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể xóa Part.','error');}};
  const moveSectionPart=async(section,source,target)=>{if(target<0||target>=section.parts.length||source===target)return;const partIds=section.parts.map(part=>part.id);const [moved]=partIds.splice(source,1);partIds.splice(target,0,moved);try{setExam(normalizeExam(await reorderExamSectionParts(id,section.id,partIds)));}catch(error){showMsg?.(error.response?.data?.error||'Không thể sắp xếp Part.','error');}};
  const addQuestions=async ids=>{try{setExam(normalizeExam(await addExamQuestions(id,pickerPart.sectionId,pickerPart.id,ids)));setPickerPart(null);showMsg?.('Đã thêm câu hỏi vào Part.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể thêm câu hỏi.','error');}};
  const removeQuestion=async(part,question)=>{if(!await requestConfirm({title:'Gỡ câu hỏi khỏi đề?',message:`Gỡ “${question.questionName}” khỏi Part?`,confirmText:'Gỡ câu hỏi'}))return;try{setExam(normalizeExam(await deleteExamQuestion(id,part.sectionId,part.id,question.id)));showMsg?.('Đã gỡ câu hỏi khỏi đề.','success');}catch(error){showMsg?.(error.response?.data?.error||'Không thể gỡ câu hỏi.','error');}};
  const moveQuestion=async(part,index,delta)=>{const ids=part.questions.map(question=>question.id);const target=index+delta;if(target<0||target>=ids.length)return;const [moved]=ids.splice(index,1);ids.splice(target,0,moved);try{setExam(normalizeExam(await reorderExamQuestions(id,part.sectionId,part.id,ids)));}catch(error){showMsg?.(error.response?.data?.error||'Không thể sắp xếp câu hỏi.','error');}};
  if(loading)return <section className="exam-detail-loading">Đang tải thông tin đề thi...</section>;
  if(loadError||!exam)return <section className="exam-detail-load-error"><strong>Không thể tải thông tin đề thi</strong><p>{loadError}</p><div><button type="button" onClick={()=>navigate('/exams')}>Quay lại danh sách</button><button type="button" onClick={load}>Thử lại</button></div></section>;

  return <section className="exam-detail-page">
    <header className="exam-detail-header"><button type="button" onClick={()=>leaveEditor(()=>navigate('/exams'))}><ArrowLeft/></button><span>Quản lý đề thi</span><i>/</i><strong>Chỉnh sửa đề thi</strong></header>
    <main className="exam-detail-main">
      {locked&&<Alert className="exam-active-notice" severity="warning" title="Đề thi đang hoạt động"><div className="exam-active-notice__body"><span>Hãy ngừng hoạt động đề thi trước khi chỉnh sửa thông tin hoặc cấu trúc.</span><button type="button" onClick={handleDeactivate} disabled={deactivating}><CirclePause/>{deactivating?'Đang xử lý...':'Ngừng hoạt động để chỉnh sửa'}</button></div></Alert>}
      {activationErrors.length>0&&<Alert className="exam-activation-errors" severity="error" title="Đề thi chưa đủ điều kiện kích hoạt"><ul>{activationErrors.map((message,index)=><li key={`${message}-${index}`}>{message}</li>)}</ul></Alert>}
      <nav className="exam-detail-tabs"><button type="button" className={activeTab==='general'?'is-active':''} onClick={openGeneral}><i><Info/></i>Thông tin chung</button><button type="button" className={activeTab==='details'?'is-active':''} onClick={()=>setActiveTab('details')}><i><BookOpen/></i>Chi tiết đề thi <b>{exam.sectionCount} phần • {exam.subQuestionCount} câu</b></button></nav>
      {activeTab==='general'
        ?<GeneralInformationForm value={generalForm} onChange={setGeneralForm} onSave={saveGeneral} saving={savingGeneral} locked={locked}/>
        :<ExamStructureWorkspace exam={exam} examId={id} locked={locked} selectedSectionId={selectedSectionId} selectedPartId={selectedPartId} onSelectSection={selectSection} onSelectPart={selectPart} onAddSection={()=>setPartModalOpen(true)} onAddPart={()=>setCreatePartOpen(true)} onEditSection={setEditingPart} onDeleteSection={removePart} onMoveSection={movePart} onEditPart={setEditingChildPart} onDeletePart={removeSectionPart} onMovePart={moveSectionPart} onPickQuestions={setPickerPart} onRemoveQuestion={removeQuestion} onMoveQuestion={moveQuestion} onExamChange={next=>setExam(normalizeExam(next))} onReload={load} onPartDraftDirtyChange={setPartDraftDirty} showMsg={showMsg}/>}
    </main>
    {activeTab==='details'&&<footer className="exam-detail-footer"><div><i/><span>Cấu trúc được lưu tự động</span></div>{!locked&&<aside><button type="button" className="exam-activate-button" disabled={activating} onClick={handleActivate}><CheckCircle2/>{activating?'Đang kiểm tra...':'Kích hoạt'}</button></aside>}</footer>}
    <ExamAddPartModal open={partModalOpen} examType={exam.examType} onClose={()=>setPartModalOpen(false)} onSubmit={handleAddPart} loading={addingPart} />
    <ExamAddPartModal open={Boolean(editingPart)} examType={exam.examType} initialData={editingPart} onClose={()=>setEditingPart(null)} onSubmit={renamePart} loading={renamingPart}/>
    <ExamCreatePartModal open={createPartOpen} onClose={()=>setCreatePartOpen(false)} onSubmit={handleCreatePart} loading={creatingPart}/>
    <ExamCreatePartModal open={Boolean(editingChildPart)} initialData={editingChildPart} onClose={()=>setEditingChildPart(null)} onSubmit={renameSectionPart} loading={savingChildPart}/>
    <ExamQuestionPicker open={Boolean(pickerPart)} examId={id} part={pickerPart} onClose={()=>setPickerPart(null)} onAdd={addQuestions}/>
  </section>;
}

function GeneralInformationForm({value,onChange,onSave,saving,locked}){
  if(!value)return null;
  const update=(key,next)=>onChange(current=>({...current,[key]:next}));
  return <section className="exam-general-card">
    <header><div><h2>Thông tin chung</h2></div><span>Các trường có dấu <b>*</b> là bắt buộc</span></header>
    <div className="exam-general-form">
      <div className="exam-general-form__title">
        <FormField label="Tên đề thi" required><Input value={value.title} maxLength={240} disabled={locked} onChange={event=>update('title',event.target.value)} placeholder="Nhập tên đề thi"/></FormField>
        <FormField label="Trạng thái"><MultiSelectFilter single disabled className="exam-edit-single-select" value={value.status} options={EXAM_STATUS_OPTIONS} placeholder="Bản nháp"/></FormField>
      </div>
      <FormField label="Kiểu đề thi" required>
        <MultiSelectFilter single disabled className="exam-edit-single-select" value={value.examType} options={EXAM_TYPE_OPTIONS} placeholder="Chọn kiểu đề thi" searchPlaceholder="Tìm kiểu đề thi..."/>
      </FormField>
      <FormField label="Mô tả đề thi"><textarea rows="4" maxLength="500" value={value.description} disabled={locked} onChange={event=>update('description',event.target.value)} placeholder="Nhập mô tả đề thi..."/></FormField>
      <FormField label="Giới thiệu đề thi"><RichTextEditor value={value.introduction} onChange={next=>update('introduction',next)} disabled={locked} minHeight="140px" variant="stitch"/></FormField>
    </div>
    <footer><span/><div><button type="button" disabled={saving||locked||!value.title.trim()||!value.examType} onClick={onSave}><Save/>{saving?'Đang lưu...':'Lưu & tiếp tục'}</button></div></footer>
  </section>;
}

const MODE_LABELS={FREESTYLE:'Freestyle',NON_STOP:'Non-stop',RECORD_NON_STOP:'Record non-stop',WRITING_NON_STOP:'Writing non-stop'};
function ExamStructureWorkspace({exam,examId,locked,selectedSectionId,selectedPartId,onSelectSection,onSelectPart,onAddSection,onAddPart,onEditSection,onDeleteSection,onMoveSection,onEditPart,onDeletePart,onMovePart,onPickQuestions,onRemoveQuestion,onMoveQuestion,onExamChange,onReload,onPartDraftDirtyChange,showMsg}){
  const [draggedSectionIndex,setDraggedSectionIndex]=useState(null);
  const [sectionDropIndex,setSectionDropIndex]=useState(null);
  const [draggedPartIndex,setDraggedPartIndex]=useState(null);
  const [partDropIndex,setPartDropIndex]=useState(null);
  const [draggedQuestionIndex,setDraggedQuestionIndex]=useState(null);
  const [questionDropIndex,setQuestionDropIndex]=useState(null);
  const section=exam.sections.find(item=>item.id===selectedSectionId)||null;
  const parts=Array.isArray(section?.parts)?section.parts:[];
  const part=parts.find(item=>item.id===selectedPartId)||null;
  const formatTime=seconds=>{const value=Math.max(0,Math.round(Number(seconds)||0));return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;};
  return <section className="exam-structure exam-structure-workspace">
    <section className="exam-structure-panel exam-sections-panel">
      <header><div><h2>Cấu trúc đề thi</h2><p>{exam.sectionCount} phần thi • {exam.subQuestionCount} câu hỏi</p></div>{!locked&&exam.sections.length>0&&<button type="button" onClick={onAddSection}><Plus/>Thêm phần thi</button>}</header>
      {!exam.sections.length?<div className="exam-detail-empty"><BookOpen/><strong>Chưa có phần thi</strong><p>Hãy tạo phần thi đầu tiên để bắt đầu xây dựng cấu trúc đề.</p>{!locked&&<button type="button" onClick={onAddSection}><Plus/>Thêm phần thi</button>}</div>:<div className="exam-structure-table-wrap"><table className="exam-structure-table exam-sections-table"><colgroup><col className="col-drag"/><col className="col-index"/><col className="col-title"/><col className="col-mode"/><col className="col-count"/><col className="col-duration"/><col className="col-actions"/></colgroup><thead><tr><th className="exam-drag-column"/><th>STT</th><th>Phần thi</th><th>Kiểu thi</th><th>Số câu thực tế / cấu hình</th><th>Thời gian thực tế / cấu hình</th><th>Thao tác</th></tr></thead><tbody>{exam.sections.map((item,index)=><tr key={item.id} className={`${item.id===selectedSectionId?'is-selected ':''}${draggedSectionIndex===index?'is-dragging ':''}${sectionDropIndex===index&&draggedSectionIndex!==index?'is-drop-target':''}`} onClick={()=>onSelectSection(item.id)} onDragOver={event=>{if(locked||draggedSectionIndex===null)return;event.preventDefault();event.dataTransfer.dropEffect='move';setSectionDropIndex(index);}} onDrop={event=>{event.preventDefault();event.stopPropagation();if(draggedSectionIndex!==null&&draggedSectionIndex!==index)onMoveSection(draggedSectionIndex,index-draggedSectionIndex);setDraggedSectionIndex(null);setSectionDropIndex(null);}}><td className="exam-drag-column">{!locked&&exam.sections.length>1&&<button type="button" className="exam-section-drag-handle" draggable title="Kéo để sắp xếp phần thi" aria-label={`Kéo để sắp xếp ${item.title}`} onClick={event=>event.stopPropagation()} onDragStart={event=>{event.stopPropagation();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index));setDraggedSectionIndex(index);setSectionDropIndex(index);}} onDragEnd={()=>{setDraggedSectionIndex(null);setSectionDropIndex(null);}}><GripVertical/></button>}</td><td>{index+1}</td><td><strong title={item.title}>{item.title}</strong></td><td><span className="exam-mode-badge">{MODE_LABELS[item.examMode]||item.examMode}</span></td><td><b>{item.actualSubQuestionCount||0}</b><span className="exam-metric-divider">/</span>{item.questionCount}</td><td><b>{formatTime(item.actualDurationSeconds)}</b><span className="exam-metric-divider">/</span>{formatTime(item.configuredDurationSeconds)}</td><td>{!locked&&<div className="ui-row-actions"><Button className="exam-table-action" type="button" size="sm" variant="ghost" iconOnly title="Chỉnh sửa" aria-label="Chỉnh sửa phần thi" onClick={event=>{event.stopPropagation();onEditSection(item);}}><Pencil/></Button><Button className="exam-table-action exam-table-action--danger" type="button" size="sm" variant="ghost" iconOnly title="Xóa" aria-label="Xóa phần thi" onClick={event=>{event.stopPropagation();onDeleteSection(item);}}><Trash2/></Button></div>}</td></tr>)}</tbody></table></div>}
    </section>
    {section&&<div className={`exam-part-workspace${parts.length?' has-parts':' is-empty'}`}>
      <section className="exam-structure-panel exam-parts-panel"><header><div><h2>Danh sách Part</h2><p>Thuộc phần thi: {section.title}</p></div>{!locked&&parts.length>0&&<button type="button" onClick={onAddPart}><Plus/>Thêm Part</button>}</header>{parts.length?<table className="exam-parts-table"><colgroup><col className="col-drag"/><col className="col-index"/><col className="col-title"/><col className="col-count"/><col className="col-duration"/><col className="col-actions"/></colgroup><thead><tr><th className="exam-drag-column"/><th>STT</th><th>Part</th><th>Số câu hỏi</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>{parts.map((item,index)=><tr key={item.id} className={`${item.id===selectedPartId?'is-selected ':''}${draggedPartIndex===index?'is-dragging ':''}${partDropIndex===index&&draggedPartIndex!==index?'is-drop-target':''}`} onClick={()=>onSelectPart(item.id)} onDragOver={event=>{if(locked||draggedPartIndex===null)return;event.preventDefault();event.dataTransfer.dropEffect='move';setPartDropIndex(index);}} onDrop={event=>{event.preventDefault();event.stopPropagation();if(draggedPartIndex!==null&&draggedPartIndex!==index)onMovePart(section,draggedPartIndex,index);setDraggedPartIndex(null);setPartDropIndex(null);}}><td className="exam-drag-column">{!locked&&parts.length>1&&<button type="button" className="exam-section-drag-handle" draggable title="Kéo để sắp xếp Part" aria-label={`Kéo để sắp xếp ${item.title}`} onClick={event=>event.stopPropagation()} onDragStart={event=>{event.stopPropagation();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index));setDraggedPartIndex(index);setPartDropIndex(index);}} onDragEnd={()=>{setDraggedPartIndex(null);setPartDropIndex(null);}}><GripVertical/></button>}</td><td>{index+1}</td><td><strong title={item.title}>{item.title}</strong></td><td>{item.subQuestionCount||item.questions?.length||0}</td><td>{formatTime(item.actualDurationSeconds)}</td><td>{!locked&&<div className="ui-row-actions"><Button className="exam-table-action" type="button" size="sm" variant="ghost" iconOnly title="Sửa tên Part" aria-label="Sửa tên Part" onClick={event=>{event.stopPropagation();onEditPart(item);}}><Pencil/></Button><Button className="exam-table-action exam-table-action--danger" type="button" size="sm" variant="ghost" iconOnly title="Xóa Part" aria-label="Xóa Part" onClick={event=>{event.stopPropagation();onDeletePart(item);}}><Trash2/></Button></div>}</td></tr>)}</tbody></table>:<div className="exam-part-empty"><span>Chưa có Part trong phần thi này.</span>{!locked&&<button type="button" onClick={onAddPart}><Plus/>Thêm Part</button>}</div>}</section>
      {parts.length>0&&<aside className="exam-structure-panel exam-part-information"><header><div><h2>Thông tin Part</h2></div></header>{part?<PartInformationEditor key={part.id} examId={examId} part={part} locked={locked} onExamChange={onExamChange} onReload={onReload} onDirtyChange={onPartDraftDirtyChange} showMsg={showMsg}/>:<div className="exam-part-empty">Chưa chọn Part.</div>}</aside>}
    </div>}
    {part&&<section className="exam-structure-panel exam-selected-part-questions"><header><div><h2>Danh sách câu hỏi</h2><p>{part.title} • {part.questions?.length||0} câu hỏi lớn</p></div>{!locked&&<button type="button" onClick={()=>onPickQuestions(part)}><Plus/>Thêm câu hỏi</button>}</header><div className="exam-structure-table-wrap"><table className="exam-structure-table exam-selected-questions-table"><colgroup><col className="col-drag"/><col className="col-index"/><col className="col-title"/><col className="col-type"/><col className="col-count"/><col className="col-duration"/><col className="col-actions"/></colgroup><thead><tr><th className="exam-drag-column"/><th>STT</th><th>Tên câu hỏi</th><th>Dạng câu hỏi</th><th>Số câu hỏi con</th><th>Thời gian</th><th>Thao tác</th></tr></thead><tbody>{part.questions?.length?part.questions.map((question,index)=><tr key={question.id} className={`${draggedQuestionIndex===index?'is-dragging ':''}${questionDropIndex===index&&draggedQuestionIndex!==index?'is-drop-target':''}`} onDragOver={event=>{if(locked||draggedQuestionIndex===null)return;event.preventDefault();event.dataTransfer.dropEffect='move';setQuestionDropIndex(index);}} onDrop={event=>{event.preventDefault();event.stopPropagation();if(draggedQuestionIndex!==null&&draggedQuestionIndex!==index)onMoveQuestion(part,draggedQuestionIndex,index-draggedQuestionIndex);setDraggedQuestionIndex(null);setQuestionDropIndex(null);}}><td className="exam-drag-column">{!locked&&part.questions.length>1&&<button type="button" className="exam-section-drag-handle" draggable title="Kéo để sắp xếp câu hỏi" aria-label={`Kéo để sắp xếp ${question.questionName}`} onDragStart={event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index));setDraggedQuestionIndex(index);setQuestionDropIndex(index);}} onDragEnd={()=>{setDraggedQuestionIndex(null);setQuestionDropIndex(null);}}><GripVertical/></button>}</td><td>{index+1}</td><td><strong title={question.questionName}>{question.questionName}</strong></td><td>{typeName(question.questionType)}</td><td>{question.subQuestionCount||0}</td><td className="question-duration">{question.actualDurationSeconds==null?'—':formatTime(question.actualDurationSeconds)}</td><td>{!locked&&<div className="ui-row-actions"><Button className="exam-table-action exam-table-action--danger" type="button" size="sm" variant="ghost" iconOnly title="Gỡ khỏi Part" aria-label={`Gỡ ${question.questionName} khỏi Part`} onClick={()=>onRemoveQuestion(part,question)}><Trash2/></Button></div>}</td></tr>):<tr><td colSpan="7" className="empty">Chưa có câu hỏi trong Part này.</td></tr>}</tbody></table></div></section>}
  </section>;
}

function PartInformationEditor({examId,part,locked,onExamChange,onReload,onDirtyChange,showMsg}){
  const hasQuestionBreak=part.examMode==='NON_STOP'||part.examMode==='RECORD_NON_STOP';
  const isWriting=part.examMode==='WRITING_NON_STOP';
  const [form,setForm]=useState({instructionHtml:part.instructionHtml||'',breakDurationSeconds:Number(part.breakDurationSeconds||0),configuredDurationSeconds:Number(part.configuredDurationSeconds||0)});
  const [uploadedAudio,setUploadedAudio]=useState(null);
  const [saving,setSaving]=useState(false);
  const [removingAudio,setRemovingAudio]=useState(false);
  const dirty=(form.instructionHtml||'')!==(part.instructionHtml||'')||Number(form.breakDurationSeconds||0)!==Number(part.breakDurationSeconds||0)||Number(form.configuredDurationSeconds||0)!==Number(part.configuredDurationSeconds||0);
  useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
  const update=(key,value)=>setForm(current=>({...current,[key]:value}));
  const save=async()=>{
    if(locked||saving)return;
    setSaving(true);
    try{
      if(isWriting&&Number(form.configuredDurationSeconds||0)<=0){showMsg?.('Thời gian làm bài phải lớn hơn 0.','error');return;}
      const updated=await updateExamPartContent(examId,part.sectionId,part.id,{instructionHtml:form.instructionHtml||'',breakDurationSeconds:hasQuestionBreak?Number(form.breakDurationSeconds||0):0,configuredDurationSeconds:isWriting?Number(form.configuredDurationSeconds||0):0});
      onExamChange(updated);
      showMsg?.('Đã lưu thông tin Part.','success');
    }catch(error){showMsg?.(error.response?.data?.error||'Không thể lưu thông tin Part.','error');}
    finally{setSaving(false);}
  };
  const removeAudio=async()=>{
    if(!part.instructionAudioMediaId||removingAudio)return;
    setRemovingAudio(true);
    try{await deleteExamPartInstructionAudio(examId,part.sectionId,part.id);setUploadedAudio(null);await onReload();showMsg?.('Đã xóa audio hướng dẫn.','success');}
    catch(error){showMsg?.(error.response?.data?.error||'Không thể xóa audio hướng dẫn.','error');}
    finally{setRemovingAudio(false);}
  };
  const currentAudio=uploadedAudio||part.instructionAudio||(part.instructionAudioMediaId?{id:part.instructionAudioMediaId,mediaType:'AUDIO',originalName:'Audio hướng dẫn.mp3',url:''}:null);
  return <div className="exam-part-editor">
    <FormField label="Hướng dẫn"><RichTextEditor value={form.instructionHtml} onChange={value=>update('instructionHtml',value)} disabled={locked} minHeight="92px" variant="stitch"/></FormField>
    <FormField label="Audio hướng dẫn (MP3, tối đa 5MB)">
      <MediaUploader
        endpoint={`/api/exams/${examId}/sections/${part.sectionId}/parts/${part.id}/instruction-audio`}
        variant="content"
        items={currentAudio?[currentAudio]:[]}
        accept={['audio/mpeg','audio/mp3']}
        maxFileSize={5*1024*1024}
        multiple={false}
        height={82}
        note="Kéo thả hoặc chọn tệp MP3 · tối đa 5MB"
        disabled={locked||removingAudio}
        onUploaded={async(_file,media)=>{setUploadedAudio(media);await onReload();showMsg?.('Đã tải audio hướng dẫn.','success');}}
        onDelete={removeAudio}
      />
    </FormField>
    {hasQuestionBreak&&<FormField label="Thời gian nghỉ giữa các câu hỏi (giây)"><Input type="number" min="0" step="1" value={form.breakDurationSeconds} disabled={locked} onChange={event=>update('breakDurationSeconds',event.target.value)} /></FormField>}
    {isWriting&&<FormField label="Thời gian làm bài"><DurationInput value={form.configuredDurationSeconds} disabled={locked} onChange={value=>update('configuredDurationSeconds',value)}/></FormField>}
    {!locked&&<footer><Button type="button" size="sm" loading={saving} icon={<Save/>} onClick={save}>Lưu</Button></footer>}
  </div>;
}

function SectionCard({section,index,locked,onEdit,onDelete,onMove}){
  const partCount=Array.isArray(section.parts)?section.parts.length:0;
  return <article className="exam-section-card exam-section-summary-card">
    <header>
      <div className="exam-section-identity"><GripHorizontal/><i/><div><h3>Phần {index+1}: {section.title}</h3><p><b>{MODE_LABELS[section.examMode]||section.examMode}</b><span>•</span>Số câu cấu hình: <b>{section.questionCount}</b><span>•</span>Thời gian: <b>{Math.ceil(Number(section.configuredDurationSeconds||0)/60)} phút</b><span>•</span>{partCount} Part</p></div></div>
      {!locked&&<div className="exam-section-actions"><button type="button" onClick={()=>onMove(-1)} disabled={index===0}><ChevronUp/>Lên</button><button type="button" onClick={()=>onMove(1)}><ChevronDown/>Xuống</button><button type="button" onClick={onEdit}><Pencil/>Sửa</button><button type="button" className="danger" onClick={onDelete}><Trash2/>Xóa</button></div>}
    </header>
  </article>;
}

function PartCard({part,index,pointsPerQuestion,open,locked,query,onQuery,onToggle,onEdit,onDelete,onDropPart,onPick,onRemoveQuestion,onMoveQuestion}){
  const questions=useMemo(()=>part.questions.filter(question=>String(question.questionName||'').toLowerCase().includes(query.toLowerCase())),[part.questions,query]);
  const [showAll,setShowAll]=useState(false);const visible=query||showAll?questions:questions.slice(0,3);const remaining=questions.length-visible.length;
  const startPartDrag=event=>{event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-exam-part-index',String(index));};
  const dropPart=event=>{const raw=event.dataTransfer.getData('application/x-exam-part-index');if(raw==='')return;event.preventDefault();const source=Number(raw);if(Number.isInteger(source)&&source!==index)onDropPart(source);};
  const startQuestionDrag=(event,questionIndex)=>{event.stopPropagation();event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('application/x-exam-question-index',String(questionIndex));};
  const dropQuestion=(event,targetIndex)=>{const raw=event.dataTransfer.getData('application/x-exam-question-index');if(raw==='')return;event.preventDefault();event.stopPropagation();const source=Number(raw);if(Number.isInteger(source)&&source!==targetIndex)onMoveQuestion(source,targetIndex-source);};
  return <article className={`exam-section-card${open?' is-open':''}`} onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-exam-part-index'))event.preventDefault();}} onDrop={dropPart}><header><div className="exam-section-identity">{locked?<GripHorizontal/>:<button type="button" className="exam-part-drag-handle" draggable onDragStart={startPartDrag} title="Kéo để sắp xếp phần thi" aria-label="Kéo để sắp xếp phần thi"><GripHorizontal/></button>}<i/><div><h3>Phần {index+1}: {part.title}{part.partLabel&&<em>{part.partLabel}</em>}</h3><p>Thời lượng: <b>{part.durationMinutes||0} phút</b><span>•</span>Số lượng: <b>{part.subQuestionCount} câu hỏi</b><span>•</span>Điểm tối đa: <b>{part.subQuestionCount*pointsPerQuestion} điểm</b></p></div></div><div className="exam-section-actions">{!locked&&<><button type="button" onClick={onEdit}><Pencil/>Sửa tên</button><button type="button" className="danger" onClick={onDelete}><Trash2/>Xóa phần thi</button></>}<button type="button" className="collapse" title={open?'Thu gọn':'Mở rộng'} onClick={onToggle}>{open?<ChevronUp/>:<ChevronDown/>}</button></div></header>{open&&<div className="exam-section-body">{part.instruction&&<div className="exam-section-note"><Info/><span><b>Hướng dẫn:</b> <span dangerouslySetInnerHTML={{__html:part.instruction}}/></span></div>}<div className="exam-question-toolbar"><label><Search/><input value={query} onChange={event=>onQuery(event.target.value)} placeholder="Tìm kiếm câu hỏi trong phần này..."/></label>{!locked&&<button type="button" onClick={onPick}><BookOpen/>Chọn từ Ngân hàng câu hỏi</button>}</div><div className="exam-question-table-wrap"><table className="exam-question-table"><thead><tr><th>STT</th><th>MÃ CÂU</th><th>NỘI DUNG TÓM TẮT &amp; MEDIA ĐÍNH KÈM</th><th>DẠNG CÂU HỎI</th><th>ĐIỂM</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{visible.length?visible.map(question=>{const questionIndex=part.questions.indexOf(question);return <tr key={question.id} onDragOver={event=>{if(event.dataTransfer.types.includes('application/x-exam-question-index'))event.preventDefault();}} onDrop={event=>dropQuestion(event,questionIndex)}><td>{String(questionIndex+1).padStart(2,'0')}</td><td><code>{String(question.id).slice(0,8).toUpperCase()}</code></td><td><strong>{question.questionName}</strong><small>{question.groupName} • {question.subQuestionCount} câu hỏi con</small></td><td><span className={`question-type type-${question.questionType.toLowerCase()}`}>{typeName(question.questionType)}</span></td><td><b>{question.subQuestionCount*pointsPerQuestion} đ</b></td><td><span className="question-ready"><i/>{question.status==='ACTIVE'?'Sẵn sàng':statusName[question.status]}</span></td><td>{!locked&&<div><button type="button" className="reorder" title="Kéo để sắp xếp câu hỏi" disabled={part.questions.length<2} draggable={part.questions.length>1} onDragStart={event=>startQuestionDrag(event,questionIndex)}><GripHorizontal/></button><button type="button" className="danger" title="Gỡ khỏi đề" onClick={()=>onRemoveQuestion(question)}><Trash2/></button></div>}</td></tr>}):<tr><td colSpan="7" className="empty">{query?'Không tìm thấy câu hỏi phù hợp.':'Chưa có câu hỏi trong phần thi này.'}</td></tr>}</tbody></table></div><footer><span>Hiển thị <b>{visible.length} / {part.questions.length}</b> câu hỏi của Phần {index+1}</span>{!query&&questions.length>3&&<button type="button" onClick={()=>setShowAll(current=>!current)}>{showAll?'Thu gọn':`Xem thêm ${remaining} câu hỏi còn lại`}<ChevronDown/></button>}</footer></div>}</article>;
}
