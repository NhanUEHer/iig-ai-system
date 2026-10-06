import React, { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Pencil, Plus, X } from 'lucide-react';
import { listExams } from '../../../services/examService';
import Button from '../../../components/ui/Button';
import { DataTable, Pagination } from '../../../components/ui/DataTable';
import { Breadcrumb } from '../../../components/ui/Layout';
import SearchInput from '../../../components/ui/SearchInput';
import MultiSelectFilter from '../../../components/ui/MultiSelectFilter';
import QuestionBankRowActions from '../../question-bank/components/QuestionBankRowActions';
import { EXAM_STATUS_OPTIONS, examStatusMeta } from '../examStatus';
import './ExamPages.css';
import './ExamListPage.css';
import './ExamListPageOverrides.css';
import '../../question-bank/pages/QuestionBankRowMenu.css';

const EXAM_TYPE_OPTIONS = [
  { value: 'LISTENING_READING', label: 'Listening & Reading' },
  { value: 'READING', label: 'Reading' },
  { value: 'LISTENING', label: 'Listening' },
  { value: 'SPEAKING_WRITING', label: 'Speaking & Writing' },
  { value: 'SPEAKING', label: 'Speaking' },
  { value: 'WRITING', label: 'Writing' },
];

const formatDate = value => value
  ? new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric', year: '2-digit', hour12: false }).format(new Date(value)).replace(',', '')
  : '—';

function formatDuration(value) {
  const seconds = Math.max(0, Number(value || 0));
  if (!seconds) return '0 phút';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.ceil((seconds % 3600) / 60);
  if (!hours) return `${minutes} phút`;
  return minutes ? `${hours} giờ ${minutes} phút` : `${hours} giờ`;
}

export default function ExamListPage({ navigate }) {
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ search: '', statuses: [], examTypes: [], page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key !== 'page' ? { page: 1 } : {}) }));
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await listExams({ ...filters, statuses: filters.statuses.join(','), examTypes: filters.examTypes.join(',') }));
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Không thể tải danh sách đề thi.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters(current => current.search === searchInput.trim()
        ? current
        : { ...current, search: searchInput.trim(), page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const clearFilters = () => {
    setSearchInput('');
    setFilters(current => ({ ...current, search: '', statuses: [], examTypes: [], page: 1 }));
  };
  const typeLabel = value => EXAM_TYPE_OPTIONS.find(option => option.value === value)?.label || 'Chưa phân loại';
  const columns = [
    { key: 'number', label: 'STT', className: 'is-center', width: 64, render: (_row, index) => (Number(result.meta?.page || 1) - 1) * Number(result.meta?.limit || filters.limit) + index + 1 },
    { key: 'examCode', label: 'Mã đề thi', width: 118, render: row => <code className="exam-list-code">{row.examCode || '—'}</code> },
    { key: 'title', label: 'Tên đề thi', render: row => <button type="button" className="exam-list-title-button" onClick={() => navigate(`/exams/${row.id}/edit`)}>{row.title}</button> },
    { key: 'examType', label: 'Kiểu đề thi', render: row => <span className={`exam-list-type${row.examType ? '' : ' is-unclassified'}`}>{typeLabel(row.examType)}</span> },
    { key: 'status', label: 'Trạng thái', className: 'is-center', render: row => { const meta = examStatusMeta(row.status); return <span className={`exam-list-status is-${meta.tone}`}><i />{meta.label}</span>; } },
    { key: 'sectionCount', label: 'Số phần thi', className: 'is-center', render: row => Number(row.sectionCount || 0) },
    { key: 'subQuestionCount', label: 'Số câu hỏi', className: 'is-center', render: row => Number(row.subQuestionCount || 0) },
    { key: 'configuredDurationSeconds', label: 'Thời gian', className: 'is-center', render: row => formatDuration(row.configuredDurationSeconds) },
    { key: 'updatedAt', label: 'Ngày cập nhật', render: row => <span className="exam-list-date">{formatDate(row.updatedAt)}</span> },
    { key: 'actions', label: 'Thao tác', className: 'question-bank-actions is-center', width: 82, render: row => <QuestionBankRowActions actions={[{ label: 'Chỉnh sửa', icon: <Pencil />, onClick: () => navigate(`/exams/${row.id}/edit`) }]} /> },
  ];
  const hasFilters = Boolean(searchInput || filters.statuses.length || filters.examTypes.length);

  return <section className="exam-list-page">
    <header className="exam-list-header"><Breadcrumb separator={<ChevronRight />} items={[{ label: 'Quản lý đề thi' }, { label: 'Danh sách đề thi', current: true }]} /></header>
    <main className="exam-list-main">
      <section className="exam-list-filter-card">
        <div className="exam-list-filters">
          <SearchInput value={searchInput} onChange={event => setSearchInput(event.target.value)} onClear={() => setSearchInput('')} placeholder="Tìm tên đề thi, mã đề..." />
          <MultiSelectFilter options={EXAM_TYPE_OPTIONS} value={filters.examTypes} onApply={value => updateFilter('examTypes', value)} placeholder="Tất cả kiểu đề" selectedLabel="Kiểu đề" allLabel="Tất cả kiểu đề" searchPlaceholder="Tìm kiểu đề..." />
          <MultiSelectFilter options={EXAM_STATUS_OPTIONS} value={filters.statuses} onApply={value => updateFilter('statuses', value)} placeholder="Tất cả trạng thái" selectedLabel="Trạng thái" allLabel="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái..." />
        </div>
        <Button size="sm" className="exam-list-add" icon={<Plus />} onClick={() => navigate('/exams/new')}>Thêm đề thi</Button>
        {hasFilters && <div className="exam-list-active-filters">
          <span>Đang lọc:</span>
          {filters.examTypes.length > 0 && <span className="exam-list-filter-chip">Kiểu đề: {EXAM_TYPE_OPTIONS.filter(option => filters.examTypes.includes(option.value)).map(option => option.label).join(', ')}<button type="button" onClick={() => updateFilter('examTypes', [])}><X /></button></span>}
          {filters.statuses.length > 0 && <span className="exam-list-filter-chip">Trạng thái: {EXAM_STATUS_OPTIONS.filter(option => filters.statuses.includes(option.value)).map(option => option.label).join(', ')}<button type="button" onClick={() => updateFilter('statuses', [])}><X /></button></span>}
          <button className="exam-list-clear-filters" type="button" onClick={clearFilters}>Xóa tất cả bộ lọc</button>
        </div>}
      </section>
      <section className="exam-list-table-card">
        <DataTable columns={columns} data={result.data || []} rowKey="id" loading={loading} error={error} />
        <Pagination summaryLabel="Tổng" page={result.meta?.page || 1} pageSize={result.meta?.limit || filters.limit} total={result.meta?.total || 0} onPageChange={page => updateFilter('page', page)} onPageSizeChange={limit => setFilters(current => ({ ...current, limit, page: 1 }))} />
      </section>
    </main>
  </section>;
}
