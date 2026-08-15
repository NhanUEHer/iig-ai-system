import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, FileText, Landmark, RefreshCw, Search, X } from 'lucide-react';
import api from '../../../services/api';
import './BankTransactionsPage.css';
import './StatementSourcePreview.css';
import './ExpensePagesSystemDesign.css';
import './BankTransactionsPolish.css';

const money = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const date = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';
const kind = row => Number(row.fee_amount) > 0 ? 'fee' : Number(row.credit_amount) > 0 ? 'credit' : 'debit';
const kindLabel = value => ({ debit: 'Ghi nợ', credit: 'Ghi có', fee: 'Phí' }[value]);
const COST_GROUPS = {
  'Quảng cáo trực tuyến': ['Facebook Ads', 'Google Ads', 'TikTok Ads', 'Cốc Cốc Ads'],
  'Phần mềm & dịch vụ số': ['Thiết kế - Canva', 'AI & trợ lý', 'Apple Services'],
  'Đào tạo & phát triển': ['Thi cử & chứng chỉ', 'Nền tảng học tập'],
  'Chi tiêu cá nhân': ['Mua sắm', 'Ăn uống', 'Đi lại', 'Giải trí', 'Lưu trú & du lịch'],
  'Chi phí tài chính': ['Phí giao dịch độc lập'],
  'Chi phí khác': ['Chưa xác định'],
};
const EMPTY_FILTERS = { search: '', bankCode: '', accountId: '', type: '', category: '', subcategory: '', fromDate: '', toDate: '' };
const TechcombankStatementViewer = lazy(() => import('../components/TechcombankStatementViewer'));
const VibStatementViewer = lazy(() => import('../components/VibStatementViewer'));
const supportsAnchoredPreview = bankCode => ['TECHCOMBANK', 'TPBANK', 'VPBANK'].includes(bankCode);

export default function BankTransactionsPage({ showMsg }) {
  const [bootstrap, setBootstrap] = useState(null);
  const [data, setData] = useState({ items: [], summary: {}, pagination: { page: 1, pages: 1, total: 0 } });
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const showMsgRef = useRef(showMsg);
  showMsgRef.current = showMsg;
  const accounts = useMemo(() => bootstrap?.accounts?.filter(account => !filters.bankCode || account.bank_code === filters.bankCode) || [], [bootstrap, filters.bankCode]);

  const load = useCallback(async (page = 1, currentFilters = EMPTY_FILTERS) => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries({ ...currentFilters, page, limit: 50 }).filter(([, value]) => value !== ''));
      const response = await api.get('/expenses/transactions', { params });
      setData(response.data.data);
    } catch (error) { showMsgRef.current(error.response?.data?.error || 'Không thể tải danh sách giao dịch.', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    api.get('/expenses/bootstrap').then(response => setBootstrap(response.data.data)).catch(error => showMsgRef.current(error.response?.data?.error || 'Không thể tải tài khoản ngân hàng.', 'error'));
    load(1, EMPTY_FILTERS);
  }, [load]);

  const submit = event => { event.preventDefault(); load(1, filters); };
  const reset = () => { setFilters(EMPTY_FILTERS); load(1, EMPTY_FILTERS); };
  const closePreview = () => setPreview(current => {
    if (current?.url?.startsWith('blob:')) URL.revokeObjectURL(current.url);
    return null;
  });
  const openSource = async row => {
    closePreview();
    setPreview({ filename: row.original_filename, bankCode: row.bank_code, account: row.account_number_masked, anchor: row.raw_data?.sourceAnchor || null, sourceRow: row.source_row, rows: [], url: null, error: null });
    setPreviewLoading(true);
    try {
      const [response, detailResponse] = await Promise.all([
        api.get(`/expenses/imports/${row.import_id}/source`, { responseType: 'arraybuffer' }),
        row.bank_code === 'VIB' ? api.get(`/expenses/imports/${row.import_id}`) : Promise.resolve(null),
      ]);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreview(current => current ? ({ ...current, url, rows: detailResponse?.data?.data?.transactions || [] }) : (URL.revokeObjectURL(url), null));
    } catch (error) { setPreview(current => ({ ...current, error: error.response?.data?.error || 'Không thể mở file sao kê nguồn.' })); }
    finally { setPreviewLoading(false); }
  };
  const summary = data.summary || {};

  return <div className="bank-transactions-page"><div className="bank-transactions-shell">
    <header className="bank-transactions-header"><div className="bank-transactions-title"><div><small>CHI PHÍ · GIAO DỊCH ĐÃ XÁC NHẬN</small><h1>Giao dịch ngân hàng</h1><p>Danh sách tổng hợp từ các sao kê đã kiểm tra và xác nhận import.</p></div></div><button onClick={() => load(data.pagination.page, filters)}><RefreshCw/>Làm mới</button></header>
    <section className="bank-transaction-stats"><article><span>Tổng giao dịch</span><strong>{money(summary.transaction_count)}</strong><small>Từ {summary.account_count || 0} tài khoản/thẻ</small></article><article className="debit"><span>Tổng ghi nợ</span><strong>{money(summary.total_debit)}</strong><small>Khoản chi và phí đã hạch toán</small></article><article className="credit"><span>Tổng ghi có</span><strong>{money(summary.total_credit)}</strong><small>Thanh toán, hoàn tiền, điều chỉnh</small></article><article className="fee"><span>Tổng phí</span><strong>{money(summary.total_fee)}</strong><small>Đã nằm trong tổng ghi nợ</small></article></section>
    <form className="bank-transaction-filters" onSubmit={submit}><label className="search"><span>Tìm kiếm</span><div><Search/><input value={filters.search} onChange={event => setFilters({ ...filters, search: event.target.value })} placeholder="Diễn giải hoặc tên file..."/></div></label><label><span>Ngân hàng</span><select value={filters.bankCode} onChange={event => setFilters({ ...filters, bankCode: event.target.value, accountId: '' })}><option value="">Tất cả ngân hàng</option>{bootstrap?.banks?.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label><label><span>Tài khoản/thẻ</span><select value={filters.accountId} onChange={event => setFilters({ ...filters, accountId: event.target.value })}><option value="">Tất cả tài khoản</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.account_name} · {account.account_number_masked}</option>)}</select></label><label><span>Loại</span><select value={filters.type} onChange={event => setFilters({ ...filters, type: event.target.value })}><option value="">Tất cả</option><option value="debit">Ghi nợ</option><option value="credit">Ghi có</option><option value="fee">Phí giao dịch</option></select></label><label><span>Nhóm chi phí</span><select value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value, subcategory: '' })}><option value="">Tất cả nhóm</option>{Object.keys(COST_GROUPS).map(value => <option key={value}>{value}</option>)}</select></label><label><span>Nhóm chi phí con</span><select value={filters.subcategory} onChange={event => setFilters({ ...filters, subcategory: event.target.value })}><option value="">Tất cả nhóm con</option>{(filters.category ? COST_GROUPS[filters.category] : Object.values(COST_GROUPS).flat()).map(value => <option key={value}>{value}</option>)}</select></label><label><span>Từ ngày</span><input type="date" value={filters.fromDate} onChange={event => setFilters({ ...filters, fromDate: event.target.value })}/></label><label><span>Đến ngày</span><input type="date" value={filters.toDate} onChange={event => setFilters({ ...filters, toDate: event.target.value })}/></label><div className="actions"><button type="button" onClick={reset}>Đặt lại</button><button className="primary"><Search/>Lọc dữ liệu</button></div></form>
    <section className="bank-transaction-list"><header><div><small>SỔ GIAO DỊCH</small><h2>{data.pagination.total || 0} giao dịch đã xác nhận</h2></div><span>Trang {data.pagination.page}/{data.pagination.pages}</span></header><div className="bank-transaction-table"><table><thead><tr><th>Ngày GD / cập nhật</th><th>Loại</th><th>Nhóm chi phí</th><th>Ngân hàng / tài khoản</th><th>Tiền giao dịch gốc</th><th>Ghi nợ</th><th>Ghi có</th><th>Diễn giải</th><th>Sao kê nguồn</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td><strong>{date(row.transaction_date)}</strong><small>Cập nhật {date(row.posting_date)}</small></td><td><span className={`bank-transaction-kind ${kind(row)}`}>{kindLabel(kind(row))}</span></td><td className="cost-category">{row.cost_nature === 'fee' ? <><strong>{row.fee_type || 'Phí khác'}</strong><small>Phân bổ: {row.expense_subcategory || 'Chưa xác định'}</small><em>{row.expense_category || 'Chi phí tài chính'}</em></> : <><strong>{row.expense_subcategory || 'Chưa xác định'}</strong><small>{row.expense_category || 'Chi phí khác'}</small></>}</td><td><strong>{row.bank_code}</strong><small>{row.account_name}</small><small>{row.account_number_masked}</small></td><td className="original-amount"><strong>{money(row.original_amount)}</strong><small>{row.original_currency || row.account_currency || 'VND'}</small></td><td className="amount debit">{Number(row.debit_amount) ? money(row.debit_amount) : '—'}</td><td className="amount credit">{Number(row.credit_amount) ? money(row.credit_amount) : '—'}</td><td className="description">{row.description}</td><td><button className="source-preview-button compact" onClick={() => openSource(row)} title={`Xem ${row.original_filename}`}><FileText/><span>{row.original_filename}</span></button></td></tr>)}</tbody></table>{!loading && !data.items.length && <div className="bank-transaction-empty"><Landmark/><strong>Không có giao dịch phù hợp</strong><span>Thử thay đổi điều kiện lọc hoặc xác nhận một bản import mới.</span></div>}{loading && <div className="bank-transaction-empty"><RefreshCw className="spin"/><strong>Đang tải giao dịch…</strong></div>}</div><footer className="compact-pagination"><span><strong>{data.pagination.total || 0}</strong> kết quả · 50 dòng/trang</span><nav aria-label="Phân trang"><button title="Trang trước" disabled={data.pagination.page <= 1 || loading} onClick={() => load(data.pagination.page - 1, filters)}><ArrowLeft/></button><span>Trang <strong>{data.pagination.page}</strong> / {data.pagination.pages}</span><button title="Trang sau" disabled={data.pagination.page >= data.pagination.pages || loading} onClick={() => load(data.pagination.page + 1, filters)}><ArrowRight/></button></nav></footer></section>
    {preview && <div className="statement-preview-backdrop" onMouseDown={event => event.target === event.currentTarget && closePreview()}><section className="statement-preview-modal"><header><div><small>{preview.bankCode} · {preview.account}</small><h2>{preview.filename}</h2><p>{(supportsAnchoredPreview(preview.bankCode) && preview.anchor) || (preview.bankCode === 'VIB' && preview.sourceRow) ? 'Đang đánh dấu dòng giao dịch tương ứng trên sao kê.' : 'Sao kê nguồn được lưu trên Cloudflare R2.'}</p></div><div>{preview.url && <button onClick={() => window.open(preview.url, '_blank', 'noopener,noreferrer')}><ExternalLink/>Mở tab mới</button>}<button className="close" onClick={closePreview} title="Đóng"><X/></button></div></header><main>{previewLoading ? <div className="statement-preview-state"><RefreshCw className="spin"/><strong>Đang tải sao kê…</strong></div> : preview.error ? <div className="statement-preview-state error"><FileText/><strong>Không thể hiển thị file</strong><span>{preview.error}</span></div> : preview.bankCode === 'VIB' && preview.sourceRow ? <Suspense fallback={<div className="statement-preview-state"><RefreshCw className="spin"/><strong>Đang dựng bảng Excel…</strong></div>}><VibStatementViewer rows={preview.rows} sourceRow={preview.sourceRow}/></Suspense> : preview.url && supportsAnchoredPreview(preview.bankCode) && preview.anchor ? <Suspense fallback={<div className="statement-preview-state"><RefreshCw className="spin"/><strong>Đang khởi tạo PDF viewer…</strong></div>}><TechcombankStatementViewer url={preview.url} anchor={preview.anchor}/></Suspense> : preview.url && preview.filename.toLowerCase().endsWith('.pdf') ? <iframe src={preview.url} title={`Sao kê ${preview.filename}`}/> : <div className="statement-preview-state"><FileText/><strong>Định dạng này không hỗ trợ preview trực tiếp</strong><span>Chọn “Mở tab mới” để tải hoặc xem file nguồn.</span></div>}</main></section></div>}
  </div></div>;
}
