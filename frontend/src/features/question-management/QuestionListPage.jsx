import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { Breadcrumb, Button, DataTable, DateDisplay, Pagination } from '../../components/ui';
import SearchInput from '../../components/ui/SearchInput';
import MultiSelectFilter from '../../components/ui/MultiSelectFilter';
import QuestionBankRowActions from '../question-bank/components/QuestionBankRowActions';
import { useDialog } from '../../components/feedback/dialogContext';
import { deleteQuestion, getQuestionFilterOptions, listManagedQuestionGroups, listQuestions } from '../../services/questionBankService';
import { apiError, QUESTION_STATUSES, QUESTION_TYPES, statusLabel, typeLabel } from './constants';
import './question-management.css';

export default function QuestionListPage({ navigate, showMsg }) {
  const { confirm } = useDialog();
  const [query, setQuery] = useState({ search: '', groupIds: [], questionTypes: [], statuses: [], page: 1, limit: 10 });
  const [groups, setGroups] = useState([]);
  const [types, setTypes] = useState(QUESTION_TYPES);
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0 } });
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setFilter = (key, value) => { setSelected([]); setQuery(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) })); };
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await listQuestions({ ...query, groupIds: query.groupIds.join(','), questionTypes: query.questionTypes.join(','), statuses: query.statuses.join(',') });
      setResult(response);
    } catch (requestError) { setError(apiError(requestError, 'Không thể tải danh sách câu hỏi.')); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    listManagedQuestionGroups({ page: 1, limit: 100, statuses: 'ACTIVE,INACTIVE,DRAFT' }).then(response => setGroups(response.data || [])).catch(() => {});
    getQuestionFilterOptions().then(response => setTypes(response.data?.questionTypes || QUESTION_TYPES)).catch(() => {});
  }, []);
  const remove = async row => {
    if (!await confirm({ title: 'Xóa câu hỏi?', message: `Câu hỏi “${row.questionName}” sẽ bị xóa cùng nội dung liên quan.`, confirmText: 'Xóa câu hỏi' })) return;
    try { await deleteQuestion(row.id); showMsg?.('Đã xóa câu hỏi.', 'success'); load(); }
    catch (requestError) { showMsg?.(apiError(requestError, 'Không thể xóa câu hỏi.'), 'error'); }
  };
  const meta = result.meta || {};
  const columns = [
    { key: 'stt', label: 'STT', className: 'is-center qm-col-stt', width: 64, render: (_row, index) => ((meta.page || 1) - 1) * (meta.limit || 10) + index + 1 },
    { key: 'questionName', label: 'Tên câu hỏi', className: 'qm-col-name', render: row => <button className="qm-title-link" type="button" onClick={() => navigate(`/question-bank/${row.id}/edit`)}>{row.questionName}</button> },
    { key: 'code', label: 'Mã câu hỏi', className: 'qm-col-code', width: 128, render: row => <code>{row.code}</code> },
    { key: 'questionType', label: 'Dạng câu hỏi', width: 145, render: row => typeLabel(row.questionType) },
    { key: 'groupName', label: 'Nhóm câu hỏi', className: 'qm-col-group', render: row => row.groupName || '—' },
    { key: 'subQuestionCount', label: 'Số câu hỏi', className: 'is-center', width: 110, render: row => row.subQuestionCount || 0 },
    { key: 'updatedAt', label: 'Ngày cập nhật', width: 150, render: row => <DateDisplay value={row.updatedAt} includeTime /> },
    { key: 'status', label: 'Trạng thái', className: 'is-center', width: 145, render: row => <span className={`qm-status is-${String(row.status).toLowerCase()}`}><i />{statusLabel(row.status)}</span> },
    { key: 'actions', label: 'Thao tác', className: 'is-center', width: 82, render: row => <QuestionBankRowActions actions={[{ label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => navigate(`/question-bank/${row.id}/edit`) }, { label: 'Xóa câu hỏi', icon: <Trash2 />, danger: true, onClick: () => remove(row) }]} /> },
  ];
  return <section className="question-bank-page qm-page">
    <header className="question-bank-topbar"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Ngân hàng câu hỏi' }, { label: 'Danh sách ngân hàng câu hỏi', current: true }]} /></header>
    <main className="question-bank-workspace">
      <section className="question-bank-filter-card"><div className="question-bank-filter-row"><div className="question-bank-filters">
        <SearchInput value={query.search} onChange={event => setFilter('search', event.target.value)} onClear={() => setFilter('search', '')} placeholder="Tìm tên, mã câu hỏi..." />
        <MultiSelectFilter options={types} value={query.questionTypes} onApply={value => setFilter('questionTypes', value)} placeholder="Tất cả dạng câu hỏi" selectedLabel="Dạng câu hỏi" allLabel="Tất cả dạng câu hỏi" searchPlaceholder="Tìm dạng câu hỏi..." />
        <MultiSelectFilter options={groups.map(group => ({ value: group.id, label: group.name }))} value={query.groupIds} onApply={value => setFilter('groupIds', value)} placeholder="Tất cả nhóm câu hỏi" selectedLabel="Nhóm câu hỏi" allLabel="Tất cả nhóm câu hỏi" searchPlaceholder="Tìm nhóm câu hỏi..." />
        <MultiSelectFilter options={QUESTION_STATUSES} value={query.statuses} onApply={value => setFilter('statuses', value)} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." />
      </div><Button size="sm" className="question-bank-create-button" icon={<Plus />} onClick={() => navigate('/question-bank/new')}>Thêm mới</Button></div></section>
      <section className="question-bank-table-card qm-table-card"><DataTable columns={columns} data={result.data || []} rowKey="id" loading={loading} error={error} selectable selectedRowKeys={selected} onSelectionChange={setSelected} /><Pagination summaryLabel="Tổng" page={meta.page || 1} pageSize={meta.limit || 10} total={meta.total || 0} onPageChange={page => { setSelected([]); setFilter('page', page); }} onPageSizeChange={limit => { setSelected([]); setQuery(current => ({ ...current, limit, page: 1 })); }} /></section>
    </main>
  </section>;
}
