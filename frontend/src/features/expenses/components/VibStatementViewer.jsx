import { useEffect, useMemo, useRef } from 'react';
import { LocateFixed } from 'lucide-react';

const money = value => Number(value || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
const date = value => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '—';

export default function VibStatementViewer({ rows = [], sourceRow }) {
  const stageRef = useRef(null);
  const activeRef = useRef(null);
  const orderedRows = useMemo(() => [...rows].sort((a, b) => Number(a.source_row || 0) - Number(b.source_row || 0)), [rows]);
  const focus = behavior => activeRef.current?.scrollIntoView({ block: 'center', behavior });

  useEffect(() => {
    const timer = window.setTimeout(() => focus('smooth'), 80);
    return () => window.clearTimeout(timer);
  }, [sourceRow, orderedRows]);

  return <div className="vib-statement-viewer"><header><span>Dữ liệu đọc từ sheet <strong>saoke</strong> · {orderedRows.length} giao dịch</span><button onClick={() => focus('smooth')}><LocateFixed/>Dòng đang chọn</button></header><div className="vib-statement-stage" ref={stageRef}><table><thead><tr><th>Dòng Excel</th><th>Ngày giao dịch</th><th>Ngày hạch toán</th><th>Diễn giải</th><th>MCC</th><th>Ghi nợ (VND)</th><th>Ghi có (VND)</th></tr></thead><tbody>{orderedRows.map(row => {
    const active = Number(row.source_row) === Number(sourceRow);
    return <tr key={row.id || row.source_row} ref={active ? activeRef : null} className={active ? 'active' : ''}><td><strong>{row.source_row || '—'}</strong>{active && <span>Đang xem</span>}</td><td>{date(row.transaction_date)}</td><td>{date(row.posting_date)}</td><td>{row.description}</td><td>{row.raw_data?.mcc || '—'}</td><td className="amount">{Number(row.debit_amount) ? money(row.debit_amount) : '—'}</td><td className="amount credit">{Number(row.credit_amount) ? money(row.credit_amount) : '—'}</td></tr>;
  })}</tbody></table>{!orderedRows.length && <div className="statement-preview-state"><strong>Không có dữ liệu dòng sao kê để hiển thị.</strong></div>}</div></div>;
}
