import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Ban, Clock3, Copy, Eye, FileCode2, FolderInput, History, Link2, Monitor,
  RefreshCw, ShieldBan, Unplug, Upload,
} from 'lucide-react';
import { Button, EmptyState, ErrorState, Modal, Skeleton } from '../../../design-system-v2';
import {
  blockSecureLectureDevice, createSecureLectureVersion, getSecureLecture, getSecureLectureVersionPreview,
  kickSecureLectureSession, listSecureLectureFolders, listSecureLectureShareDevices,
  listSecureLectureShares, listSecureLectureVersions, moveSecureLectures,
  removeSecureLectureDevice, revokeSecureLectureShare,
  secureLectureError, setSecureLectureCurrentVersion, unblockSecureLectureDevice,
} from '../../../services/secureLecturesApi';
import { buildFolderPath } from '../../../utils/folderTree';
import { FolderPickerDialog } from '../components/FolderDialogs';
import ShareCreatedDialog from '../components/ShareCreatedDialog';
import ShareDialog from '../components/ShareDialog';
import AccessLogTable from '../components/AccessLogTable';
import { formatShareStatus } from '../shareForm';
import './LibraryPage.css';
import './LectureDetailPage.css';

const number = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0));
const dateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const shortDateTime = value => value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const size = value => Number(value || 0) < 1024 * 1024 ? `${Math.ceil(Number(value || 0) / 1024)} KB` : `${(Number(value || 0) / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`;
const maskIp = value => value ? String(value).replace(/^(\d+\.\d+)\..*$/, '$1.x.x') : '—';
const tabs = [{ id: 'shares', label: 'Link chia sẻ', icon: Link2 }, { id: 'devices', label: 'Thiết bị & phiên', icon: Monitor }, { id: 'versions', label: 'Phiên bản', icon: History }, { id: 'logs', label: 'Nhật ký truy cập', icon: Clock3 }];

function VersionUploadDialog({ open, lectureId, showMsg, onClose, onUploaded }) {
  const [file, setFile] = useState(null); const [note, setNote] = useState(''); const [makeCurrent, setMakeCurrent] = useState(true); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setFile(null); setNote(''); setMakeCurrent(true); } }, [open]);
  const upload = async () => {
    if (!file) return; setBusy(true);
    try { await createSecureLectureVersion(lectureId, { file, note: note.trim(), makeCurrent }); showMsg?.('Đã upload phiên bản mới.', 'success'); onUploaded(); onClose(); }
    catch (error) { showMsg?.(secureLectureError(error, 'Không thể upload phiên bản.'), 'error'); }
    finally { setBusy(false); }
  };
  return <Modal open={open} title="Upload bản mới" size="sm" onClose={busy ? undefined : onClose} footer={<><Button variant="outline" disabled={busy} onClick={onClose}>Huỷ</Button><Button loading={busy} disabled={!file} icon={<Upload />} onClick={upload}>Upload</Button></>}><div className="sl-dialog-body"><label className="sl-version-file"><input type="file" accept=".html,.htm,text/html" onChange={event => setFile(event.target.files?.[0] || null)} /><FileCode2 /><span>{file ? `${file.name} · ${size(file.size)}` : 'Chọn file HTML, tối đa 20 MB'}</span></label><label className="sl-dialog-field"><span>Ghi chú phiên bản</span><input value={note} onChange={event => setNote(event.target.value)} placeholder="Ví dụ: Sửa nội dung slide 7" /></label><label className="sl-check-row"><input type="checkbox" checked={makeCurrent} onChange={event => setMakeCurrent(event.target.checked)} /> Dùng làm bản hiện tại ngay sau khi upload</label></div></Modal>;
}

export default function LectureDetailPage({ currentUser, showMsg }) {
  const { id } = useParams();
  const canManage = currentUser?.permissions?.includes('secure_lectures.manage');
  const canShare = currentUser?.permissions?.includes('secure_lectures.share');
  const [lecture, setLecture] = useState(null); const [folders, setFolders] = useState([]); const [shares, setShares] = useState([]); const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [tab, setTab] = useState('shares');
  const [shareDialog, setShareDialog] = useState(null); const [created, setCreated] = useState(null); const [moveOpen, setMoveOpen] = useState(false); const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedShareId, setSelectedShareId] = useState(''); const [devices, setDevices] = useState([]); const [devicesLoading, setDevicesLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null); const [revokeReason, setRevokeReason] = useState(''); const [versionTarget, setVersionTarget] = useState(null); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [lectureResult, folderResult, shareResult, versionResult] = await Promise.all([getSecureLecture(id), listSecureLectureFolders(), listSecureLectureShares(id), listSecureLectureVersions(id)]);
      setLecture(lectureResult); setFolders(folderResult.folders || []); setShares(shareResult || []); setVersions(versionResult || []);
      setSelectedShareId(current => current && shareResult.some(item => item.id === current) ? current : shareResult.find(item => item.status === 'active')?.id || shareResult[0]?.id || '');
    } catch (requestError) { setError(secureLectureError(requestError, 'Không thể tải chi tiết bài giảng.')); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const loadDevices = useCallback(async (quiet = false) => {
    if (!selectedShareId) { setDevices([]); return; }
    if (!quiet) setDevicesLoading(true);
    try { setDevices(await listSecureLectureShareDevices(selectedShareId) || []); }
    catch (requestError) { if (!quiet) showMsg?.(secureLectureError(requestError, 'Không thể tải thiết bị.'), 'error'); }
    finally { if (!quiet) setDevicesLoading(false); }
  }, [selectedShareId, showMsg]);
  useEffect(() => { if (tab !== 'devices') return undefined; loadDevices(); const timer = window.setInterval(() => loadDevices(true), 15_000); return () => window.clearInterval(timer); }, [tab, loadDevices]);

  const folderPath = useMemo(() => buildFolderPath(folders, lecture?.folderId), [folders, lecture]);
  const selectedShare = shares.find(item => item.id === selectedShareId);
  const metric = lecture?.metrics || {};
  const refresh = async () => { await load(); if (tab === 'devices') await loadDevices(); };
  const mutate = async (work, message, after = refresh) => { setBusy(true); try { await work(); showMsg?.(message, 'success'); await after?.(); return true; } catch (requestError) { showMsg?.(secureLectureError(requestError), 'error'); return false; } finally { setBusy(false); } };

  const closeCreated = () => { setCreated(null); };
  const openPreview = async versionId => {
    const previewWindow = window.open('about:blank', '_blank');
    try {
      const blob = await getSecureLectureVersionPreview(id, versionId);
      const url = URL.createObjectURL(blob);
      if (previewWindow) previewWindow.location.replace(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (requestError) { previewWindow?.close(); showMsg?.(secureLectureError(requestError, 'Không thể mở bản xem trước.'), 'error'); }
  };
  const deviceAction = (device, action) => mutate(() => action === 'remove' ? removeSecureLectureDevice(selectedShareId, device.deviceRef) : action === 'block' ? blockSecureLectureDevice(selectedShareId, device.deviceRef) : unblockSecureLectureDevice(selectedShareId, device.deviceRef), action === 'remove' ? 'Đã gỡ thiết bị.' : action === 'block' ? 'Đã chặn thiết bị.' : 'Đã bỏ chặn thiết bị.', loadDevices);

  if (loading) return <div className="sl-page"><div className="sl-frame sl-loading"><Skeleton lines={14} /></div></div>;
  if (error) return <div className="sl-page"><div className="sl-frame"><ErrorState title="Không thể tải bài giảng" description={error} action={<Button variant="outline" onClick={load}>Thử lại</Button>} /></div></div>;

  return <div className="sl-page"><div className="sl-frame sl-detail">
    <nav className="sl-breadcrumb"><Link to="/secure-lectures">Bài giảng bảo mật</Link>{folderPath.map(folder => <React.Fragment key={folder.id}><span>/</span><Link to={`/secure-lectures/folders/${folder.id}`}>{folder.name}</Link></React.Fragment>)}<span>/</span><strong>{lecture.title}</strong></nav>
    <header className="sl-page-head"><h1>{lecture.title}</h1><nav>{canManage && <Button variant="outline" icon={<FolderInput />} onClick={() => setMoveOpen(true)}>Di chuyển</Button>}<Button variant="outline" icon={<Eye />} disabled={!lecture.currentVersion} onClick={() => openPreview(lecture.currentVersion.id)}>Xem trước</Button>{canManage && <Button variant="outline" icon={<Upload />} onClick={() => setUploadOpen(true)}>Upload bản mới</Button>}{canShare && <Button icon={<Link2 />} onClick={() => setShareDialog({})}>Tạo link chia sẻ</Button>}</nav></header>
    <section className="sl-overview sl-detail-overview">
      <article><span>Bản đang dùng</span><strong>{metric.currentVersion ? `v${metric.currentVersion}` : '—'}</strong><small>{lecture.currentVersion ? `${lecture.currentVersion.originalFilename} · ${size(lecture.currentVersion.size)}` : 'Chưa có phiên bản'}</small></article>
      <article><span>Link hoạt động</span><strong>{number(metric.activeShareCount)}</strong><small>{number(metric.revokedShareCount)} đã thu hồi · {number(metric.expiredShareCount)} hết hạn</small></article>
      <article><span>Thiết bị đã đăng ký</span><strong>{number(metric.registeredDeviceCount)}</strong><small className="is-success">{number(metric.liveSessionCount)} đang mở ngay lúc này</small></article>
      <article><span>Lượt mở 7 ngày</span><strong>{number(metric.openOk7d)}</strong><small>{number(metric.deniedCount)} lần bị từ chối · {number(metric.takeoverCount)} lần đá phiên</small></article>
    </section>
    <nav className="sl-detail-tabs">{tabs.map(item => { const Icon = item.icon; return <button type="button" key={item.id} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}><Icon />{item.label}{item.id === 'shares' && <small>{shares.length}</small>}{item.id === 'versions' && <small>{versions.length}</small>}</button>; })}</nav>

    {tab === 'shares' && <section className="sl-detail-panel">{!shares.length ? <EmptyState icon={<Link2 />} title="Chưa có link chia sẻ" description="Tạo link đầu tiên để giáo viên mở bài giảng an toàn." action={canShare ? <Button icon={<Link2 />} onClick={() => setShareDialog({})}>Tạo link</Button> : null} /> : <div className="sl-responsive-table"><table className="sl-detail-table"><thead><tr><th>Người nhận</th><th>Hiệu lực đến</th><th>Thiết bị</th><th>Đang mở</th><th>Trạng thái</th><th /></tr></thead><tbody>{shares.map(share => { const status = formatShareStatus(share); const copyable = created?.share?.id === share.id; return <tr key={share.id} className={['revoked', 'expired'].includes(share.status) ? 'is-dimmed' : ''}><td><strong>{share.recipientName}</strong><code>…{share.tokenHint} · tạo {shortDateTime(share.createdAt)}</code></td><td>{dateTime(share.expiresAt)}</td><td>{share.deviceCount} / {share.maxDevices}</td><td>{share.status === 'active' ? `${share.liveSessionCount} / ${share.maxConcurrent}` : '—'}</td><td><span className={`sl-badge is-${status.tone}`}>{status.label}</span></td><td><div className="sl-detail-actions">{share.status !== 'revoked' && <>{canShare && (share.expiring || share.status === 'expired') && <Button size="sm" variant="outline" onClick={() => setShareDialog({ share })}>Gia hạn</Button>}<Button size="sm" variant="outline" icon={<Copy />} title={copyable ? 'Copy link' : 'Link chỉ hiện lúc tạo'} disabled={!copyable} onClick={() => navigator.clipboard.writeText(created.url)}>Copy</Button>{canShare && <Button size="sm" variant="outline" onClick={() => setShareDialog({ share })}>Sửa</Button>}{canShare && <Button size="sm" variant="danger" icon={<Ban />} onClick={() => { setRevokeTarget(share); setRevokeReason(''); }}>Thu hồi</Button>}</>}</div></td></tr>; })}</tbody></table></div>}</section>}

    {tab === 'devices' && <section className="sl-detail-panel"><div className="sl-device-toolbar"><label>Link chia sẻ<select value={selectedShareId} onChange={event => setSelectedShareId(event.target.value)}>{shares.map(share => <option key={share.id} value={share.id}>{share.recipientName} · …{share.tokenHint}</option>)}</select></label><Button size="sm" variant="outline" icon={<RefreshCw />} loading={devicesLoading} onClick={() => loadDevices()}>Làm mới</Button></div>{!selectedShareId ? <EmptyState icon={<Monitor />} title="Chưa có link để xem thiết bị" /> : devicesLoading ? <Skeleton lines={7} /> : !devices.length ? <EmptyState icon={<Monitor />} title="Chưa có thiết bị" description="Thiết bị sẽ xuất hiện sau khi người nhận mở link." /> : <div className="sl-responsive-table"><table className="sl-detail-table"><thead><tr><th>Thiết bị</th><th>Lần đầu</th><th>Lần cuối</th><th>IP</th><th>Phiên</th><th /></tr></thead><tbody>{devices.map(device => <tr key={device.deviceRef} className={device.removedAt ? 'is-dimmed' : ''}><td><strong>{device.label || 'Thiết bị chưa rõ'}</strong><code>{String(device.deviceId || '').slice(0, 12)}…{device.blockedAt ? ' · đã chặn' : device.removedAt ? ' · đã gỡ' : ''}</code></td><td>{shortDateTime(device.firstSeenAt)}</td><td>{shortDateTime(device.lastSeenAt)}</td><td><code>{maskIp(device.lastIp)}</code></td><td>{device.liveSessions?.length ? device.liveSessions.map(session => <span key={session.id} className="sl-badge is-success">Mở từ {shortDateTime(session.startedAt)}</span>) : '—'}</td><td><div className="sl-detail-actions">{canShare && device.liveSessions?.map(session => <Button key={session.id} size="sm" variant="outline" onClick={() => mutate(() => kickSecureLectureSession(session.id), 'Đã đá phiên.', loadDevices)}>Đá phiên</Button>)}{canShare && !device.removedAt && <Button size="sm" variant="outline" icon={<Unplug />} onClick={() => deviceAction(device, 'remove')}>Gỡ</Button>}{canShare && !device.removedAt && <Button size="sm" variant={device.blockedAt ? 'outline' : 'danger'} icon={<ShieldBan />} onClick={() => deviceAction(device, device.blockedAt ? 'unblock' : 'block')}>{device.blockedAt ? 'Bỏ chặn' : 'Chặn'}</Button>}</div></td></tr>)}</tbody></table></div>} {selectedShare && <p className="sl-panel-note">{Math.max(0, selectedShare.maxDevices - selectedShare.deviceCount)} chỗ trống trong giới hạn {selectedShare.maxDevices} thiết bị. Danh sách tự làm mới mỗi 15 giây khi tab này đang mở.</p>}</section>}

    {tab === 'versions' && <section className="sl-detail-panel">{!versions.length ? <EmptyState icon={<History />} title="Chưa có phiên bản" /> : <div className="sl-responsive-table"><table className="sl-detail-table"><thead><tr><th>Phiên bản</th><th>File</th><th>Upload</th><th>Ghi chú</th><th /></tr></thead><tbody>{versions.map(version => { const current = version.id === lecture.currentVersion?.id; return <tr key={version.id}><td><span className={`sl-badge ${current ? 'is-success' : 'is-muted'}`}>v{version.versionNo}{current ? ' · đang dùng' : ''}</span></td><td><strong>{version.originalFilename} · {size(version.sizeBytes)}</strong><code>sha256 {version.sha256?.slice(0, 7)}…{version.sha256?.slice(-3)}</code></td><td>{shortDateTime(version.createdAt)}</td><td>{version.note || '—'}</td><td><div className="sl-detail-actions"><Button size="sm" variant="outline" icon={<Eye />} onClick={() => openPreview(version.id)}>Xem</Button>{canManage && !current && <Button size="sm" variant="outline" onClick={() => setVersionTarget(version)}>Dùng bản này</Button>}</div></td></tr>; })}</tbody></table></div>}</section>}
    {tab === 'logs' && <section className="sl-detail-panel"><AccessLogTable lectureId={id} showLecture={false} /></section>}
  </div>

  <ShareDialog open={Boolean(shareDialog)} lecture={lecture} versions={versions} share={shareDialog?.share} showMsg={showMsg} onClose={() => !busy && setShareDialog(null)} onSaved={async () => { setShareDialog(null); await refresh(); }} onCreated={async result => { setShareDialog(null); setCreated(result); await refresh(); }} />
  <ShareCreatedDialog result={created} showMsg={showMsg} onClose={closeCreated} />
  <FolderPickerDialog open={moveOpen} folders={folders} currentId={lecture.folderId} title="Di chuyển bài giảng" onClose={() => setMoveOpen(false)} onConfirm={async folderId => { const ok = await mutate(() => moveSecureLectures([id], folderId), 'Đã di chuyển bài giảng.'); if (ok) setMoveOpen(false); }} />
  <VersionUploadDialog open={uploadOpen} lectureId={id} showMsg={showMsg} onClose={() => setUploadOpen(false)} onUploaded={refresh} />
  <Modal open={Boolean(revokeTarget)} title={`Thu hồi link của ${revokeTarget?.recipientName || ''}?`} description="Thao tác này không thể hoàn tác và mọi phiên đang mở sẽ kết thúc." size="sm" onClose={busy ? undefined : () => setRevokeTarget(null)} footer={<><Button variant="outline" disabled={busy} onClick={() => setRevokeTarget(null)}>Huỷ</Button><Button variant="danger" loading={busy} onClick={async () => { const ok = await mutate(() => revokeSecureLectureShare(revokeTarget.id, revokeReason.trim()), 'Đã thu hồi link.'); if (ok) setRevokeTarget(null); }}>Thu hồi</Button></>}><label className="sl-dialog-field"><span>Lý do thu hồi</span><input value={revokeReason} onChange={event => setRevokeReason(event.target.value)} placeholder="Không bắt buộc" /></label></Modal>
  <Modal open={Boolean(versionTarget)} title={`Dùng phiên bản v${versionTarget?.versionNo}?`} description="Mọi link không cố định phiên bản sẽ dùng bản này từ lần mở tiếp theo." size="sm" onClose={busy ? undefined : () => setVersionTarget(null)} footer={<><Button variant="outline" disabled={busy} onClick={() => setVersionTarget(null)}>Huỷ</Button><Button loading={busy} onClick={async () => { const ok = await mutate(() => setSecureLectureCurrentVersion(id, versionTarget.id), 'Đã đổi bản đang dùng.'); if (ok) setVersionTarget(null); }}>Dùng bản này</Button></>}><p className="sl-confirm-copy">Link được cố định vào phiên bản khác sẽ không bị thay đổi.</p></Modal>
  </div>;
}
