import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Clock3, Search } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '../../../design-system-v2';
import { listSecureLectureLogs, secureLectureError } from '../../../services/secureLecturesApi';

const ACCESS_EVENT_LABELS = Object.freeze({
  open_ok: 'Mở nội dung', open_denied: 'Từ chối mở', takeover: 'Đá máy và mở', kicked: 'Phiên bị đá',
  end: 'Kết thúc phiên', expired: 'Hết hạn', device_registered: 'Đăng ký thiết bị',
  device_removed: 'Gỡ thiết bị', device_blocked: 'Chặn thiết bị', device_unblocked: 'Bỏ chặn thiết bị',
  share_created: 'Tạo link', share_revoked: 'Thu hồi link',
  share_updated: 'Cập nhật link', version_uploaded: 'Upload phiên bản',
  devtools_suspected: 'Nghi ngờ mở công cụ lập trình',
});
const dateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : '—';
const tone = event => event === 'open_denied' ? 'danger' : ['takeover', 'kicked', 'devtools_suspected'].includes(event) ? 'warning' : event === 'open_ok' ? 'success' : 'muted';

export default function AccessLogTable({ lectureId = null, showLecture = true }) {
  const [items, setItems] = useState([]); const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true); const [more, setMore] = useState(false); const [error, setError] = useState('');
  const [event, setEvent] = useState(''); const [denied, setDenied] = useState(false);
  const [lectureFilter, setLectureFilter] = useState(''); const [shareId, setShareId] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [applied, setApplied] = useState({ lectureFilter: '', shareId: '', event: '', denied: false, from: '', to: '' });
  const params = useCallback(cursor => ({ lectureId: lectureId || applied.lectureFilter.trim() || undefined, shareId: applied.shareId.trim() || undefined,
    event: applied.denied ? undefined : applied.event || undefined, denied: applied.denied || undefined, from: applied.from || undefined,
    to: applied.to || undefined, cursor: cursor || undefined, limit: 50 }), [lectureId, applied]);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const result = await listSecureLectureLogs(params()); setItems(result.items || []); setNextCursor(result.nextCursor || null); }
    catch (requestError) { setError(secureLectureError(requestError, 'Không thể tải nhật ký truy cập.')); }
    finally { setLoading(false); }
  }, [params]);
  useEffect(() => { load(); }, [load]);
  const loadMore = async () => {
    setMore(true);
    try { const result = await listSecureLectureLogs(params(nextCursor)); setItems(current => [...current, ...(result.items || [])]); setNextCursor(result.nextCursor || null); }
    catch (requestError) { setError(secureLectureError(requestError, 'Không thể tải thêm nhật ký.')); }
    finally { setMore(false); }
  };
  return <div className="sl-access-logs">
    <div className="sl-log-filters"><label><span>Sự kiện</span><select value={event} disabled={denied} onChange={e => setEvent(e.target.value)}><option value="">Tất cả sự kiện</option>{Object.entries(ACCESS_EVENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Từ</span><input type="datetime-local" value={from} onChange={e => setFrom(e.target.value)} /></label><label><span>Đến</span><input type="datetime-local" value={to} onChange={e => setTo(e.target.value)} /></label>{!lectureId && <label><span>Bài giảng (UUID)</span><input value={lectureFilter} onChange={e => setLectureFilter(e.target.value)} placeholder="Không bắt buộc" /></label>}<label><span>Link (UUID)</span><input value={shareId} onChange={e => setShareId(e.target.value)} placeholder="Không bắt buộc" /></label><Button variant={denied ? 'danger' : 'outline'} icon={<AlertTriangle />} onClick={() => { const next = !denied; setDenied(next); setApplied({ lectureFilter, shareId, event, denied: next, from, to }); }}>Bị từ chối</Button><Button variant="outline" icon={<Search />} onClick={() => setApplied({ lectureFilter, shareId, event, denied, from, to })}>Lọc</Button></div>
    {loading ? <div className="sl-log-state"><Skeleton lines={8} /></div> : error ? <ErrorState title="Không thể tải nhật ký" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /> : !items.length ? <EmptyState icon={<Clock3 />} title="Chưa có sự kiện phù hợp" description="Thử đổi khoảng ngày hoặc bộ lọc sự kiện." /> : <div className="sl-responsive-table"><table className="sl-detail-table sl-log-table"><thead><tr><th>Thời gian</th>{showLecture && <th>Bài giảng</th>}<th>Sự kiện</th><th>Người nhận / thiết bị</th><th>IP</th><th>Chi tiết</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{dateTime(item.at)}</td>{showLecture && <td><strong>{item.lectureTitle || 'Bài giảng đã xoá'}</strong></td>}<td><span className={`sl-badge is-${tone(item.event)}`}>{ACCESS_EVENT_LABELS[item.event] || item.event}</span>{item.reason && <code>{item.reason}</code>}</td><td><strong>{item.recipientName || item.actorName || '—'}</strong><code>{item.deviceLabel || 'Không rõ thiết bị'}</code></td><td><code>{item.ip || '—'}</code></td><td title={item.userAgent || ''}><code>{item.sessionId ? `Phiên ${item.sessionId.slice(0, 8)}…` : item.shareId ? `Link ${item.shareId.slice(0, 8)}…` : '—'}</code></td></tr>)}</tbody></table></div>}
    {nextCursor && <div className="sl-load-more"><Button variant="outline" loading={more} onClick={loadMore}>Tải thêm</Button></div>}
  </div>;
}
