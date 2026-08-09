import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AudioLines, Download, LoaderCircle, Pause, Play, RotateCcw, Volume2, VolumeX, WandSparkles } from 'lucide-react';
import './AudioReviewPlayer.css';

const API_BASE = '/api/submissions';
const bars = [34,58,42,76,54,88,46,68,38,82,62,94,52,72,44,86,57,75,39,64,48,80,55,70,36,61,45,78,50,66];
const time = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;

export default function AudioReviewPlayer({ fileId, src, variant = 'original', label, onClean, cleaning = false }) {
  const audioRef = useRef(null);
  const [url, setUrl] = useState(src || '');
  const [loading, setLoading] = useState(!src && !!fileId);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (src) { setUrl(src); setLoading(false); setError(''); return; }
    if (!fileId) { setUrl(''); setLoading(false); return; }
    let mounted = true;
    setLoading(true);
    axios.get(`${API_BASE}/file-url/${fileId}`).then(response => {
      if (mounted) setUrl(response.data.url || '');
    }).catch(() => mounted && setError('Không tải được tệp audio.')).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [fileId, src]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause(); else audioRef.current.play().catch(() => setError('Trình duyệt không thể phát audio.'));
  };
  const seek = event => {
    if (!audioRef.current) return;
    const next = Number(event.target.value);
    audioRef.current.currentTime = next;
    setCurrent(next);
  };
  const changeRate = next => {
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  return <div className={`audio-review-player ${variant}`}>
    <div className="audio-review-top"><span className="audio-review-mark">{variant === 'cleaned' ? <WandSparkles /> : <AudioLines />}</span><div><strong>{label || (variant === 'cleaned' ? 'Audio đã làm sạch' : 'Bản ghi gốc')}</strong><small>{variant === 'cleaned' ? 'Đã lọc nhiễu · Chuẩn hóa âm lượng' : 'Audio trực tiếp từ bài thi'}</small></div><em>{variant === 'cleaned' ? 'CLEAN' : 'ORIGINAL'}</em></div>
    {!url && !loading ? <div className="audio-review-empty"><span>{variant === 'cleaned' ? 'Chưa có audio đã làm sạch' : 'Không có bản ghi âm'}</span>{onClean && <button onClick={onClean} disabled={cleaning}>{cleaning ? <LoaderCircle className="spin" /> : <WandSparkles />}{cleaning ? 'Đang xử lý…' : 'Làm sạch ngay'}</button>}</div> : loading ? <div className="audio-review-loading"><LoaderCircle className="spin" /> Đang tải audio…</div> : error ? <div className="audio-review-error">{error}<button onClick={() => window.location.reload()}><RotateCcw /> Tải lại</button></div> : <>
      <audio ref={audioRef} src={url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)} />
      <div className="audio-waveform" aria-hidden="true">{bars.map((height, index) => <i key={index} className={duration && index / bars.length <= current / duration ? 'played' : ''} style={{ height: `${height}%` }} />)}</div>
      <input className="audio-seek" type="range" min="0" max={duration || 0} step="0.05" value={current} onChange={seek} aria-label={`Tiến trình ${label || 'audio'}`} />
      <div className="audio-review-controls"><button className="audio-play" onClick={toggle} aria-label={playing ? 'Tạm dừng' : 'Phát audio'}>{playing ? <Pause /> : <Play />}</button><span className="audio-time">{time(current)} <b>/</b> {time(duration)}</span><div className="audio-speed">{[0.75, 1, 1.25, 1.5].map(value => <button key={value} className={rate === value ? 'active' : ''} onClick={() => changeRate(value)}>{value}×</button>)}</div><button className="audio-icon-button" onClick={() => { setMuted(value => !value); if (audioRef.current) audioRef.current.muted = !muted; }} aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}>{muted ? <VolumeX /> : <Volume2 />}</button><a className="audio-icon-button" href={url} target="_blank" rel="noreferrer" download aria-label="Tải audio"><Download /></a></div>
    </>}
  </div>;
}
