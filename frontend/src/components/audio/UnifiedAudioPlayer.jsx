import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Download } from 'lucide-react';

const API_BASE = '/api/submissions';

const UnifiedAudioPlayer = ({ fileId, src }) => {
  const [url, setUrl] = useState(src || null);
  const [loading, setLoading] = useState(!src);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    if (src) {
      setUrl(src);
      setLoading(false);
      return;
    }
    if (!fileId) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    const fetchUrl = async () => {
      try {
        const res = await axios.get(`${API_BASE}/file-url/${fileId}`);
        if (isMounted) {
          if (res.data && res.data.success && res.data.url) {
            setUrl(res.data.url);
          } else {
            setError(res.data?.message || 'Không có URL hợp lệ');
          }
        }
      } catch (e) {
        console.error('Fetch Audio URL Error:', e);
        if (isMounted) {
          setError(e.message || 'Lỗi mạng');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchUrl();
    return () => {
      isMounted = false;
    };
  }, [fileId, src]);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const onTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
  };

  const onLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleProgressClick = (e) => {
    if (!audioRef.current || !progressRef.current) return;
    const rect = progressRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newTime = (clickX / width) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress((newTime / duration) * 100);
  };

  const handleSpeedChange = (rate) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  };

  const handleDownload = () => {
    if (!url) return;
    window.open(url, '_blank');
  };

  if (loading) return <div style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontStyle: 'italic', padding: '6px' }}>⏳ Đang tải tệp âm thanh...</div>;
  if (error || !url) return <div style={{ fontSize: '11px', color: 'var(--error)', fontStyle: 'italic', padding: '6px' }}>⚠️ Lỗi tải file.</div>;

  return (
    <div className="glass-container" style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', borderRadius: '8px',
      background: 'var(--surface-high)', border: '1px solid var(--bento-border)', width: '100%', maxWidth: '320px',
      flexWrap: 'nowrap'
    }}>
      <audio 
        ref={audioRef} 
        src={url} 
        onTimeUpdate={onTimeUpdate} 
        onLoadedMetadata={onLoadedMetadata} 
        onEnded={() => setIsPlaying(false)} 
      />
      
      <button 
        onClick={handlePlayPause} 
        style={{
          width: '24px', height: '24px', borderRadius: '50%', background: 'var(--primary)', color: 'var(--on-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', transition: 'transform 0.2s', flexShrink: 0
        }} 
        className="hover:scale-105 active:scale-95"
      >
        <span className="material-symbols-outlined" style={{ fontSize: '14px', fontVariationSettings: "'FILL' 1" }}>
          {isPlaying ? 'pause' : 'play_arrow'}
        </span>
      </button>

      <div style={{ flex: '1 1 80px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
        <div 
          ref={progressRef}
          onClick={handleProgressClick}
          style={{ position: 'relative', height: '4px', background: 'var(--outline-var)', borderRadius: '9999px', cursor: 'pointer' }}
        >
          <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'var(--primary)', width: `${progress}%`, borderRadius: '9999px' }}>
            <div style={{ position: 'absolute', right: -3, top: '50%', transform: 'translate(0, -50%)', width: '5px', height: '5px', borderRadius: '50%', background: '#fff', border: '1.5px solid var(--primary)' }} />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--on-surface-var)', opacity: 0.8 }}>
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'nowrap' }}>
        <select 
          value={playbackRate} 
          onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          style={{
            background: 'var(--surface-low)',
            border: '1px solid var(--outline-var)',
            borderRadius: '4px',
            color: 'var(--on-surface)',
            fontSize: '10px',
            fontWeight: '600',
            padding: '2px 4px',
            cursor: 'pointer',
            outline: 'none'
          }}
        >
          <option value="0.5">0.5x</option>
          <option value="0.8">0.8x</option>
          <option value="1">1.0x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
        </select>

        <button 
          onClick={toggleMute} 
          style={{ background: 'none', border: 'none', color: 'var(--on-surface-var)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
          title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {isMuted ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
        </button>

        <button 
          onClick={handleDownload} 
          title="Tải xuống tệp âm thanh"
          style={{
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--on-surface-var)',
            width: '24px', height: '24px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}
          className="hover:text-white"
        >
          <Download size={11} />
        </button>
      </div>
    </div>
  );
};

export default UnifiedAudioPlayer;
