import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileCheck2, FileSpreadsheet, Landmark, LockKeyhole, Plus, RefreshCw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import api from '../../../services/api';
import './BankStatementImportsPage.css';
import './BankStatementDelete.css';
import './BankStatementFilters.css';
import './BankStatementReadability.css';
import './ExpensePagesSystemDesign.css';

const money = value => value == null ? '—' : Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const rowType = row => row.raw_data?.transactionType || (Number(row.credit_amount) ? 'payment' : Number(row.fee_amount) ? 'fee' : 'purchase');
const typeLabel = type => ({ purchase: 'Ghi nợ', fee: 'Phí giao dịch', payment: 'Ghi có', refund: 'Hoàn tiền' }[type] || type);
const statusLabel = status => ({ ready_for_review: 'Chờ kiểm tra', reconciliation_failed: 'Chưa cân đối', parser_failed: 'Lỗi đọc file', committed: 'Đã xác nhận', cancelled: 'Đã hủy' }[status] || status);
const transactionSum = (rows, key) => (rows?.reduce((sum, row) => sum + (row.is_excluded ? 0 : Math.round(Number(row[key] || 0) * 100)), 0) || 0) / 100;
const reconciliationState = (statementValue, detectedValue) => {
  const available = statementValue != null && !(Number(statementValue) === 0 && Number(detectedValue) > 0);
  return { available, match: available && Math.abs(Number(statementValue) - Number(detectedValue)) < 0.005 };
};

function groupTransactions(rows = []) {
  const groups = [];
  const bySourceRow = new Map();
  for (const row of rows) {
    const type = rowType(row);
    if (type === 'fee') {
      const parentKey = `${row.raw_data?.parentSourcePage || row.source_page}:${row.raw_data?.parentSourceRow}`;
      const parent = bySourceRow.get(parentKey) || bySourceRow.get(String(row.raw_data?.parentSourceRow)) || groups.at(-1);
      if (parent && parent.type === 'purchase') {
        parent.fees.push(row);
        parent.feeAmount += Number(row.debit_amount || row.fee_amount || 0);
        parent.totalAmount += Number(row.debit_amount || row.fee_amount || 0);
        continue;
      }
    }
    const group = {
      key: row.id,
      row,
      type,
      fees: [],
      feeAmount: 0,
      totalAmount: type === 'payment' ? Number(row.credit_amount || 0) : Number(row.debit_amount || 0),
    };
    groups.push(group);
    if (row.source_row != null) {
      bySourceRow.set(`${row.source_page}:${row.source_row}`, group);
      bySourceRow.set(String(row.source_row), group);
    }
  }
  return groups;
}

function TransactionPreview({ selected, edit }) {
  const [expanded, setExpanded] = useState({});
  const [filter, setFilter] = useState('all');
  const groups = useMemo(() => groupTransactions(selected.transactions), [selected.transactions]);
  const visibleGroups = useMemo(() => groups.filter(group => filter === 'all' || (filter === 'debit' && group.type === 'purchase') || (filter === 'credit' && ['payment', 'refund'].includes(group.type)) || (filter === 'fee' && (group.feeAmount > 0 || group.type === 'fee'))), [filter, groups]);
  const debitGroups = groups.filter(group => group.type === 'purchase');
  const creditGroups = groups.filter(group => ['payment', 'refund'].includes(group.type));
  const feeGroups = groups.filter(group => group.feeAmount > 0 || group.type === 'fee');
  const toggle = key => setExpanded(current => ({ ...current, [key]: !current[key] }));

  return <div className="grouped-preview-wrap"><nav className="expense-transaction-filters" aria-label="Lọc loại giao dịch">
    <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}><span>Tất cả</span><b>{groups.length}</b></button>
    <button className={`debit ${filter === 'debit' ? 'active' : ''}`} onClick={() => setFilter('debit')}><span>Ghi nợ</span><b>{debitGroups.length}</b><em>{money(transactionSum(selected.transactions, 'debit_amount'))}</em></button>
    <button className={`credit ${filter === 'credit' ? 'active' : ''}`} onClick={() => setFilter('credit')}><span>Ghi có</span><b>{creditGroups.length}</b><em>{money(transactionSum(selected.transactions, 'credit_amount'))}</em></button>
    <button className={`fee ${filter === 'fee' ? 'active' : ''}`} onClick={() => setFilter('fee')}><span>Phí</span><b>{feeGroups.length}</b><em>{money(transactionSum(selected.transactions, 'fee_amount'))}</em></button>
  </nav><div className="expense-table preview grouped-preview"><table>
    <thead><tr><th></th><th>Ngày giao dịch</th><th>Ngày cập nhật HT</th><th>Loại</th><th>Diễn giải</th><th>Tiền giao dịch gốc</th><th>Ghi nợ</th><th>Ghi có</th><th>Phí giao dịch</th><th>Tổng chi phí</th><th>Bỏ qua</th></tr></thead>
    <tbody>{visibleGroups.map(group => {
      const { row } = group;
      const hasDetails = group.fees.length > 0;
      return <Fragment key={group.key}><tr className={`expense-group-row ${group.type}`}>
        <td><button className="expense-expand" disabled={!hasDetails} onClick={() => toggle(group.key)}>{hasDetails ? (expanded[group.key] ? <ChevronDown/> : <ChevronRight/>) : null}</button></td>
        <td><input type="date" value={String(row.transaction_date || '').slice(0, 10)} onChange={event => edit(row.id, 'transaction_date', event.target.value)}/></td>
        <td><input type="date" value={String(row.posting_date || '').slice(0, 10)} onChange={event => edit(row.id, 'posting_date', event.target.value)}/></td>
        <td><span className={`expense-kind ${group.type}`}>{typeLabel(group.type)}</span></td>
        <td><textarea className="expense-description" rows={2} value={row.description} onChange={event => edit(row.id, 'description', event.target.value)}/></td>
        <td>{money(row.original_amount)} {row.original_currency}</td>
        <td>{group.type === 'fee' ? '—' : money(row.debit_amount)}</td>
        <td>{money(row.credit_amount)}</td>
        <td>{money(group.type === 'fee' ? row.debit_amount : group.feeAmount)}</td>
        <td><strong>{money(group.totalAmount)}</strong></td>
        <td><input type="checkbox" checked={row.is_excluded} onChange={event => edit(row.id, 'is_excluded', event.target.checked)}/></td>
      </tr>
      {expanded[group.key] && group.fees.map(fee => <tr key={fee.id} className="expense-fee-detail">
        <td></td><td>{String(fee.transaction_date || '').slice(0, 10)}</td><td>{String(fee.posting_date || '').slice(0, 10)}</td>
        <td><span className="expense-kind fee">Phí</span></td><td>{fee.description}</td><td>{money(fee.original_amount)} {fee.original_currency}</td>
        <td>{money(fee.debit_amount)}</td><td>—</td><td>{money(fee.fee_amount)}</td><td>Đã cộng ở dòng trên</td>
        <td><input type="checkbox" checked={fee.is_excluded} onChange={event => edit(fee.id, 'is_excluded', event.target.checked)}/></td>
      </tr>)}</Fragment>;
    })}</tbody>
  </table>{!visibleGroups.length && <div className="expense-filter-empty">Không có giao dịch trong nhóm này.</div>}</div></div>;
}

export default function BankStatementImportsPage({ currentUser, showMsg }) {
  const [bootstrap, setBootstrap] = useState(null);
  const [imports, setImports] = useState([]);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ bankCode: '', bankAccountId: '', password: '', note: '', file: null });
  const [clearFileOnReviewClose, setClearFileOnReviewClose] = useState(false);
  const fileInputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountForm, setAccountForm] = useState({ bankCode: '', accountName: '', accountNumber: '', accountType: 'credit_card', currency: 'VND', departmentCode: '' });
  const canImport = currentUser?.permissions?.some(permission => ['expenses.import', 'expenses.manage'].includes(permission));
  const canConfig = currentUser?.permissions?.some(permission => ['expenses.config', 'expenses.manage'].includes(permission));
  const accounts = useMemo(() => bootstrap?.accounts?.filter(account => account.bank_code === form.bankCode) || [], [bootstrap, form.bankCode]);
  const selectedDebit = transactionSum(selected?.transactions, 'debit_amount');
  const selectedCredit = transactionSum(selected?.transactions, 'credit_amount');
  const debitReconciliation = reconciliationState(selected?.statement_total_debit, selectedDebit);
  const creditReconciliation = reconciliationState(selected?.statement_total_credit, selectedCredit);

  const clearUploadFile = () => {
    setForm(current => ({ ...current, file: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const closeReview = () => {
    setSelected(null);
    if (clearFileOnReviewClose) clearUploadFile();
    setClearFileOnReviewClose(false);
  };

  const load = useCallback(async () => {
    const [bootstrapResponse, historyResponse] = await Promise.all([api.get('/expenses/bootstrap'), api.get('/expenses/imports')]);
    setBootstrap(bootstrapResponse.data.data);
    setImports(historyResponse.data.data);
  }, []);
  useEffect(() => { load().catch(error => showMsg(error.response?.data?.error || 'Không thể tải dữ liệu chi phí.', 'error')); }, [load, showMsg]);

  const upload = async event => {
    event.preventDefault();
    if (!form.file) return;
    if (!form.file.size) return showMsg('File sao kê đang rỗng. Vui lòng chọn lại file.', 'error');
    setBusy(true);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => value !== null && data.append(key, key === 'file' ? value : String(value)));
      const response = await api.post('/expenses/imports', data, { timeout: 45000 });
      setSelected(response.data.data);
      setClearFileOnReviewClose(true);
      showMsg('Đã parse sao kê. Vui lòng kiểm tra trước khi xác nhận.');
      await load();
    } catch (error) { showMsg(error.response?.data?.error || 'Không thể xử lý sao kê.', 'error'); }
    finally { setBusy(false); }
  };
  const open = async id => {
    setClearFileOnReviewClose(false);
    setSelected((await api.get(`/expenses/imports/${id}`)).data.data);
  };
  const removeImport = async (event, item) => {
    event.stopPropagation();
    if (item.status === 'committed') return;
    if (!window.confirm(`Xóa lịch sử import “${item.original_filename}”?\n\nBản xem trước và file nguồn sẽ bị xóa. Thao tác này không thể hoàn tác.`)) return;
    setDeletingId(item.id);
    try { await api.delete(`/expenses/imports/${item.id}`); await load(); showMsg('Đã xóa lịch sử import và dữ liệu xem trước.'); }
    catch (error) { showMsg(error.response?.data?.error || 'Không thể xóa lịch sử import.', 'error'); }
    finally { setDeletingId(null); }
  };
  const edit = (id, key, value) => setSelected(current => ({ ...current, transactions: current.transactions.map(row => row.id === id ? { ...row, [key]: value } : row) }));
  const save = async () => {
    setBusy(true);
    try {
      const transactions = selected.transactions.map(row => ({ transactionDate: row.transaction_date, postingDate: row.posting_date, description: row.description, normalizedDescription: row.normalized_description, originalAmount: row.original_amount, originalCurrency: row.original_currency, debitAmount: row.debit_amount, creditAmount: row.credit_amount, feeAmount: row.fee_amount, referenceNumber: row.reference_number, sourcePage: row.source_page, sourceRow: row.source_row, warnings: row.warnings, rawData: row.raw_data, isExcluded: row.is_excluded }));
      const updated=(await api.put(`/expenses/imports/${selected.id}/draft-transactions`, { revision: selected.revision, transactions })).data.data;
      setSelected(updated);
      showMsg(updated.status==='ready_for_review'?'Đã lưu và đối soát khớp sao kê.':'Đã lưu nhưng dữ liệu vẫn chưa cân đối.',updated.status==='ready_for_review'?'success':'warning');
    } catch (error) { showMsg(error.response?.data?.error || 'Không thể lưu.', 'error'); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try { await api.post(`/expenses/imports/${selected.id}/commit`, { revision: selected.revision }); closeReview(); await load(); showMsg('Đã xác nhận import sao kê.'); }
    catch (error) { showMsg(error.response?.data?.error || 'Không thể xác nhận.', 'error'); }
    finally { setBusy(false); }
  };
  const createAccount = async event => {
    event.preventDefault(); setBusy(true);
    try {
      const response = await api.post('/expenses/accounts', accountForm); await load();
      setForm(current => ({ ...current, bankCode: response.data.data.bank_code, bankAccountId: response.data.data.id }));
      setAccountOpen(false); setAccountForm({ bankCode: '', accountName: '', accountNumber: '', accountType: 'credit_card', currency: 'VND', departmentCode: '' });
      showMsg('Đã khai báo tài khoản/thẻ ngân hàng.');
    } catch (error) { showMsg(error.response?.data?.error || 'Không thể khai báo tài khoản.', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="expense-page"><div className="expense-shell">
    <header className="expense-page-header"><div className="expense-title"><span className="expense-title-icon"><Landmark/></span><div><small>CHI PHÍ · SAO KÊ NGÂN HÀNG</small><h1>Import sao kê</h1><p>Chuẩn hóa giao dịch từ nhiều ngân hàng trước khi phân loại và báo cáo chi phí.</p></div></div><div className="expense-header-actions">{canConfig && <button onClick={() => setAccountOpen(true)}><Plus/>Khai báo tài khoản</button>}<button className="icon-only" onClick={load} title="Làm mới"><RefreshCw/></button></div></header>
    <section className="expense-flow" aria-label="Quy trình import"><article className="active"><span>1</span><div><strong>Chọn nguồn</strong><small>Ngân hàng, tài khoản và file</small></div></article><i/><article><span>2</span><div><strong>Kiểm tra dữ liệu</strong><small>Đối chiếu và nhóm phí</small></div></article><i/><article><span>3</span><div><strong>Xác nhận</strong><small>Ghi nhận giao dịch</small></div></article></section>
    <form className="expense-upload" onSubmit={upload}>
      <div className="expense-upload-heading"><span><Upload/></span><div><h2>Tải sao kê mới</h2><p>Chọn đúng tài khoản trước khi tải file để hệ thống kiểm tra số tài khoản trên sao kê.</p></div></div>
      <div className="expense-upload-fields">
      <label>Ngân hàng<select required value={form.bankCode} onChange={event => setForm({ ...form, bankCode: event.target.value, bankAccountId: '' })}><option value="">Chọn ngân hàng</option>{bootstrap?.banks?.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label>
      <label>Tài khoản/thẻ<select required disabled={!form.bankCode} value={form.bankAccountId} onChange={event => setForm({ ...form, bankAccountId: event.target.value })}><option value="">Chọn tài khoản</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.account_name} · {account.account_number_masked}</option>)}</select></label>
      {form.bankCode === 'VIB' && <label>Mật khẩu file<input type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/></label>}
      </div><label className={`expense-file ${form.file ? 'selected' : ''}`}><span className="expense-file-icon">{form.file ? <FileCheck2/> : <FileSpreadsheet/>}</span><span><strong>{form.file?.name || 'Kéo thả hoặc chọn file sao kê'}</strong><small>{form.bankCode === 'VIB' ? 'Định dạng XLSX · tối đa 20 MB' : 'Định dạng PDF có lớp chữ · tối đa 20 MB'}</small></span><input ref={fileInputRef} type="file" disabled={!form.bankCode} accept={form.bankCode === 'VIB' ? '.xlsx' : '.pdf'} onChange={event => setForm({ ...form, file: event.target.files?.[0] || null })}/></label>
      <div className="expense-upload-footer"><span><ShieldCheck/>File nguồn được lưu trong kho R2 bảo mật.</span><button className="primary" disabled={!canImport || busy || !form.file}><Upload/>{busy ? 'Đang xử lý…' : 'Tải lên và kiểm tra'}</button></div>
    </form>
    <section className="expense-history"><header><div><small>LỊCH SỬ XỬ LÝ</small><h2>Các lần import gần đây</h2></div><span>{imports.length} lần import</span></header><div className="expense-table"><table><thead><tr><th>Thời gian</th><th>Ngân hàng / tài khoản</th><th>File nguồn</th><th>Giao dịch</th><th>Ghi nợ</th><th>Ghi có</th><th>Trạng thái</th><th></th></tr></thead><tbody>{imports.map(item => <tr key={item.id} onClick={() => open(item.id)}><td>{new Date(item.created_at).toLocaleString('vi-VN')}</td><td><strong>{item.bank_code}</strong><small>{item.account_number_masked}</small></td><td>{item.original_filename}</td><td>{item.transaction_count}</td><td>{money(item.parsed_total_debit)}</td><td>{money(item.parsed_total_credit)}</td><td><span className={`expense-status ${item.status}`}>{statusLabel(item.status)}</span></td><td>{item.status === 'committed' ? <span className="expense-delete-locked" title="Đã tạo dữ liệu giao dịch, không thể xóa"><LockKeyhole/></span> : <button className="expense-delete" title="Xóa lịch sử import" disabled={deletingId === item.id} onClick={event => removeImport(event, item)}><Trash2/></button>}</td></tr>)}</tbody></table>{!imports.length && <div className="expense-empty"><FileSpreadsheet/><strong>Chưa có sao kê</strong><span>Sao kê đã tải lên sẽ xuất hiện tại đây.</span></div>}</div></section>
    {accountOpen && <div className="expense-modal account"><form onSubmit={createAccount}><header><div><span>EXPENSE ACCOUNT</span><h2>Khai báo tài khoản/thẻ</h2><p>Tài khoản này xác định ngân hàng và gắn toàn bộ giao dịch khi import.</p></div><button type="button" onClick={() => setAccountOpen(false)}>×</button></header><div className="expense-account-form"><label>Ngân hàng<select required value={accountForm.bankCode} onChange={event => setAccountForm({ ...accountForm, bankCode: event.target.value })}><option value="">Chọn ngân hàng</option>{bootstrap?.banks?.map(bank => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select></label><label>Tên tài khoản/thẻ<input required value={accountForm.accountName} onChange={event => setAccountForm({ ...accountForm, accountName: event.target.value })}/></label><label>Số tài khoản/thẻ<input required autoComplete="off" value={accountForm.accountNumber} onChange={event => setAccountForm({ ...accountForm, accountNumber: event.target.value })} placeholder="Nhập số đầy đủ hoặc 4032******2289"/><small>Hệ thống tự che và không lưu số đầy đủ dạng đọc được.</small></label><label>Loại tài khoản<select value={accountForm.accountType} onChange={event => setAccountForm({ ...accountForm, accountType: event.target.value })}><option value="credit_card">Thẻ tín dụng</option><option value="bank_account">Tài khoản ngân hàng</option></select></label><label>Đơn vị tiền<select value={accountForm.currency} onChange={event => setAccountForm({ ...accountForm, currency: event.target.value })}><option value="VND">VND</option><option value="USD">USD</option></select></label><label>Mã phòng ban<input value={accountForm.departmentCode} onChange={event => setAccountForm({ ...accountForm, departmentCode: event.target.value.toUpperCase() })}/></label></div><footer><button type="button" onClick={() => setAccountOpen(false)}>Hủy</button><button className="primary" disabled={busy}><Plus/>Lưu tài khoản</button></footer></form></div>}
    {selected && <div className="expense-modal"><section className="expense-review"><header><div><small>{selected.bank_code} · {selected.account_number_masked}</small><h2>Kiểm tra trước khi xác nhận</h2><p>{selected.original_filename} · {selected.transaction_count} dòng dữ liệu</p></div><button className="icon-only" onClick={closeReview}>×</button></header>{selected.warnings?.map((warning, index) => <div className={`expense-warning ${warning.level}`} key={index}><AlertTriangle/>{warning.message}</div>)}<div className="expense-balance-strip"><span>Số dư đầu kỳ <strong>{money(selected.opening_balance)}</strong></span><i/><span>Số dư cuối kỳ <strong>{money(selected.closing_balance)}</strong></span></div><div className="expense-reconciliation"><article className="debit"><span>Ghi nợ</span><div><small>Trên sao kê<strong>{debitReconciliation.available ? money(selected.statement_total_debit) : 'Chưa đọc được tổng'}</strong></small><small>Đã nhận diện<strong>{money(selectedDebit)}</strong></small></div><em className={!debitReconciliation.available ? 'unknown' : debitReconciliation.match ? 'match' : 'mismatch'}>{!debitReconciliation.available ? 'Chưa đối chiếu' : debitReconciliation.match ? 'Khớp' : 'Lệch'}</em></article><article className="credit"><span>Ghi có</span><div><small>Trên sao kê<strong>{creditReconciliation.available ? money(selected.statement_total_credit) : 'Chưa đọc được tổng'}</strong></small><small>Đã nhận diện<strong>{money(selectedCredit)}</strong></small></div><em className={!creditReconciliation.available ? 'unknown' : creditReconciliation.match ? 'match' : 'mismatch'}>{!creditReconciliation.available ? 'Chưa đối chiếu' : creditReconciliation.match ? 'Khớp' : 'Lệch'}</em></article><article className="fee"><span>Phí giao dịch</span><strong>{money(transactionSum(selected.transactions, 'fee_amount'))}</strong><small>Đã nằm trong tổng ghi nợ</small></article></div><div className="expense-review-title"><div><h3>Giao dịch đã nhận diện</h3><p>Dùng các tag bên dưới để lọc nhanh theo ghi nợ, ghi có hoặc phí.</p></div></div><TransactionPreview selected={selected} edit={edit}/><footer><span>{selected.status==='ready_for_review'?'Dữ liệu đã cân đối và sẵn sàng xác nhận.':'Cần lưu chỉnh sửa và đối soát khớp trước khi xác nhận.'}</span><div><button onClick={save} disabled={busy || selected.status === 'committed'}>Lưu & đối soát</button><button className="primary" onClick={commit} disabled={busy || selected.status !== 'ready_for_review'}><CheckCircle2/>Xác nhận import</button></div></footer></section></div>}
  </div></div>;
}
