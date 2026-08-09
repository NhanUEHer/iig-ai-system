import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, CloudDownload, LoaderCircle, Minus, RotateCcw, X } from 'lucide-react';
import './BulkSyncPanel.css';

const labels = { queued: 'Đang chờ', syncing: 'Đang đồng bộ', success: 'Thành công', error: 'Thất bại' };

export default function BulkSyncPanel({ job, open, minimized, onMinimize, onClose, onRetry }) {
  if (!job || (!open && !minimized)) return null;
  const done = job.items.filter(item => ['success', 'error'].includes(item.status)).length;
  const success = job.items.filter(item => item.status === 'success').length;
  const failed = job.items.filter(item => item.status === 'error').length;
  const running = job.status === 'running';
  const progress = job.items.length ? Math.round(done / job.items.length * 100) : 0;

  if (minimized) return <button className="sync-mini-card" onClick={onMinimize} aria-label="Mở tiến trình đồng bộ">
    <span className={`sync-mini-icon ${running ? 'running' : failed ? 'warning' : 'success'}`}>{running ? <LoaderCircle className="spin" /> : failed ? <AlertCircle /> : <CheckCircle2 />}</span>
    <span className="sync-mini-copy"><strong>{running ? `Đang đồng bộ ${done}/${job.items.length}` : `Đã đồng bộ ${success}/${job.items.length}`}</strong><small>{running ? `${progress}% · Có thể tiếp tục làm việc` : failed ? `${failed} keycode thất bại` : 'Tất cả keycode thành công'}</small></span>
    <span className="sync-mini-progress"><i style={{ width: `${progress}%` }} /></span><ChevronUp size={16} />
  </button>;

  return <div className="sync-panel-backdrop"><section className="sync-panel" role="dialog" aria-modal="true" aria-labelledby="sync-progress-title">
    <header className="sync-panel-header"><div className="sync-panel-heading"><span><CloudDownload /></span><div><h2 id="sync-progress-title">Tiến trình đồng bộ</h2><p>{running ? 'Đang lấy dữ liệu bài thi từ IIG Elearning' : 'Đã hoàn thành tiến trình đồng bộ'}</p></div></div><div className="sync-panel-controls"><button onClick={onMinimize} title="Thu nhỏ để làm việc khác"><Minus /></button>{!running && <button onClick={onClose} title="Đóng"><X /></button>}</div></header>
    <div className="sync-overview"><div className="sync-progress-copy"><strong>{progress}%</strong><span>{done} / {job.items.length} keycode</span></div><div className="sync-progress-track"><i style={{ width: `${progress}%` }} /></div><div className="sync-summary"><span><i className="success" />{success} thành công</span><span><i className="error" />{failed} thất bại</span><span><i className="queued" />{job.items.length - done} còn lại</span></div></div>
    <div className="sync-result-list">{job.items.map(item => <article className={`sync-result-row ${item.status}`} key={item.keycode}><span className="sync-result-state">{item.status === 'syncing' ? <LoaderCircle className="spin" /> : item.status === 'success' ? <CheckCircle2 /> : item.status === 'error' ? <AlertCircle /> : <ChevronDown />}</span><div><strong>{item.keycode}</strong><small>{item.message || labels[item.status]}</small></div><em>{labels[item.status]}</em>{item.status === 'error' && <button onClick={() => onRetry(item.keycode)} title="Thử lại"><RotateCcw /></button>}</article>)}</div>
    <footer className="sync-panel-footer"><span>{running ? 'Bạn có thể thu nhỏ cửa sổ này, tiến trình vẫn tiếp tục chạy.' : failed ? 'Bạn có thể thử lại riêng từng keycode bị lỗi.' : 'Danh sách bài chấm đã được cập nhật.'}</span><button onClick={running ? onMinimize : onClose}>{running ? 'Thu nhỏ' : 'Hoàn tất'}</button></footer>
  </section></div>;
}
