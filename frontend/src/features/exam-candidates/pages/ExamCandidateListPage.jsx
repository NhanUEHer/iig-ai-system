import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import {
  Button, CodeText, ColumnVisibilityMenu, DataTable, DateTimeDisplay, FilterBar,
  ListPage, MultiSelectFilter, Pagination, StatusBadge, TableToolbar, UserCell,
} from '../../../design-system-v2';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { exportExamCandidates, getExamCandidateFilterOptions, listExamCandidates } from '../../../services/examCandidateService';
import './ExamCandidateListPage.css';

const STATUS_LABELS = { REGISTERED: 'Chưa thi', IN_PROGRESS: 'Đang làm bài', SUBMITTED: 'Đã nộp bài', EXPIRED: 'Hết giờ', CANCELLED: 'Đã hủy' };
const STATUS_TONES = { REGISTERED: 'inactive', IN_PROGRESS: 'processing', SUBMITTED: 'completed', EXPIRED: 'failed', CANCELLED: 'disabled' };
const ALL_COLUMN_KEYS = ['candidate', 'contact', 'school', 'exam', 'status', 'startedAt', 'submittedAt', 'duration', 'result', 'score'];

const durationLabel = seconds => {
  if (seconds == null) return '—';
  const value = Math.max(0, Number(seconds));
  return `${Math.floor(value / 60)} phút ${value % 60} giây`;
};
const scoreRange = activity => activity.scoreRangeMin == null ? '—' : `${activity.scoreRangeMin}–${activity.scoreRangeMax ?? activity.scoreRangeMin}`;
const serializeFilters = filters => ({
  ...filters,
  search: filters.search || undefined,
  examIds: filters.examIds.join(',') || undefined,
  attemptStatuses: filters.attemptStatuses.join(',') || undefined,
  schools: filters.schools.join(',') || undefined,
});

export default function ExamCandidateListPage({ showMsg, canExport = false }) {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [filters, setFilters] = useState({ search: '', examIds: [], attemptStatuses: [], schools: [], page: 1, limit: 10 });
  const [result, setResult] = useState({ data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 1 } });
  const [options, setOptions] = useState({ exams: [], schools: [], attemptStatuses: [] });
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(ALL_COLUMN_KEYS);
  const showMsgRef = useRef(showMsg);

  useEffect(() => { showMsgRef.current = showMsg; }, [showMsg]);
  useEffect(() => setFilters(current => current.search === debouncedSearch.trim() ? current : { ...current, search: debouncedSearch.trim(), page: 1 }), [debouncedSearch]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setResult(await listExamCandidates(serializeFilters(filters))); }
    catch (requestError) {
      const message = requestError.response?.data?.error || 'Không thể tải danh sách thí sinh.';
      setError(message); showMsgRef.current?.(message, 'error');
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setOptionsLoading(true);
    getExamCandidateFilterOptions().then(setOptions).catch(() => setOptions({ exams: [], schools: [], attemptStatuses: [] })).finally(() => setOptionsLoading(false));
  }, []);

  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value, ...(key === 'page' ? {} : { page: 1 }) }));
  const clearFilters = () => {
    setSearch('');
    setFilters(current => ({ ...current, search: '', examIds: [], attemptStatuses: [], schools: [], page: 1 }));
  };
  const download = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const blob = await exportExamCandidates(serializeFilters(filters));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `danh-sach-thi-sinh-${new Date().toISOString().slice(0, 10)}.xlsx`; link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) { showMsg?.(requestError.response?.data?.error || 'Không thể xuất dữ liệu thí sinh.', 'error'); }
    finally { setExporting(false); }
  };

  const meta = result.meta || {};
  const allColumns = useMemo(() => [
    { key: 'candidate', label: 'Thí sinh', sortable: true, width: 210, sortValue: row => row.candidate.fullName, render: row => <UserCell name={row.candidate.fullName} description={`SBD: ${row.candidate.candidateNumber}`} /> },
    { key: 'contact', label: 'Liên hệ', width: 200, render: row => <span className="candidate-list__stack"><strong>{row.candidate.phone || '—'}</strong><small>{row.candidate.email || '—'}</small></span> },
    { key: 'school', label: 'Trường / Đơn vị', sortable: true, width: 190, sortValue: row => row.candidate.schoolName, render: row => row.candidate.schoolName || '—' },
    { key: 'exam', label: 'Đề thi', sortable: true, width: 260, sortValue: row => row.exam?.title || '', render: row => <span className="candidate-list__stack"><strong>{row.exam?.title || 'Chưa chọn đề'}</strong>{row.exam?.code && <CodeText className="iig3-list-code">{row.exam.code}</CodeText>}</span> },
    { key: 'status', label: 'Trạng thái', sortable: true, width: 170, sortValue: row => row.activity.status, render: row => <span className="candidate-list__stack"><StatusBadge status={STATUS_TONES[row.activity.status]} label={STATUS_LABELS[row.activity.status] || row.activity.status} /><small>{row.activity.answeredCount == null ? 'Chưa có dữ liệu' : `${row.activity.answeredCount}/${row.activity.totalQuestions} câu đã làm`}</small></span> },
    { key: 'startedAt', label: 'Bắt đầu', sortable: true, sortType: 'date', width: 160, sortValue: row => row.activity.startedAt, render: row => <DateTimeDisplay value={row.activity.startedAt} /> },
    { key: 'submittedAt', label: 'Nộp bài', sortable: true, sortType: 'date', width: 160, sortValue: row => row.activity.submittedAt, render: row => <DateTimeDisplay value={row.activity.submittedAt} /> },
    { key: 'duration', label: 'Thời gian làm', sortable: true, sortType: 'number', width: 140, sortValue: row => row.activity.durationSeconds, render: row => durationLabel(row.activity.durationSeconds) },
    { key: 'result', label: 'Kết quả', width: 160, render: row => <span className="candidate-list__stack"><strong>{row.activity.correctCount ?? '—'} đúng · {row.activity.incorrectCount ?? '—'} sai</strong><small>Dãy điểm: {scoreRange(row.activity)}</small></span> },
    { key: 'score', label: 'Điểm', sortable: true, sortType: 'number', align: 'right', width: 110, sortValue: row => row.activity.totalScore, render: row => <strong>{row.activity.totalScore ?? '—'}{row.activity.maxScore != null ? ` / ${row.activity.maxScore}` : ''}</strong> },
  ], []);
  const columns = allColumns.filter(column => visibleColumnKeys.includes(column.key));
  const appliedCount = filters.examIds.length + filters.attemptStatuses.length + filters.schools.length;
  const exportButton = canExport ? <Button variant="outline" size="sm" icon={<Download />} loading={exporting} onClick={download}>{exporting ? 'Đang xuất…' : 'Xuất Excel'}</Button> : null;

  return <div className="iig3-list-screen candidate-list-page"><ListPage
    breadcrumb={[{ label: 'Quản lý thí sinh' }, { label: 'Danh sách thí sinh' }]}
    title="Danh sách thí sinh"
    toolbar={<>
      <TableToolbar title="Tất cả thí sinh" count={meta.total || 0} loading={loading} actions={exportButton} view={<ColumnVisibilityMenu columns={allColumns} visibleKeys={visibleColumnKeys} requiredKeys={['candidate']} onChange={setVisibleColumnKeys} />} />
      <FilterBar
        search={search}
        onSearch={event => setSearch(event.target.value)}
        placeholder="Tìm tên, SBD, email, số điện thoại hoặc đề thi…"
        filters={<>
          <MultiSelectFilter label="Đề thi" options={options.exams || []} value={filters.examIds} onChange={value => setFilter('examIds', value)} placeholder="Tất cả đề thi" searchPlaceholder="Tìm đề thi…" loading={optionsLoading} />
          <MultiSelectFilter label="Trạng thái" options={options.attemptStatuses || []} value={filters.attemptStatuses} onChange={value => setFilter('attemptStatuses', value)} placeholder="Tất cả trạng thái" searchPlaceholder="Tìm trạng thái…" loading={optionsLoading} />
          <MultiSelectFilter label="Trường / Đơn vị" options={options.schools || []} value={filters.schools} onChange={value => setFilter('schools', value)} placeholder="Tất cả trường / đơn vị" searchPlaceholder="Tìm trường / đơn vị…" loading={optionsLoading} />
        </>}
        appliedCount={appliedCount}
        onClear={clearFilters}
        loading={loading}
      />
    </>}
    table={<DataTable
      ariaLabel="Danh sách thí sinh"
      columns={columns}
      rows={result.data || []}
      rowKey="id"
      loading={loading}
      error={error}
      errorAction={<Button variant="outline" size="sm" icon={<RotateCcw />} onClick={load}>Thử lại</Button>}
      emptyTitle="Chưa có thí sinh"
      emptyDescription="Không có hoạt động thí sinh phù hợp với bộ lọc hiện tại."
      emptyAction={appliedCount || search ? <Button variant="outline" size="sm" onClick={clearFilters}>Xóa bộ lọc</Button> : null}
    />}
    pagination={<Pagination page={meta.page || 1} pageCount={meta.totalPages || 1} pageSize={meta.limit || 10} total={meta.total || 0} loading={loading} onPage={page => setFilter('page', page)} onPageSize={limit => setFilter('limit', limit)} />}
  /></div>;
}
