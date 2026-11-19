import { Trash2, X } from 'lucide-react';

function slideLabel(key) {
  const match = /^slide-(\d+)$/.exec(key);
  if (match) return `Slide ${match[1]}`;
  if (key === 'default') return 'Mặc định';
  if (key === 'whiteboard') return 'Bảng trắng';
  return key.replace(/^#/, '') || 'Mặc định';
}

export default function NotesPanel({ slideKey, notes, viewedKey, setViewedKey, onChange, onDelete, onClose }) {
  const notedSlides = Object.keys(notes).filter(key => notes[key]?.trim());
  const selectedKey = viewedKey || slideKey;
  return <aside className="slp-notes" aria-label="Ghi chú bài giảng">
    <header>
      <div><strong>Ghi chú · {slideLabel(selectedKey)}</strong>
        {viewedKey && viewedKey !== slideKey && <small>Đang xem ghi chú cũ</small>}</div>
      <button type="button" title="Đóng ghi chú" onClick={onClose}><X /></button>
    </header>
    <textarea
      aria-label={`Ghi chú ${slideLabel(selectedKey)}`}
      placeholder="Nhập ghi chú riêng trên máy này…"
      value={notes[selectedKey] || ''}
      onChange={event => onChange(selectedKey, event.target.value)}
    />
    <div className="slp-notes__actions">
      {viewedKey && viewedKey !== slideKey && <button type="button" onClick={() => setViewedKey(null)}>Về slide hiện tại</button>}
      <button type="button" onClick={() => onDelete(selectedKey)} disabled={!notes[selectedKey]}><Trash2 />Xoá ghi chú slide</button>
    </div>
    <section>
      <strong>Slide đã có ghi chú</strong>
      {notedSlides.length ? <div className="slp-note-list">{notedSlides.map(key => <button type="button"
        className={selectedKey === key ? 'is-active' : ''} key={key} onClick={() => setViewedKey(key)}>
        {slideLabel(key)}</button>)}</div> : <p>Chưa có ghi chú nào.</p>}
    </section>
  </aside>;
}
