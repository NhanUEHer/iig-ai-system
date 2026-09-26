import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, MoreVertical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { deleteQuestion, getQuestionFilterOptions, listQuestionTags, listQuestions } from '../../../services/questionBankService';
import Button from '../../../components/ui/Button';
import { DataTable, Pagination } from '../../../components/ui/DataTable';
import SearchInput from '../../../components/ui/SearchInput';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import { useDialog } from '../../../components/feedback/dialogContext';
import './QuestionBankListPage.css';
import './QuestionBankRowMenu.css';
import './QuestionBankStitchOverrides.css';
import './QuestionBankToolbar.css';
import './QuestionBankTopbar.css';
import './QuestionBankFilterCompact.css';

const statusLabel = { DRAFT: 'Bản nháp', ACTIVE: 'Hoạt động', INACTIVE: 'Dừng hoạt động' };
const fallbackTypes = [{ value: 'MCQ_SINGLE', label: 'Dạng 3: MCQ', count: 0 }, { value: 'RECORD', label: 'Dạng Record', count: 0 }, { value: 'WRITING', label: 'Dạng Writing', count: 0 }];
const formatDate = value => value ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', year: '2-digit', hour12: false }).format(new Date(value)).replace(',', '') : '—';
const statusOptions = [{ value: 'ACTIVE', label: 'Hoạt động' }, { value: 'INACTIVE', label: 'Dừng hoạt động' }, { value: 'DRAFT', label: 'Bản nháp' }];
function QuestionActions({ row, navigate, onDelete }) {
  const [open, setOpen] = useState(false);
  return <div className="question-bank-row-menu"><button type="button" aria-label="Thao tác" title="Thao tác" onClick={() => setOpen(current => !current)}><MoreVertical /></button>{open && <div><button type="button" onClick={() => navigate(`/question-bank/${row.id}/edit`)}><Pencil />Chỉnh sửa</button>{row.status !== 'ACTIVE' && <button type="button" className="is-danger" onClick={() => { setOpen(false); onDelete(row.id); }}><Trash2 />Xóa câu hỏi</button>}</div>}</div>;
}

export default function QuestionBankListPage({ navigate, showMsg }) {
  const { confirm: confirmDialog } = useDialog();
  const [filters, setFilters] = useState({ search: '', groupIds: [], questionTypes: [], tagIds: [], statuses: [], page: 1, limit: 10 });
  const [tags, setTags] = useState([]); const [typeOptions, setTypeOptions] = useState(fallbackTypes);
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } }); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [selected, setSelected] = useState([]);
  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const load = useCallback(async () => { setLoading(true); setError(''); try { setResult(await listQuestions({ ...filters, groupIds: filters.groupIds.join(','), questionTypes: filters.questionTypes.join(','), tagIds: filters.tagIds.join(','), statuses: filters.statuses.join(',') })); } catch (error) { setError(error.response?.data?.error || 'Không thể tải ngân hàng câu hỏi.'); } finally { setLoading(false); } }, [filters]);
  const filterContext = useMemo(() => ({ search: filters.search, tagIds: filters.tagIds.join(','), statuses: filters.statuses.join(',') }), [filters.search, filters.tagIds, filters.statuses]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listQuestionTags().then(response => setTags(response.data || [])).catch(() => {}); }, []);
  useEffect(() => { getQuestionFilterOptions(filterContext).then(response => setTypeOptions(response.data?.questionTypes || fallbackTypes)).catch(() => setTypeOptions(fallbackTypes)); }, [filterContext]);
  const remove = async id => { if (!await confirmDialog({ title: 'Xóa câu hỏi?', message: 'Câu hỏi, nội dung và các câu hỏi con liên quan sẽ bị xóa.', confirmText: 'Xóa câu hỏi' })) return; try { await deleteQuestion(id); showMsg?.('Đã xóa câu hỏi.', 'success'); load(); } catch (error) { showMsg?.(error.response?.data?.error || 'Không thể xóa câu hỏi.', 'error'); } };
  const removeSelected = async ids => { if (!ids.length || !await confirmDialog({ title: `Xóa ${ids.length} câu hỏi?`, message: 'Các câu hỏi đang được sử dụng trong đề thi sẽ được giữ lại.', confirmText: 'Xóa câu hỏi' })) return; const settled = await Promise.allSettled(ids.map(deleteQuestion)); setSelected([]); await load(); const deleted = settled.filter(item => item.status === 'fulfilled').length; if (deleted) showMsg?.(`Đã xóa ${deleted} câu hỏi.`, 'success'); if (deleted !== settled.length) showMsg?.(`${settled.length - deleted} câu hỏi không thể xóa.`, 'error'); };
  const clearFilters = () => setFilters(current => ({ ...current, search: '', groupIds: [], questionTypes: [], tagIds: [], statuses: [], page: 1 }));
  const summaries = [{ key: 'questionTypes', label: 'Dạng câu hỏi', values: typeOptions, selected: filters.questionTypes }, { key: 'tagIds', label: 'Tag', values: tags, selected: filters.tagIds }, { key: 'statuses', label: 'Trạng thái', values: statusOptions, selected: filters.statuses }];
  const columns = [
    { key: 'questionName', label: 'Tên câu hỏi', render: row => <button className="question-bank-title" type="button" onClick={() => navigate(`/question-bank/${row.id}/edit`)}>{row.questionName}</button> },
    { key: 'id', label: 'Mã câu hỏi', render: row => <code>{String(row.id).slice(0, 8).toUpperCase()}</code> },
    { key: 'questionType', label: 'Dạng câu hỏi', render: row => typeOptions.find(item => item.value === row.questionType)?.label || row.questionType },
    { key: 'groupName', label: 'Nhóm câu hỏi', render: row => row.groupName || '—' },
    { key: 'subQuestionCount', label: 'Số câu hỏi', className: 'is-center', render: row => row.subQuestionCount || 0 },
    { key: 'updatedAt', label: 'Ngày cập nhật', render: row => formatDate(row.updatedAt) },
    { key: 'status', label: 'Trạng thái', className: 'is-center', render: row => <span className={`question-bank-status is-${String(row.status).toLowerCase()}`}><i />{statusLabel[row.status] || row.status}</span> },
    { key: 'actions', label: 'Thao tác', className: 'question-bank-actions is-center', render: row => <QuestionActions row={row} navigate={navigate} onDelete={remove} /> },
  ];
  return <section className="question-bank-page">
    <header className="question-bank-topbar"><nav aria-label="Breadcrumb"><span>Ngân hàng câu hỏi</span><ChevronRight /><strong>Danh sách ngân hàng câu hỏi</strong></nav></header>
    <div className="question-bank-workspace"><section className="question-bank-filter-card">
      <div className="question-bank-filter-row"><div className="question-bank-filters"><SearchInput value={filters.search} onChange={event => updateFilter('search', event.target.value)} onClear={() => updateFilter('search', '')} placeholder="Tìm tiêu đề, nội dung..." /><MultiSelectFilter options={typeOptions} value={filters.questionTypes} onApply={value => updateFilter('questionTypes', value)} placeholder="Tất cả dạng câu hỏi" selectedLabel="Dạng câu hỏi" allLabel="Tất cả dạng câu hỏi" searchPlaceholder="Tìm dạng câu hỏi..." /><MultiSelectFilter options={tags.map(tag => ({ value: tag.id, label: tag.name }))} value={filters.tagIds} onApply={value => updateFilter('tagIds', value)} placeholder="Phân loại (Tag)" selectedLabel="Tag" allLabel="Tất cả Tag" searchPlaceholder="Tìm Tag..." /><MultiSelectFilter options={statusOptions} value={filters.statuses} onApply={value => updateFilter('statuses', value)} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." /></div><Button className="question-bank-create-button" size="sm" icon={<Plus />} onClick={() => navigate('/question-bank/new')}>Thêm mới</Button></div>
      {(filters.search || summaries.some(item => item.selected.length)) && <div className="question-bank-active-filters"><span>Đang lọc:</span>{summaries.filter(item => item.selected.length).map(item => <span className="question-bank-filter-chip" key={item.key}>{item.label}: {item.values.filter(value => item.selected.includes(value.value || value.id)).map(value => value.label || value.name).join(', ')}<button type="button" onClick={() => updateFilter(item.key, [])}><X /></button></span>)}<button className="question-bank-clear-filters" type="button" onClick={clearFilters}><Trash2 />Xóa tất cả bộ lọc</button></div>}
    </section><section className="question-bank-table-card"><DataTable columns={columns} data={result.data || []} rowKey="id" selectable selectedRowKeys={selected} onSelectionChange={setSelected} bulkActions={[{ label: 'Xóa', icon: <Trash2 />, danger: true, onClick: removeSelected }]} loading={loading} error={error} /><Pagination summaryLabel="Tổng" page={result.meta?.page || 1} pageSize={result.meta?.limit || 10} total={result.meta?.total || 0} onPageChange={page => updateFilter('page', page)} onPageSizeChange={limit => setFilters(current => ({ ...current, limit, page: 1 }))} /></section></div>
  </section>;
}
