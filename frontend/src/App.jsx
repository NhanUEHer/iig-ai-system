console.log("App.jsx is loading...");
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate, useParams, useLocation } from 'react-router-dom';
import axios from 'axios';
import { 
  Search, RefreshCw, Layers, Database, User, Calendar, Mail, 
  Phone, CheckCircle, Clock, AlertTriangle, ArrowLeft, LogOut,
  FileText, MessageSquare, Shield, Users, Trash2, Plus, LogIn,
  Cpu, Sliders, Settings, Eye, EyeOff, Edit2, Download, HelpCircle
} from 'lucide-react';

const API_BASE = '/api/submissions';
const AUTH_BASE = '/api/auth';

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
  const audioRef = React.useRef(null);
  const progressRef = React.useRef(null);

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

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsMuted(val === 0);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
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
      
      {/* Play/Pause Button */}
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
 
      {/* Progress bar container */}
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
 
      {/* Controls: Speed, Volume Toggle, Download */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'nowrap' }}>
        {/* Speed Selector */}
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
 
        {/* Volume Icon Toggle Only (No Range Slider) */}
        <button 
          onClick={toggleMute} 
          style={{ background: 'none', border: 'none', color: 'var(--on-surface-var)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
          title={isMuted ? "Bật âm thanh" : "Tắt âm thanh"}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            {isMuted ? 'volume_off' : volume < 0.5 ? 'volume_down' : 'volume_up'}
          </span>
        </button>
 
        {/* Download Button */}
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

const AudioPlayer = UnifiedAudioPlayer;

// ── CardSection: labeled section block ──
const CardSection = ({ icon, label, children }) => (
  <div style={{ borderRadius: '12px', border: '1px solid var(--bento-border)', overflow: 'hidden', marginBottom: '12px', background: 'var(--surface-low)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: 'var(--surface-high)', borderBottom: '1px solid var(--bento-border)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--primary)' }}>{icon}</span>
      <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
    </div>
    <div style={{ padding: '16px 20px', background: 'transparent' }}>{children}</div>
  </div>
);

// ── AudioRow: label + stable AudioPlayer ──
const AudioRow = ({ label, fileId }) => fileId ? (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
    <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--on-surface-var)', display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>volume_up</span> {label}
    </span>
    <AudioPlayer fileId={fileId} />
  </div>
) : null;

// ── ModernWaveformPlayer: Aliased to UnifiedAudioPlayer ──
const ModernWaveformPlayer = UnifiedAudioPlayer;


const getQuestionType = (ans) => {
  const qNo = parseInt(ans.question_no, 10);
  if (ans.section === 'Writing') {
    if (qNo >= 1 && qNo <= 5) return 'w_picture';
    if (qNo >= 6 && qNo <= 7) return 'w_email';
    return 'w_text';
  }
  // Speaking section
  if (qNo === 1 || qNo === 2) return 'sp_read_aloud';
  if (qNo === 3 || qNo === 4) return 'sp_describe_pic';
  if (qNo >= 5 && qNo <= 7) return 'sp_respond_q';
  if (qNo >= 8 && qNo <= 10) return 'sp_respond_info';
  return 'sp_opinion';
};
const AnswerCard = ({ ans, answerStatusBadge, onGradeComplete, onCleanAudio }) => {
  const qType = getQuestionType(ans);
  const isWriting = ans.section === 'Writing';

  const TYPE_LABELS = {
    sp_read_aloud:   'Đọc to',
    sp_describe_pic: 'Mô tả hình ảnh',
    sp_respond_q:    'Trả lời câu hỏi',
    sp_respond_info: 'Trả lời theo thông tin',
    sp_opinion:      'Phát biểu ý kiến',
    w_picture:       'Viết câu',
    w_email:         'Viết thư / Email',
    w_text:          'Viết luận',
  };

  const accentColor  = isWriting ? 'var(--primary)' : 'var(--secondary)';
  const accentBg     = isWriting ? 'var(--primary-container)' : 'var(--secondary-container)';
  const accentBorder = 'var(--outline-var)';

  return (
    <div style={{
      background: 'var(--surface)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      border: '1px solid var(--outline-var)',
      marginBottom: '24px',
      overflow: 'hidden',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* 1. Header Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 20px',
        borderBottom: '1px solid var(--outline-var)',
        background: 'var(--surface-low)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: accentColor,
            color: 'var(--on-primary, #fff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '600',
            fontSize: '14px'
          }}>
            {ans.question_no}
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--on-surface)' }}>
              {ans.question_title || `${ans.section} — Câu ${ans.question_no}`}
            </h4>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <span style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: accentColor,
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: '600',
                border: `1px solid ${accentBorder}`,
                textTransform: 'uppercase',
                letterSpacing: '0.02em'
              }}>
                {TYPE_LABELS[qType]}
              </span>
            </div>
          </div>
        </div>
        {answerStatusBadge(ans.status)}
      </div>

      {/* AI Actions Row at the top of the card content */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: '1px solid var(--outline-var)',
        background: 'var(--surface-low)',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>psychology</span>
          <span style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>AI Action Center</span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Clean Audio Button */}
          {ans.section === 'Speaking' && ans.student_audio_file_id && (
            <button
              onClick={() => onCleanAudio && onCleanAudio(ans.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px',
                background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              className="hover:bg-green-900/20 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>cleaning_services</span>
              Làm sạch audio
            </button>
          )}

          {/* STT Button */}
          {ans.section === 'Speaking' && ans.student_audio_file_id && (
            <button
              onClick={() => onGradeComplete && onGradeComplete(ans.id, 'STT')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px',
                background: 'var(--surface-high)', border: '1px solid var(--outline-var)',
                color: 'var(--on-surface)', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
              className="hover:opacity-90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>translate</span>
              AI Transcribe
            </button>
          )}

          {/* Grading Button */}
          {true && (
            <button
              onClick={() => onGradeComplete && onGradeComplete(ans.id, 'Grading')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '6px',
                background: 'var(--primary)', border: 'none',
                color: 'var(--on-primary)', cursor: 'pointer', fontSize: '11px', fontWeight: '700',
                boxShadow: '0 2px 4px rgba(0,85,165,0.1)'
              }}
              className="hover:opacity-90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>auto_awesome</span>
              AI Grading
            </button>
          )}
        </div>
      </div>

      {/* 2. Bento Content Stack */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '20px',
        background: 'transparent'
      }}>
        {/* Top: Question Details (Full Width) */}
        <div style={{
          background: 'var(--surface-low)',
          border: '1px solid var(--bento-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-high)',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.04em',
            color: 'var(--on-surface-var)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: accentColor }}>help_outline</span>
            <span>NỘI DUNG ĐỀ BÀI</span>
          </div>
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Display prompt text (hidden for Writing Q1-5 to avoid duplicate keywords display) */}
            {ans.prompt_text && !(isWriting && qType === 'w_picture') && (
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface)', lineHeight: 1.6, fontWeight: '500' }}>
                {ans.prompt_text}
              </p>
            )}

            {/* Display context text / translation if exists */}
            {ans.context_text && (
              <div style={{ background: 'var(--surface-high)', borderRadius: '8px', padding: '12px 16px', fontSize: '12px', color: 'var(--on-surface-var)', lineHeight: 1.6, fontWeight: '400' }}>
                <strong>Transcript/Context:</strong> {ans.context_text}
              </div>
            )}

            {/* Image (if describe a picture or respond with info) */}
            {ans.image_url && (
              <img 
                src={ans.image_url} 
                alt="Đề bài" 
                style={{ width: '100%', maxHeight: '280px', objectFit: 'contain', borderRadius: '8px', background: 'var(--surface)' }} 
              />
            )}

            {/* Keywords for Writing */}
            {isWriting && ans.keywords && (
              <div style={{
                marginTop: '10px',
                padding: '12px 16px',
                background: 'rgba(0, 85, 165, 0.04)',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: '600', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>key</span>
                  <span>Từ khóa bắt buộc:</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ans.keywords.split(',').map((kw, i) => (
                    <span key={i} style={{
                      background: 'var(--surface-high)',
                      color: 'var(--on-surface)',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '600',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}>
                      {kw.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Question specific context audio player */}
            {ans.context_audio_file_id && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--on-surface-var)', fontWeight: '600' }}>Audio Tình Huống:</span>
                  <button 
                    onClick={() => onGradeComplete(ans.id, 'STT_CONTEXT')}
                    className="btn-secondary"
                    style={{ padding: '2px 8px', fontSize: '10px', height: '22px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                    title="Dịch âm thanh bối cảnh"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>translate</span> Dịch STT bối cảnh
                  </button>
                </div>
                <UnifiedAudioPlayer fileId={ans.context_audio_file_id} />
              </div>
            )}

            {/* Question audio player & question name */}
            {(ans.question_audio_file_id || ans.question_name) && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ans.question_name && (
                  <div style={{ borderLeft: '3px solid var(--primary)', paddingLeft: '10px', marginBottom: '4px' }}>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'var(--on-surface)', lineHeight: 1.6 }}>
                      {ans.question_name}
                    </p>
                  </div>
                )}
                {ans.question_audio_file_id && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--on-surface-var)', fontWeight: '600' }}>Audio Câu Hỏi:</span>
                      <button 
                        onClick={() => onGradeComplete(ans.id, 'STT_QUESTION')}
                        className="btn-secondary"
                        style={{ padding: '2px 8px', fontSize: '10px', height: '22px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                        title="Dịch âm thanh câu hỏi"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>translate</span> Dịch STT câu hỏi
                      </button>
                    </div>
                    <UnifiedAudioPlayer fileId={ans.question_audio_file_id} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom: Student Response & AI Transcription (Full Width) */}
        <div style={{
          background: 'var(--surface-low)',
          border: '1px solid var(--bento-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-high)',
            fontSize: '12px',
            fontWeight: '600',
            letterSpacing: '0.04em',
            color: 'var(--on-surface-var)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>person</span>
            <span>BÀI LÀM CỦA HỌC VIÊN</span>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {isWriting ? (
              <div style={{
                background: 'var(--surface)',
                borderRadius: '8px',
                padding: '14px',
                fontSize: '14px',
                color: 'var(--on-surface)',
                lineHeight: 1.6,
                minHeight: '120px',
                whiteSpace: 'pre-wrap',
                fontWeight: '400'
              }}>
                {ans.student_writing || <span style={{ color: 'var(--on-surface-var)', opacity: 0.5, fontStyle: 'italic' }}>Không có câu trả lời viết</span>}
              </div>
            ) : (
              <>
                {/* 2 Columns: Left is original recording, Right is cleaned recording */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '16px'
                }}>
                  {/* Left Column: Original Audio */}
                  <div style={{
                    background: 'var(--surface)',
                    borderRadius: '8px',
                    padding: '12px'
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--on-surface-var)', display: 'block', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      🎙️ Tệp Ghi Âm Gốc:
                    </span>
                    {ans.student_audio_file_id ? (
                      <UnifiedAudioPlayer fileId={ans.student_audio_file_id} />
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--error)', fontStyle: 'italic', fontWeight: '400' }}>Chưa nộp file ghi âm</span>
                    )}
                  </div>

                  {/* Right Column: Cleaned Audio */}
                  <div style={{
                    background: ans.cleaned_audio_url ? 'rgba(16, 185, 129, 0.04)' : 'transparent',
                    border: ans.cleaned_audio_url ? 'none' : '1px dashed var(--bento-border)',
                    borderRadius: '8px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center'
                  }}>
                    <span style={{ fontSize: '12px', color: ans.cleaned_audio_url ? '#10b981' : 'var(--on-surface-var)', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>music_note</span> Tệp Đã Làm Sạch:
                    </span>
                    {ans.cleaned_audio_url ? (
                      <UnifiedAudioPlayer src={ans.cleaned_audio_url} />
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--on-surface-var)', opacity: 0.6, fontStyle: 'italic', padding: '6px 0', fontWeight: '400' }}>
                        Chưa xử lý làm sạch âm thanh. Hãy nhấn nút "Làm sạch audio" bên dưới.
                      </div>
                    )}
                  </div>
                </div>

                {/* STT transcribed box */}
                {ans.transcribe && (
                  <div style={{
                    background: 'rgba(0, 85, 165, 0.04)',
                    borderLeft: '4px solid var(--primary)',
                    borderRadius: '0 8px 8px 0',
                    padding: '14px 18px',
                    fontSize: '14px',
                    color: 'var(--on-surface)',
                    lineHeight: 1.6,
                    position: 'relative',
                    marginTop: '8px'
                  }}>
                    <span style={{
                      display: 'inline-block',
                      fontSize: '11px', 
                      fontWeight: '700', 
                      color: 'var(--primary)', 
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      marginBottom: '6px'
                    }}>
                      📝 AI TRANSCRIBED TEXT (TRANSCRIBE)
                    </span>
                    <p style={{ margin: 0, fontWeight: '500' }}>{ans.transcribe}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>


    </div>
  );
};

/* Component to render Detailed AI Evaluation Cards in the Sidebar */
const AnswerEvaluationPanel = ({ ans }) => {
  if (!ans) return null;
  const isSpeaking = ans.section === 'Speaking';
  const qNo = ans.question_no;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
      {/* Speaking Q1-2 Detailed AI Grading Results */}
      {isSpeaking && (qNo === 1 || qNo === 2) && (ans.pronunciation_score || ans.intonation_score || ans.final_score) && (
        <div style={{
          background: 'var(--surface-high)',
          border: '1px solid var(--bento-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-low)',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.04em',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--bento-border)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grade</span>
            <span>KẾT QUẢ AI CHẤM ĐIỂM CHI TIẾT</span>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 85, 165, 0.05)',
              borderRadius: '16px',
              border: '2px solid rgba(0, 85, 165, 0.2)',
              padding: '16px',
              marginBottom: '4px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Tổng điểm AI</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--primary)', lineHeight: 1 }}>{Math.round(parseFloat(ans.final_score || 0))}</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(0, 85, 165, 0.4)' }}>/ 3</span>
              </div>
              <div style={{ padding: '3px 12px', background: 'var(--primary)', color: 'var(--on-primary, #fff)', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px' }}>
                Đạt yêu cầu
              </div>
            </div>

            {ans.pronunciation_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🗣️ Phát âm (Pronunciation)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.pronunciation_score))}/3</div>
                {ans.pronunciation_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.pronunciation_rationale}"</p>}
              </div>
            )}

            {ans.intonation_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📈 Ngữ điệu (Intonation)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.intonation_score))}/3</div>
                {ans.intonation_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.intonation_rationale}"</p>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:bg-primary/5 active:scale-95 transition-all">
                Xem log chấm
              </button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'var(--on-primary, #fff)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:opacity-90 active:scale-95 transition-all">
                Chỉnh sửa điểm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Speaking Q3-4 Detailed AI Grading Results */}
      {isSpeaking && (qNo === 3 || qNo === 4) && (ans.pronunciation_score || ans.intonation_score || ans.cohesion_score || ans.grammar_score || ans.vocabulary_score || ans.final_score) && (
        <div style={{
          background: 'var(--surface-high)',
          border: '1px solid var(--bento-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-low)',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.04em',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--bento-border)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grade</span>
            <span>KẾT QUẢ AI CHẤM ĐIỂM CHI TIẾT</span>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 85, 165, 0.05)',
              borderRadius: '16px',
              border: '2px solid rgba(0, 85, 165, 0.2)',
              padding: '16px',
              marginBottom: '4px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Tổng điểm AI</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--primary)', lineHeight: 1 }}>{Math.round(parseFloat(ans.final_score || 0))}</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(0, 85, 165, 0.4)' }}>/ 3</span>
              </div>
              <div style={{ padding: '3px 12px', background: 'var(--primary)', color: 'var(--on-primary, #fff)', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px' }}>
                Đạt yêu cầu
              </div>
            </div>

            {ans.pronunciation_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🗣️ Phát âm (Pronunciation)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.pronunciation_score))}/3</div>
                {ans.pronunciation_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.pronunciation_rationale}"</p>}
              </div>
            )}

            {ans.intonation_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📈 Ngữ điệu (Intonation)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.intonation_score))}/3</div>
                {ans.intonation_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.intonation_rationale}"</p>}
              </div>
            )}

            {ans.cohesion_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🔗 Mạch lạc (Cohesion)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.cohesion_score))}/3</div>
                {ans.cohesion_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.cohesion_rationale}"</p>}
              </div>
            )}

            {ans.grammar_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📝 Ngữ pháp (Grammar)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.grammar_score))}/3</div>
                {ans.grammar_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.grammar_rationale}"</p>}
              </div>
            )}

            {ans.vocabulary_score && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📚 Từ vựng (Vocabulary)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.vocabulary_score))}/3</div>
                {ans.vocabulary_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.vocabulary_rationale}"</p>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:bg-primary/5 active:scale-95 transition-all">
                Xem log chấm
              </button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'var(--on-primary, #fff)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:opacity-90 active:scale-95 transition-all">
                Chỉnh sửa điểm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Speaking Q5-11 Detailed AI Grading Results */}
      {isSpeaking && (qNo >= 5 && qNo <= 11) && (ans.pronunciation_score || ans.intonation_score || ans.cohesion_score || ans.grammar_score || ans.vocabulary_score || ans.completeness_score || ans.relevance_score || ans.final_score) && (
        <div style={{
          background: 'var(--surface-high)',
          border: '1px solid var(--bento-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-low)',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.04em',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--bento-border)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grade</span>
            <span>KẾT QUẢ AI CHẤM ĐIỂM CHI TIẾT</span>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 85, 165, 0.05)',
              borderRadius: '16px',
              border: '2px solid rgba(0, 85, 165, 0.2)',
              padding: '16px',
              marginBottom: '4px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Tổng điểm AI</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--primary)', lineHeight: 1 }}>{Math.round(parseFloat(ans.final_score || 0))}</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(0, 85, 165, 0.4)' }}>/ {qNo === 11 ? 5 : 3}</span>
              </div>
              <div style={{ padding: '3px 12px', background: 'var(--primary)', color: 'var(--on-primary, #fff)', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px' }}>
                Đạt yêu cầu
              </div>
            </div>

            {(ans.pronunciation_score !== null && ans.pronunciation_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🗣️ Phát âm (Pronunciation)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.pronunciation_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.pronunciation_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.pronunciation_rationale}"</p>}
              </div>
            )}

            {(ans.intonation_score !== null && ans.intonation_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📈 Ngữ điệu (Intonation)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.intonation_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.intonation_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.intonation_rationale}"</p>}
              </div>
            )}

            {(ans.cohesion_score !== null && ans.cohesion_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🔗 Mạch lạc (Cohesion)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.cohesion_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.cohesion_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.cohesion_rationale}"</p>}
              </div>
            )}

            {(ans.grammar_score !== null && ans.grammar_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📝 Ngữ pháp (Grammar)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.grammar_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.grammar_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.grammar_rationale}"</p>}
              </div>
            )}

            {(ans.vocabulary_score !== null && ans.vocabulary_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📚 Từ vựng (Vocabulary)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.vocabulary_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.vocabulary_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.vocabulary_rationale}"</p>}
              </div>
            )}

            {(ans.completeness_score !== null && ans.completeness_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🏁 Đầy đủ (Completeness)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.completeness_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.completeness_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.completeness_rationale}"</p>}
              </div>
            )}

            {(ans.relevance_score !== null && ans.relevance_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🎯 Phù hợp (Relevance)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.relevance_score))}/{qNo === 11 ? 5 : 3}</div>
                {ans.relevance_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.relevance_rationale}"</p>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:bg-primary/5 active:scale-95 transition-all">
                Xem log chấm
              </button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'var(--on-primary, #fff)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:opacity-90 active:scale-95 transition-all">
                Chỉnh sửa điểm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Writing Detailed AI Grading Results */}
      {ans.section === 'Writing' && (ans.grammar_score || ans.relevance_score || ans.cohesion_score || ans.vocabulary_score || ans.final_score) && (
        <div style={{
          background: 'var(--surface-high)',
          border: '1px solid var(--bento-border)',
          borderRadius: '12px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            background: 'var(--surface-low)',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '0.04em',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            borderBottom: '1px solid var(--bento-border)'
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grade</span>
            <span>KẾT QUẢ AI CHẤM ĐIỂM CHI TIẾT (WRITING)</span>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0, 85, 165, 0.05)',
              borderRadius: '16px',
              border: '2px solid rgba(0, 85, 165, 0.2)',
              padding: '16px',
              marginBottom: '4px',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
            }}>
              <p style={{ margin: '0 0 4px 0', fontSize: '11px', fontWeight: '800', color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>Tổng điểm AI</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                <span style={{ fontSize: '32px', fontWeight: '800', color: 'var(--primary)', lineHeight: 1 }}>{Math.round(parseFloat(ans.final_score || 0))}</span>
                <span style={{ fontSize: '16px', fontWeight: '600', color: 'rgba(0, 85, 165, 0.4)' }}>/ {qNo <= 5 ? 3 : qNo <= 7 ? 4 : 5}</span>
              </div>
              <div style={{ padding: '3px 12px', background: 'var(--primary)', color: 'var(--on-primary, #fff)', borderRadius: '9999px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '8px' }}>
                Đạt yêu cầu
              </div>
            </div>

            {(ans.grammar_score !== null && ans.grammar_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>📝 Ngữ pháp (Grammar)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.grammar_score))}/{qNo <= 5 ? 3 : qNo <= 7 ? 4 : 5}</div>
                {ans.grammar_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.grammar_rationale}"</p>}
              </div>
            )}

            {(ans.relevance_score !== null && ans.relevance_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🎯 Sự phù hợp (Relevance)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.relevance_score))}/{qNo <= 5 ? 3 : qNo <= 7 ? 4 : 5}</div>
                {ans.relevance_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.relevance_rationale}"</p>}
              </div>
            )}

            {(ans.cohesion_score !== null && ans.cohesion_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>🔗 Mạch lạc (Cohesion)</div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.cohesion_score))}/{qNo <= 7 ? 4 : 5}</div>
                {ans.cohesion_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.cohesion_rationale}"</p>}
              </div>
            )}

            {(ans.vocabulary_score !== null && ans.vocabulary_score !== undefined) && (
              <div style={{ background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--outline-var)' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', marginBottom: '4px' }}>
                  {qNo <= 5 ? '🔑 Từ khóa (Keyword)' : '📚 Từ vựng (Vocabulary)'}
                </div>
                <div style={{ fontSize: '15px', fontWeight: '800', color: 'var(--primary)' }}>{Math.round(parseFloat(ans.vocabulary_score))}/{qNo <= 7 ? 4 : 5}</div>
                {ans.vocabulary_rationale && <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--on-surface-var)', fontStyle: 'italic', lineHeight: 1.4 }}>"{ans.vocabulary_rationale}"</p>}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', paddingTop: '8px' }}>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:bg-primary/5 active:scale-95 transition-all">
                Xem log chấm
              </button>
              <button style={{ flex: 1, padding: '8px 0', borderRadius: '8px', border: 'none', background: 'var(--primary)', color: 'var(--on-primary, #fff)', fontWeight: '700', fontSize: '11px', cursor: 'pointer' }} className="hover:opacity-90 active:scale-95 transition-all">
                Chỉnh sửa điểm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SubmissionDetailView = ({ showMsg, getStatusBadge, addLiveLog }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [activeQuestionId, setActiveQuestionId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [selectedCleanIds, setSelectedCleanIds] = useState([]);
  const [selectedGradeIds, setSelectedGradeIds] = useState([]);
  const [selectedContextSttIds, setSelectedContextSttIds] = useState([]);
  const [selectedQuestionSttIds, setSelectedQuestionSttIds] = useState([]);
  const [bulkQueue, setBulkQueue] = useState(null);
  const [teacherNotes, setTeacherNotes] = useState({}); // { [answer_id]: string }
  const [savingNote, setSavingNote] = useState(null); // answer_id being saved

  const handleSaveTeacherNote = async (answer_id) => {
    const note = teacherNotes[answer_id] ?? '';
    setSavingNote(answer_id);
    try {
      await axios.put(`${API_BASE}/teacher-note`, { answer_id, teacher_note: note });
      showMsg('success', 'Đã lưu nhận xét giáo viên.');
      // Reflect in local data
      setData(prev => ({
        ...prev,
        answers: prev.answers.map(a =>
          a.id === answer_id
            ? { ...a, teacher_note: note }
            : a
        )
      }));
    } catch (e) {
      showMsg('error', 'Lưu nhận xét thất bại: ' + (e.response?.data?.error || e.message));
    } finally {
      setSavingNote(null);
    }
  };

  const [reviewMode, setReviewMode] = useState('grade'); // 'grade', 'clean', 'transcribe', 'stt_question', 'stt_context'

  const openReviewPopup = (mode = 'grade') => {
    if (!data || !data.answers) return;
    setReviewMode(mode);
    
    // Auto-select uncleaned speaking answers
    const uncleaned = data.answers
      .filter(a => a.section === 'Speaking' && a.student_audio_file_id && !a.cleaned_audio_url)
      .map(a => a.id);
    setSelectedCleanIds(uncleaned);

    // Auto-select pending / unscored answers for grading
    const unscored = data.answers
      .filter(a => a.status !== 'scored')
      .map(a => a.id);
    setSelectedGradeIds(unscored);

    // Auto-select questions with context audio
    const hasContext = data.answers
      .filter(a => a.context_audio_file_id)
      .map(a => a.id);
    setSelectedContextSttIds(hasContext);

    // Auto-select questions with question audio
    const hasQuestion = data.answers
      .filter(a => a.question_audio_file_id)
      .map(a => a.id);
    setSelectedQuestionSttIds(hasQuestion);

    setIsReviewOpen(true);
  };

  const runBulkCleanQueue = async (selectedIds) => {
    if (!selectedIds || selectedIds.length === 0) {
      showMsg('warning', 'Vui lòng chọn ít nhất 1 câu để làm sạch.');
      return;
    }

    setIsReviewOpen(false);
    setBulkQueue({
      totalCount: selectedIds.length,
      completedCount: 0,
      failedCount: 0,
      activeList: [],
      completedList: [],
      failedList: [],
      status: 'running',
      type: 'clean'
    });

    const queue = [...selectedIds];
    const activeList = [];
    const completedList = [];
    const failedList = [];

    const processNext = async () => {
      if (queue.length === 0 && activeList.length === 0) {
        setBulkQueue(prev => ({ ...prev, status: 'done' }));
        showMsg('success', 'Đã hoàn thành làm sạch hàng loạt!');
        
        // Final refresh
        const detailRes = await axios.get(`${API_BASE}/${id}`);
        if (detailRes.data.success) setData(detailRes.data.data);
        return;
      }

      while (queue.length > 0 && activeList.length < 1) {
        const nextId = queue.shift();
        activeList.push(nextId);
        
        setBulkQueue(prev => ({
          ...prev,
          activeList: [...activeList]
        }));

        (async (targetId) => {
          const ansRow = data.answers?.find(a => a.id === targetId);
          const labelQ = ansRow ? `${ansRow.section} Q${ansRow.question_no}` : targetId;
          try {
            if (addLiveLog) {
              addLiveLog(`🧹 [Hàng đợi] Bắt đầu làm sạch âm thanh: ${labelQ}`);
            }

            const res = await axios.post(`${API_BASE}/clean-audio`, { 
               answerId: targetId,
               method: 'ai'
            });

            if (res.data.success) {
              completedList.push(targetId);
              if (addLiveLog) {
                addLiveLog(`🟢 [Hàng đợi] Làm sạch câu: ${labelQ} thành công.`);
              }
              // Local update for real-time UI feel
              setData(prev => {
                const updatedAnswers = prev.answers.map(ans => {
                  if (ans.id === targetId) {
                    return { ...ans, cleaned_audio_url: res.data.data.cleaned_audio_url };
                  }
                  return ans;
                });
                return { ...prev, answers: updatedAnswers };
              });
            } else {
              failedList.push(targetId);
              if (addLiveLog) {
                addLiveLog(`🔴 [Hàng đợi] Làm sạch lỗi câu: ${labelQ} - ${res.data.error}`);
              }
            }
          } catch (err) {
            failedList.push(targetId);
            const errMsg = err.response?.data?.error || err.message;
            if (addLiveLog) {
              addLiveLog(`🔴 [Hàng đợi] Làm sạch lỗi câu: ${labelQ} - ${errMsg}`);
            }
          } finally {
            const index = activeList.indexOf(targetId);
            if (index > -1) activeList.splice(index, 1);

            setBulkQueue(prev => ({
              ...prev,
              activeList: [...activeList],
              completedList: [...completedList],
              failedList: [...failedList],
              completedCount: completedList.length,
              failedCount: failedList.length
            }));

            processNext();
          }
        })(nextId);
      }
    };

    processNext();
  };

  const runBulkGradeQueue = async (selectedIds) => {
    if (!selectedIds || selectedIds.length === 0) {
      showMsg('warning', 'Vui lòng chọn ít nhất 1 câu để chấm điểm.');
      return;
    }

    // 1. Fetch available agents first to check config
    showMsg('info', 'Đang tải danh sách AI Agents cấu hình...');
    let agentsList = [];
    try {
      const agentsRes = await axios.get('/api/agents');
      if (agentsRes.data.success) {
        agentsList = agentsRes.data.data;
      }
    } catch (e) {
      showMsg('error', 'Không thể kết nối đến server lấy cấu hình Agents.');
      return;
    }

    if (!agentsList.length) {
      showMsg('error', 'Chưa cấu hình AI Agent nào trên hệ thống.');
      return;
    }

    setIsReviewOpen(false);
    setBulkQueue({
      totalCount: selectedIds.length,
      completedCount: 0,
      failedCount: 0,
      activeList: [...selectedIds],
      completedList: [],
      failedList: [],
      status: 'running',
      type: 'grade'
    });

    const activeList = [...selectedIds];
    const completedList = [];
    const failedList = [];

    selectedIds.forEach((targetId) => {
      const ansRow = data.answers?.find(a => a.id === targetId);
      if (!ansRow) {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        return;
      }

      const qNo = parseInt(ansRow.question_no, 10);
      const labelQ = `${ansRow.section} Q${qNo}`;

      // Find matching agent
      let qTypeKey = '';
      if (ansRow.section === 'Speaking') {
        if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
        else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
        else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
        else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
        else qTypeKey = 'sp_opinion';
      } else {
        if (qNo >= 1 && qNo <= 5) qTypeKey = 'w_picture';
        else if (qNo >= 6 && qNo <= 7) qTypeKey = 'w_email';
        else qTypeKey = 'w_text';
      }

      const matchAgent = agentsList.find(agent => 
        agent.api_type === 'Grading' && 
        (agent.target_questions || []).includes(qTypeKey)
      );

      if (!matchAgent) {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        if (addLiveLog) {
          addLiveLog(`🔴 [Chấm song song] Lỗi câu: ${labelQ} - Không tìm thấy Agent cấu hình cho ${qTypeKey}`);
        }
        setBulkQueue(prev => ({
          ...prev,
          activeList: [...activeList],
          failedList: [...failedList],
          failedCount: failedList.length
        }));
        return;
      }

      // Execute request concurrently
      (async () => {
        try {
          if (addLiveLog) {
            addLiveLog(`🤖 [Chấm song song] Gọi AI Agent [${matchAgent.name}] chấm điểm: ${labelQ}`);
          }

          // Temporarily set local state status to scoring
          setData(prev => {
            const updatedAnswers = prev.answers.map(ans => {
              if (ans.id === targetId) return { ...ans, status: 'scoring' };
              return ans;
            });
            return { ...prev, answers: updatedAnswers };
          });

          const res = await axios.post(`${API_BASE}/grade-ai`, { 
             answerId: targetId,
             agentId: matchAgent.id
          });

          if (res.data.success) {
            completedList.push(targetId);
            if (addLiveLog) {
              const sc = res.data.data.scores || {};
              const finalVal = res.data.data.finalScore;
              let scoreDetailStr = '';
              if (qNo === 1 || qNo === 2) {
                scoreDetailStr = `Điểm: ${finalVal}/3 (Phát âm: ${Math.round(parseFloat(sc.pronunciation_score || 0))}/3, Ngữ điệu: ${Math.round(parseFloat(sc.intonation_score || 0))}/3)`;
              } else if (qNo === 3 || qNo === 4) {
                scoreDetailStr = `Điểm: ${finalVal}/3 (Phát âm: ${Math.round(parseFloat(sc.pronunciation_score || 0))}/3, Ngữ điệu: ${Math.round(parseFloat(sc.intonation_score || 0))}/3, Mạch lạc: ${Math.round(parseFloat(sc.cohesion_score || 0))}/3, Ngữ pháp: ${Math.round(parseFloat(sc.grammar_score || 0))}/3, Từ vựng: ${Math.round(parseFloat(sc.vocabulary_score || 0))}/3)`;
              } else if (qNo >= 5 && qNo <= 11) {
                const denom = qNo === 11 ? 5 : 3;
                scoreDetailStr = `Điểm: ${finalVal}/${denom} (Phát âm: ${Math.round(parseFloat(sc.pronunciation_score || 0))}/${denom}, Ngữ điệu: ${Math.round(parseFloat(sc.intonation_score || 0))}/${denom}, Mạch lạc: ${Math.round(parseFloat(sc.cohesion_score || 0))}/${denom}, Ngữ pháp: ${Math.round(parseFloat(sc.grammar_score || 0))}/${denom}, Từ vựng: ${Math.round(parseFloat(sc.vocabulary_score || 0))}/${denom}, Đầy đủ: ${Math.round(parseFloat(sc.completeness_score || 0))}/${denom}, Phù hợp: ${Math.round(parseFloat(sc.relevance_score || 0))}/${denom})`;
              } else {
                scoreDetailStr = `Điểm: ${finalVal}`;
              }
              addLiveLog(`🟢 [Chấm song song] AI Agent [${matchAgent.name}] chấm xong câu: ${labelQ} -> ${scoreDetailStr}`);
            }
            setData(prev => {
              const updatedAnswers = prev.answers.map(ans => {
                if (ans.id === targetId) return { ...ans, status: 'scored' };
                return ans;
              });
              return { ...prev, answers: updatedAnswers };
            });
          } else {
            failedList.push(targetId);
            if (addLiveLog) {
              addLiveLog(`🔴 [Chấm song song] Lỗi câu: ${labelQ} - ${res.data.error}`);
            }
            setData(prev => {
              const updatedAnswers = prev.answers.map(ans => {
                if (ans.id === targetId) return { ...ans, status: 'error' };
                return ans;
              });
              return { ...prev, answers: updatedAnswers };
            });
          }
        } catch (err) {
          failedList.push(targetId);
          const errMsg = err.response?.data?.error || err.message;
          if (addLiveLog) {
            addLiveLog(`🔴 [Chấm song song] Lỗi câu: ${labelQ} - ${errMsg}`);
          }
          setData(prev => {
            const updatedAnswers = prev.answers.map(ans => {
              if (ans.id === targetId) return { ...ans, status: 'error' };
              return ans;
            });
            return { ...prev, answers: updatedAnswers };
          });
        } finally {
          const index = activeList.indexOf(targetId);
          if (index > -1) activeList.splice(index, 1);

          const isFinished = activeList.length === 0;
          setBulkQueue(prev => ({
            ...prev,
            activeList: [...activeList],
            completedList: [...completedList],
            failedList: [...failedList],
            completedCount: completedList.length,
            failedCount: failedList.length,
            status: isFinished ? 'done' : 'running'
          }));

          if (isFinished) {
            showMsg('success', 'Đã hoàn thành chấm điểm song song!');
            const detailRes = await axios.get(`${API_BASE}/${id}`);
            if (detailRes.data.success) setData(detailRes.data.data);
          }
        }
      })();
    });
  };

  const [isToolsOpen, setIsToolsOpen] = useState(false);

  const runBulkTranscribeQueue = async (selectedIds) => {
    if (!selectedIds || selectedIds.length === 0) {
      showMsg('warning', 'Vui lòng chọn ít nhất 1 câu để chạy Transcribe.');
      return;
    }

    showMsg('info', 'Đang tải danh sách AI Agents cấu hình...');
    let agentsList = [];
    try {
      const agentsRes = await axios.get('/api/agents');
      if (agentsRes.data.success) {
        agentsList = agentsRes.data.data;
      }
    } catch (e) {
      showMsg('error', 'Không thể kết nối đến server lấy cấu hình Agents.');
      return;
    }

    if (!agentsList.length) {
      showMsg('error', 'Chưa cấu hình AI Agent nào trên hệ thống.');
      return;
    }

    setIsReviewOpen(false);
    setBulkQueue({
      totalCount: selectedIds.length,
      completedCount: 0,
      failedCount: 0,
      activeList: [...selectedIds],
      completedList: [],
      failedList: [],
      status: 'running',
      type: 'transcribe'
    });

    const activeList = [...selectedIds];
    const completedList = [];
    const failedList = [];

    selectedIds.forEach((targetId) => {
      const ansRow = data.answers?.find(a => a.id === targetId);
      if (!ansRow) {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        return;
      }

      const qNo = parseInt(ansRow.question_no, 10);
      const labelQ = `${ansRow.section} Q${qNo}`;

      // Find matching agent
      let qTypeKey = '';
      if (ansRow.section === 'Speaking') {
        if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
        else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
        else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
        else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
        else qTypeKey = 'sp_opinion';
      } else {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        return;
      }

      const matchAgent = agentsList.find(agent => 
        agent.api_type === 'STT' && 
        (agent.target_questions || []).includes(qTypeKey)
      );

      if (!matchAgent) {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        if (addLiveLog) {
          addLiveLog(`🔴 [STT Song song] Lỗi câu: ${labelQ} - Không tìm thấy Agent STT.`);
        }
        setBulkQueue(prev => ({
          ...prev,
          activeList: [...activeList],
          failedList: [...failedList],
          failedCount: failedList.length
        }));
        return;
      }

      // Execute request concurrently
      (async () => {
        try {
          if (addLiveLog) {
            addLiveLog(`🤖 [STT Song song] Gọi AI Agent [${matchAgent.name}] chạy Transcribe: ${labelQ}`);
          }

          const res = await axios.post(`${API_BASE}/transcribe-ai`, { 
             answerId: targetId,
             agentId: matchAgent.id
          });

          if (res.data.success) {
            completedList.push(targetId);
            if (addLiveLog) {
              addLiveLog(`🟢 [STT Song song] Transcribe thành công câu: ${labelQ}`);
            }

            // Immediately update react state to display the text in real-time
            setData(prev => {
              const updatedAnswers = prev.answers.map(ans => {
                if (ans.id === targetId) {
                  return { 
                    ...ans, 
                    ai_evaluation_results: res.data.data.ai_evaluation_results || ans.ai_evaluation_results 
                  };
                }
                return ans;
              });
              return { ...prev, answers: updatedAnswers };
            });

          } else {
            failedList.push(targetId);
            if (addLiveLog) {
              addLiveLog(`🔴 [STT Song song] Lỗi câu: ${labelQ} - ${res.data.error}`);
            }
          }
        } catch (err) {
          failedList.push(targetId);
          const errMsg = err.response?.data?.error || err.message;
          if (addLiveLog) {
            addLiveLog(`🔴 [STT Song song] Lỗi câu: ${labelQ} - ${errMsg}`);
          }
        } finally {
          const index = activeList.indexOf(targetId);
          if (index > -1) activeList.splice(index, 1);

          const isFinished = activeList.length === 0;
          setBulkQueue(prev => ({
            ...prev,
            activeList: [...activeList],
            completedList: [...completedList],
            failedList: [...failedList],
            completedCount: completedList.length,
            failedCount: failedList.length,
            status: isFinished ? 'done' : 'running'
          }));

          if (isFinished) {
            showMsg('success', 'Đã hoàn thành Transcribe song song!');
            const detailRes = await axios.get(`${API_BASE}/${id}`);
            if (detailRes.data.success) setData(detailRes.data.data);
          }
        }
      })();
    });
  };

  const runBulkTargetSttQueue = async (selectedIds, modeType) => {
    if (!selectedIds || selectedIds.length === 0) {
      showMsg('warning', 'Vui lòng chọn ít nhất 1 câu để chạy Transcribe.');
      return;
    }

    showMsg('info', 'Đang tải danh sách AI Agents cấu hình...');
    let agentsList = [];
    try {
      const agentsRes = await axios.get('/api/agents');
      if (agentsRes.data.success) {
        agentsList = agentsRes.data.data;
      }
    } catch (e) {
      showMsg('error', 'Không thể kết nối đến server lấy cấu hình Agents.');
      return;
    }

    const agentTarget = modeType === 'STT_QUESTION' ? 'question' : 'context';

    setIsReviewOpen(false);
    setBulkQueue({
      totalCount: selectedIds.length,
      completedCount: 0,
      failedCount: 0,
      activeList: [...selectedIds],
      completedList: [],
      failedList: [],
      status: 'running',
      type: modeType === 'STT_QUESTION' ? 'transcribe_question' : 'transcribe_context'
    });

    const activeList = [...selectedIds];
    const completedList = [];
    const failedList = [];

    selectedIds.forEach((targetId) => {
      const ansRow = data.answers?.find(a => a.id === targetId);
      if (!ansRow) {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        return;
      }

      const qNo = parseInt(ansRow.question_no, 10);
      const labelQ = `${ansRow.section} Q${qNo}`;

      // Find matching agent
      let qTypeKey = '';
      if (ansRow.section === 'Speaking') {
        if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
        else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
        else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
        else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
        else qTypeKey = 'sp_opinion';
      } else {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        return;
      }

      const matchAgent = agentsList.find(agent => 
        agent.api_type === 'STT' && 
        agent.stt_target === agentTarget &&
        (agent.target_questions || []).includes(qTypeKey)
      );

      if (!matchAgent) {
        const index = activeList.indexOf(targetId);
        if (index > -1) activeList.splice(index, 1);
        failedList.push(targetId);
        if (addLiveLog) {
          addLiveLog(`🔴 [STT Song song] Lỗi câu: ${labelQ} - Không tìm thấy Agent STT nhắm tới ${agentTarget}.`);
        }
        setBulkQueue(prev => ({
          ...prev,
          activeList: [...activeList],
          failedList: [...failedList],
          failedCount: failedList.length
        }));
        return;
      }

      // Execute request concurrently
      (async () => {
        try {
          if (addLiveLog) {
            addLiveLog(`🤖 [STT Song song] Gọi AI Agent [${matchAgent.name}] chạy Transcribe ${agentTarget}: ${labelQ}`);
          }

          const res = await axios.post(`${API_BASE}/transcribe-ai`, { 
             answerId: targetId,
             agentId: matchAgent.id,
             targetType: agentTarget
          });

          if (res.data.success) {
            completedList.push(targetId);
            if (addLiveLog) {
              addLiveLog(`🟢 [STT Song song] Transcribe thành công ${agentTarget} câu: ${labelQ}`);
            }

            // Immediately update react state to display the text in real-time
            setData(prev => {
              const updatedAnswers = prev.answers.map(ans => {
                if (ans.id === targetId) {
                  return { 
                    ...ans, 
                    question_name: agentTarget === 'question' ? res.data.data.transcribe : ans.question_name,
                    context_text: agentTarget === 'context' ? res.data.data.transcribe : ans.context_text
                  };
                }
                return ans;
              });
              return { ...prev, answers: updatedAnswers };
            });

          } else {
            failedList.push(targetId);
            if (addLiveLog) {
              addLiveLog(`🔴 [STT Song song] Lỗi câu: ${labelQ} - ${res.data.error}`);
            }
          }
        } catch (err) {
          failedList.push(targetId);
          const errMsg = err.response?.data?.error || err.message;
          if (addLiveLog) {
            addLiveLog(`🔴 [STT Song song] Lỗi câu: ${labelQ} - ${errMsg}`);
          }
        } finally {
          const index = activeList.indexOf(targetId);
          if (index > -1) activeList.splice(index, 1);

          const isFinished = activeList.length === 0;
          setBulkQueue(prev => ({
            ...prev,
            activeList: [...activeList],
            completedList: [...completedList],
            failedList: [...failedList],
            completedCount: completedList.length,
            failedCount: failedList.length,
            status: isFinished ? 'done' : 'running'
          }));

          if (isFinished) {
            showMsg('success', `Đã hoàn thành Transcribe song song cho ${agentTarget}!`);
            const detailRes = await axios.get(`${API_BASE}/${id}`);
            if (detailRes.data.success) setData(detailRes.data.data);
          }
        }
      })();
    });
  };

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_BASE}/${id}`);
        if (res.data.success) {
          setData(res.data.data);
          if (res.data.data.answers && res.data.data.answers.length > 0) {
            setActiveQuestionId(res.data.data.answers[0].id);
          }
        }
      } catch (e) {
        showMsg('error', 'Không thể tải chi tiết: ' + e.message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
      <RefreshCw className="spinner" size={36} style={{ color: '#3b82f6' }}/>
      <div style={{ color: '#64748b', fontSize: '15px', fontWeight: '500' }}>Đang tải chi tiết bài làm...</div>
    </div>
  );

  if (!data) return (
    <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px' }}>
      <AlertTriangle size={40} style={{ color: '#f59e0b', marginBottom: '12px' }}/>
      <h3 style={{ margin: 0 }}>Không tìm thấy bài làm</h3>
    </div>
  );

  const writingAnswers = data.answers?.filter(a => a.section === 'Writing') || [];
  const speakingAnswers = data.answers?.filter(a => a.section === 'Speaking') || [];

  const answerStatusBadge = (status) => {
    const map = {
      pending:  { bg: '#fef3c7', color: '#92400e', label: 'Chờ chấm' },
      scoring:  { bg: '#dbeafe', color: '#1e40af', label: 'Đang chấm' },
      scored:   { bg: '#d1fae5', color: '#065f46', label: 'Đã chấm' },
      error:    { bg: '#fee2e2', color: '#991b1b', label: 'Lỗi' },
    };
    const s = map[status] || { bg: '#f1f5f9', color: '#475569', label: status };
    return (
      <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
        {s.label}
      </span>
    );
  };

  const handleGradeAI = async (answerId, apiTypeVal = 'STT') => {
    // Determine target question type details
    const ansRow = data.answers?.find(a => a.id === answerId);
    if (!ansRow) return;
    const qNo = parseInt(ansRow.question_no, 10);
    const labelQ = `${ansRow.section} Q${qNo}`;

    try {
      // 1. Fetch available agents to find match
      showMsg('info', `Đang tìm kiếm Agent ${apiTypeVal === 'STT' ? 'Transcribe' : 'Grading'} phù hợp...`);
      const agentsRes = await axios.get('/api/agents');
      if (!agentsRes.data.success || !agentsRes.data.data.length) {
        showMsg('error', 'Chưa cấu hình AI Agent nào trên hệ thống. Vui lòng vào mục Quản lý Agent.');
        return;
      }

      // Find answer row to determine qType
      let qTypeKey = '';
      if (ansRow.section === 'Speaking') {
        if (qNo === 1 || qNo === 2) qTypeKey = 'sp_read_aloud';
        else if (qNo === 3 || qNo === 4) qTypeKey = 'sp_describe_pic';
        else if (qNo >= 5 && qNo <= 7) qTypeKey = 'sp_respond_q';
        else if (qNo >= 8 && qNo <= 10) qTypeKey = 'sp_respond_info';
        else qTypeKey = 'sp_opinion';
      } else {
        if (qNo >= 1 && qNo <= 5) qTypeKey = 'w_picture';
        else if (qNo >= 6 && qNo <= 7) qTypeKey = 'w_email';
        else qTypeKey = 'w_text';
      }

      // Resolve matching Agent
      const agentTarget = apiTypeVal === 'STT_QUESTION' ? 'question' : (apiTypeVal === 'STT_CONTEXT' ? 'context' : 'student_answer');
      const apiTypeValCore = (apiTypeVal === 'STT' || apiTypeVal === 'STT_QUESTION' || apiTypeVal === 'STT_CONTEXT') ? 'STT' : 'Grading';

      const matchAgent = agentsRes.data.data.find(agent => 
        agent.api_type === apiTypeValCore && 
        (apiTypeValCore === 'STT' ? (agent.stt_target === agentTarget) : true) &&
        (agent.target_questions || []).includes(qTypeKey)
      );

      if (!matchAgent) {
        showMsg('error', `Không tìm thấy Agent loại ${apiTypeValCore === 'STT' ? 'Transcribe' : 'Grading'} nhắm tới ${agentTarget} nào được gán cho câu hỏi nhóm: ${qTypeKey.replace('sp_', 'Speaking ').replace('w_', 'Writing ')}`);
        return;
      }

      showMsg('info', `Kích hoạt Agent: ${matchAgent.name}...`);
      if (addLiveLog) {
        addLiveLog(`🤖 Kích hoạt Dify AI Agent [${matchAgent.name}] cho câu: ${labelQ} (${agentTarget})`);
      }

      // Update status to 'scoring' locally for immediate visual feedback
      setData(prev => {
        if (!prev || !prev.answers) return prev;
        const updatedAnswers = prev.answers.map(ans => {
          if (ans.id === answerId) return { ...ans, status: 'scoring' };
          return ans;
        });
        return { ...prev, answers: updatedAnswers };
      });

      const targetEndpoint = apiTypeValCore === 'STT' ? 'transcribe-ai' : 'grade-ai';
      const res = await axios.post(`${API_BASE}/${targetEndpoint}`, { 
        answerId, 
        agentId: matchAgent.id,
        targetType: agentTarget
      });

      if (res.data.success) {
        showMsg('success', `${apiTypeValCore === 'STT' ? 'STT' : 'Chấm điểm'} hoàn tất!`);
        if (addLiveLog) {
          if (apiTypeVal === 'Grading') {
            const sc = res.data.data.scores || {};
            const finalVal = res.data.data.finalScore;
            let scoreDetailStr = '';
            if (qNo === 1 || qNo === 2) {
              scoreDetailStr = `Điểm: ${finalVal}/3 (Phát âm: ${Math.round(parseFloat(sc.pronunciation_score || 0))}/3, Ngữ điệu: ${Math.round(parseFloat(sc.intonation_score || 0))}/3)`;
            } else if (qNo === 3 || qNo === 4) {
              scoreDetailStr = `Điểm: ${finalVal}/3 (Phát âm: ${Math.round(parseFloat(sc.pronunciation_score || 0))}/3, Ngữ điệu: ${Math.round(parseFloat(sc.intonation_score || 0))}/3, Mạch lạc: ${Math.round(parseFloat(sc.cohesion_score || 0))}/3, Ngữ pháp: ${Math.round(parseFloat(sc.grammar_score || 0))}/3, Từ vựng: ${Math.round(parseFloat(sc.vocabulary_score || 0))}/3)`;
            } else if (qNo >= 5 && qNo <= 11) {
              const denom = qNo === 11 ? 5 : 3;
              scoreDetailStr = `Điểm: ${finalVal}/${denom} (Phát âm: ${Math.round(parseFloat(sc.pronunciation_score || 0))}/${denom}, Ngữ điệu: ${Math.round(parseFloat(sc.intonation_score || 0))}/${denom}, Mạch lạc: ${Math.round(parseFloat(sc.cohesion_score || 0))}/${denom}, Ngữ pháp: ${Math.round(parseFloat(sc.grammar_score || 0))}/${denom}, Từ vựng: ${Math.round(parseFloat(sc.vocabulary_score || 0))}/${denom}, Đầy đủ: ${Math.round(parseFloat(sc.completeness_score || 0))}/${denom}, Phù hợp: ${Math.round(parseFloat(sc.relevance_score || 0))}/${denom})`;
            } else {
              scoreDetailStr = `Điểm: ${finalVal}`;
            }
            addLiveLog(`🟢 AI Agent [${matchAgent.name}] chấm điểm câu: ${labelQ} thành công. -> ${scoreDetailStr}`);
          } else {
            const targetNameMap = agentTarget === 'question' ? 'câu hỏi' : (agentTarget === 'context' ? 'bối cảnh' : 'bài nói');
            addLiveLog(`🟢 AI Agent [${matchAgent.name}] trả kết quả transcribe ${targetNameMap} câu: ${labelQ} thành công.`);
          }
        }
        // Reload details to display new data
        const detailRes = await axios.get(`${API_BASE}/${id}`);
        if (detailRes.data.success) setData(detailRes.data.data);
      } else {
        showMsg('error', 'Lỗi: ' + res.data.error);
        if (addLiveLog) {
          addLiveLog(`🔴 AI Agent [${matchAgent.name}] báo lỗi câu: ${labelQ} - ${res.data.error}`);
        }
      }
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message;
      showMsg('error', 'Lỗi thực thi AI Agent: ' + errMsg);
      if (addLiveLog) {
        addLiveLog(`🔴 AI Agent thực thi thất bại câu: ${labelQ} - ${errMsg}`);
      }
    }
  };

  const handleCleanAudio = async (answerId) => {
    const ansRow = data.answers?.find(a => a.id === answerId);
    if (!ansRow) return;
    const labelQ = `${ansRow.section} Q${ansRow.question_no}`;

    try {
      showMsg('info', `Đang tiến hành làm sạch & khuếch đại âm lượng cho câu ${labelQ}...`);
      if (addLiveLog) {
        addLiveLog(`🧹 Bắt đầu tiến hành lọc nhiễu âm thanh câu: ${labelQ}`);
      }

      const res = await axios.post(`${API_BASE}/clean-audio`, { 
        answerId,
        method: 'ai'
      });

      if (res.data.success) {
        showMsg('success', 'Làm sạch âm thanh thành công!');
        if (addLiveLog) {
          addLiveLog(`🟢 Làm sạch âm thanh câu: ${labelQ} thành công. Mô hình áp dụng: ${res.data.data.methodUsed.toUpperCase()}`);
        }
        // Reload details to display new data
        const detailRes = await axios.get(`${API_BASE}/${id}`);
        if (detailRes.data.success) setData(detailRes.data.data);
      } else {
        showMsg('error', 'Lọc âm thất bại: ' + res.data.error);
        if (addLiveLog) {
          addLiveLog(`🔴 Lọc nhiễu âm thanh lỗi câu: ${labelQ} - ${res.data.error}`);
        }
      }
    } catch (e) {
      const errMsg = e.response?.data?.error || e.message;
      showMsg('error', 'Lọc nhiễu âm thanh thất bại: ' + errMsg);
      if (addLiveLog) {
        addLiveLog(`🔴 Lọc nhiễu âm thanh thất bại câu: ${labelQ} - ${errMsg}`);
      }
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--bg)', padding: '24px', position: 'relative' }}>

      {/* Background patterns */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.15, pointerEvents: 'none', zIndex: 0,
        backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)',
        backgroundSize: '40px 40px'
      }}></div>
      <div style={{
        position: 'absolute', top: '-80px', left: '-80px', width: '250px', height: '250px', borderRadius: '50%', pointerEvents: 'none', zIndex: 0,
        background: 'radial-gradient(circle, rgba(168, 200, 255, 0.08) 0%, transparent 70%)'
      }}></div>

      {/* TOP BAR */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', position: 'relative', zIndex: 1 }}>
        <button
          onClick={() => navigate('/submissions')}
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', fontSize: '13px' }}
        >
          <ArrowLeft size={16}/> Quay lại danh sách
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {getStatusBadge(data.status)}
          <span style={{ fontSize: '12px', color: 'var(--on-surface-var)' }}>ID: {data.id?.substring(0, 8)}...</span>
        </div>
      </div>

      {/* SCROLLABLE CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', position: 'relative', zIndex: 1 }}>

        {/* === CANDIDATE INFO CARD === */}
        <section className="glass-card" style={{ 
          padding: '24px', 
          marginBottom: '32px', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', 
          gap: '24px', 
          position: 'relative', 
          overflow: 'hidden',
          alignItems: 'center'
        }}>
          {/* AI Accent Glow */}
          <div style={{ position: 'absolute', top: 0, right: 0, width: '256px', height: '256px', background: 'rgba(0, 85, 165, 0.05)', borderRadius: '50%', filter: 'blur(100px)', zIndex: -1 }}></div>
          
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{
              width: '64px', height: '64px', borderRadius: '12px', background: 'var(--primary-container)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '24px', boxShadow: '0 8px 32px rgba(0,85,165,0.2)', flexShrink: 0
            }}>
              {(data.student_name || 'N').charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.student_name}</h3>
              <p style={{ margin: '4px 0 10px 0', fontSize: '13px', color: 'var(--on-surface-var)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{data.test_name}</p>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--on-surface-var)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>mail</span> {data.student_email || 'Chưa có email'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>call</span> {data.student_phone || 'Chưa có SĐT'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>event_available</span> Nộp: {new Date(data.submitted_date).toLocaleString('vi-VN')}
                </span>
              </div>
            </div>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '10px', 
            width: '100%', 
            alignItems: 'center' 
          }}>
            <div className="glass-card" style={{ padding: '20px 12px', borderRadius: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(168,200,255,0.1)' }}>
              <p style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: 'var(--primary)' }}>{data.answers?.length || 0}</p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Tổng câu</p>
            </div>
            <div className="glass-card" style={{ padding: '20px 12px', borderRadius: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(168,200,255,0.1)' }}>
              <p style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: 'var(--on-surface)' }}>{writingAnswers.length}</p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Writing</p>
            </div>
            <div className="glass-card" style={{ padding: '20px 12px', borderRadius: '12px', textAlign: 'center', background: 'rgba(0, 85, 165, 0.05)', border: '1px solid rgba(0, 85, 165, 0.2)' }}>
              <p style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: 'var(--primary)' }}>{speakingAnswers.length}</p>
              <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: 'var(--primary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Speaking</p>
            </div>
            <div className="glass-card" style={{ padding: '20px 12px', borderRadius: '12px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Keycode</p>
              <p style={{ margin: '6px 0 0 0', fontSize: '20px', fontWeight: '800', color: 'var(--on-surface)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{data.keycode}</p>
            </div>
          </div>

          {/* Column 3 deleted to let Column 1 & 2 resize full width without overflow clipping */}
        </section>

        {/* Side-by-side active question workspace and evaluation sidebar */}
        {(() => {
          const activeAns = data.answers?.find(a => a.id === activeQuestionId);
          if (!activeAns) {
            return (
              <div style={{ textAlign: 'center', padding: '60px', color: 'var(--on-surface-var)', opacity: 0.7 }}>
                Vui lòng mở "Danh sách câu hỏi" ở thanh điều khiển trên cùng và chọn một câu hỏi để chấm.
              </div>
            );
          }
          const activeIdx = activeAns.section === 'Speaking' 
            ? speakingAnswers.findIndex(a => a.id === activeAns.id) 
            : writingAnswers.findIndex(a => a.id === activeAns.id);

          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) 380px',
              gap: '24px',
              marginTop: '20px',
              alignItems: 'flex-start'
            }}>
              {/* Left Column: Active Answer Details Card (Content only) */}
              <div style={{ minWidth: 0 }}>
                <AnswerCard 
                  ans={activeAns} 
                  index={activeIdx} 
                  answerStatusBadge={answerStatusBadge}
                  onGradeComplete={handleGradeAI}
                  onCleanAudio={handleCleanAudio}
                />
              </div>

              {/* Right Column: Compact Navigation + AI detailed evaluation scores (Sidebar) */}
              <div style={{
                width: '380px',
                position: 'sticky',
                top: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                {/* Compact Question Navigator Sidebar Widget */}
                <div style={{
                  background: 'var(--surface-high)',
                  border: '1px solid var(--bento-border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{
                    padding: '12px 16px',
                    background: 'var(--surface-low)',
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.04em',
                    color: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderBottom: '1px solid var(--bento-border)'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>explore</span>
                    <span>BẢNG ĐIỀU HƯỚNG CÂU HỎI</span>
                  </div>

                  <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Speaking selector */}
                    {speakingAnswers.length > 0 && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#16a34a' }}>interpreter_mode</span>
                          <span style={{ fontSize: '10px', fontWeight: '800', color: '#15803d', textTransform: 'uppercase' }}>Speaking</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                          {speakingAnswers.map(ans => {
                            const isActive = activeQuestionId === ans.id;
                            const isScored = ans.status === 'scored';
                            return (
                              <button
                                key={ans.id}
                                onClick={() => setActiveQuestionId(ans.id)}
                                style={{
                                  padding: '6px 0',
                                  borderRadius: '6px',
                                  border: isActive ? '2px solid var(--primary)' : isScored ? '1px solid #10b981' : '1px solid var(--bento-border)',
                                  background: isActive ? 'rgba(0, 85, 165, 0.12)' : isScored ? 'rgba(16, 185, 129, 0.06)' : 'var(--surface)',
                                  color: isActive ? 'var(--primary)' : isScored ? '#10b981' : 'var(--on-surface-var)',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  textAlign: 'center',
                                  transition: 'all 0.15s'
                                }}
                                title={`Câu ${ans.question_no} (${isScored ? 'Đã chấm' : 'Chưa chấm'})`}
                                className="hover:scale-105 active:scale-95"
                              >
                                {ans.question_no}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Writing selector */}
                    {writingAnswers.length > 0 && (
                      <div style={{ marginTop: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#2563eb' }}>edit_note</span>
                          <span style={{ fontSize: '10px', fontWeight: '800', color: '#1e40af', textTransform: 'uppercase' }}>Writing</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
                          {writingAnswers.map(ans => {
                            const isActive = activeQuestionId === ans.id;
                            const isScored = ans.status === 'scored';
                            return (
                              <button
                                key={ans.id}
                                onClick={() => setActiveQuestionId(ans.id)}
                                style={{
                                  padding: '6px 0',
                                  borderRadius: '6px',
                                  border: isActive ? '2px solid var(--primary)' : isScored ? '1px solid #10b981' : '1px solid var(--bento-border)',
                                  background: isActive ? 'rgba(0, 85, 165, 0.12)' : isScored ? 'rgba(16, 185, 129, 0.06)' : 'var(--surface)',
                                  color: isActive ? 'var(--primary)' : isScored ? '#10b981' : 'var(--on-surface-var)',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  textAlign: 'center',
                                  transition: 'all 0.15s'
                                }}
                                title={`Câu ${ans.question_no} (${isScored ? 'Đã chấm' : 'Chưa chấm'})`}
                                className="hover:scale-105 active:scale-95"
                              >
                                {ans.question_no}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <AnswerEvaluationPanel ans={activeAns} />

                {/* ── TEACHER NOTE BLOCK ── */}
                {activeAns && (
                  <div style={{
                    background: 'var(--surface-high)',
                    border: '1px solid var(--bento-border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    marginTop: '4px'
                  }}>
                    {/* Header */}
                    <div style={{
                      padding: '12px 16px',
                      background: 'rgba(251, 191, 36, 0.08)',
                      borderBottom: '1px solid rgba(251, 191, 36, 0.18)',
                      display: 'flex', alignItems: 'center', gap: '8px'
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#f59e0b' }}>rate_review</span>
                      <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.04em', color: '#f59e0b' }}>NHẬN XÉT GIÁO VIÊN</span>
                    </div>

                    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {/* Existing note preview if saved */}
                      {activeAns.teacher_note && teacherNotes[activeAns.id] === undefined && (
                        <div style={{
                          background: 'rgba(251, 191, 36, 0.07)',
                          border: '1px solid rgba(251, 191, 36, 0.2)',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          fontSize: '13px',
                          color: 'var(--on-surface)',
                          lineHeight: '1.55',
                          fontStyle: 'italic'
                        }}>
                          <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', color: '#f59e0b', marginBottom: '4px', fontStyle: 'normal' }}>ĐÃ LƯU</span>
                          {activeAns.teacher_note}
                        </div>
                      )}

                      <textarea
                        rows={4}
                        placeholder="Nhập nhận xét của giáo viên về kết quả chấm AI này..."
                        value={teacherNotes[activeAns.id] ?? (activeAns.teacher_note || '')}
                        onChange={e => setTeacherNotes(prev => ({ ...prev, [activeAns.id]: e.target.value }))}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'var(--surface)',
                          border: '1px solid var(--outline-var)',
                          borderRadius: '8px',
                          color: 'var(--on-surface)',
                          fontSize: '13px',
                          padding: '10px 12px',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          lineHeight: '1.55',
                          outline: 'none',
                          transition: 'border-color 0.2s'
                        }}
                        onFocus={e => { e.target.style.borderColor = '#f59e0b'; }}
                        onBlur={e => { e.target.style.borderColor = 'var(--outline-var)'; }}
                      />

                      <button
                        onClick={() => handleSaveTeacherNote(activeAns.id)}
                        disabled={savingNote === activeAns.id}
                        style={{
                          alignSelf: 'flex-end',
                          padding: '8px 20px',
                          background: savingNote === activeAns.id ? 'rgba(251,191,36,0.4)' : 'rgba(251,191,36,0.15)',
                          border: '1px solid rgba(251,191,36,0.4)',
                          borderRadius: '8px',
                          color: '#f59e0b',
                          fontWeight: '700',
                          fontSize: '12px',
                          cursor: savingNote === activeAns.id ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px',
                          transition: 'all 0.15s'
                        }}
                      >
                        {savingNote === activeAns.id ? (
                          <><RefreshCw size={13} className="spinner" /> Đang lưu...</>
                        ) : (
                          <><CheckCircle size={13} /> Lưu nhận xét</>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── 1. POPUP CHECKLIST REVIEW BEFORE GRADING/CLEANING ── */}
        {isReviewOpen && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999
          }}>
            <div className="glass-card" style={{
              width: '100%', maxWidth: '640px', maxHeight: '85vh',
              background: 'var(--surface)', border: '1px solid var(--bento-border)',
              borderRadius: '16px', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', overflow: 'hidden'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '18px 24px', borderBottom: '1px solid var(--outline-var)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--surface-low)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>fact_check</span>
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>KIỂM TRA BÀI LÀM TRƯỚC KHI XỬ LÝ</h3>
                </div>
                <button
                  onClick={() => setIsReviewOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--on-surface-var)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>close</span>
                </button>
              </div>

              {/* Modal Content */}
              <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Select All Checkbox */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', background: 'var(--surface-high)', borderRadius: '8px',
                  border: '1px solid var(--bento-border)'
                }}>
                  <input
                    type="checkbox"
                    checked={
                      reviewMode === 'grade'
                        ? selectedGradeIds.length === data.answers.length
                        : (reviewMode === 'clean' || reviewMode === 'transcribe')
                        ? selectedCleanIds.length === speakingAnswers.filter(a => a.student_audio_file_id).length
                        : reviewMode === 'stt_question'
                        ? selectedQuestionSttIds.length === data.answers.filter(a => a.question_audio_file_id).length
                        : selectedContextSttIds.length === data.answers.filter(a => a.context_audio_file_id).length
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        if (reviewMode === 'grade') {
                          setSelectedGradeIds(data.answers.map(a => a.id));
                        } else if (reviewMode === 'clean' || reviewMode === 'transcribe') {
                          setSelectedCleanIds(speakingAnswers.filter(a => a.student_audio_file_id).map(a => a.id));
                        } else if (reviewMode === 'stt_question') {
                          setSelectedQuestionSttIds(data.answers.filter(a => a.question_audio_file_id).map(a => a.id));
                        } else if (reviewMode === 'stt_context') {
                          setSelectedContextSttIds(data.answers.filter(a => a.context_audio_file_id).map(a => a.id));
                        }
                      } else {
                        if (reviewMode === 'grade') {
                          setSelectedGradeIds([]);
                        } else if (reviewMode === 'clean' || reviewMode === 'transcribe') {
                          setSelectedCleanIds([]);
                        } else if (reviewMode === 'stt_question') {
                          setSelectedQuestionSttIds([]);
                        } else if (reviewMode === 'stt_context') {
                          setSelectedContextSttIds([]);
                        }
                      }
                    }}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--on-surface)' }}>
                    {reviewMode === 'grade' ? `Chọn tất cả câu hỏi (${data.answers.length})` 
                     : (reviewMode === 'clean' || reviewMode === 'transcribe') ? `Chọn tất cả câu Speaking (${speakingAnswers.filter(a => a.student_audio_file_id).length})`
                     : reviewMode === 'stt_question' ? `Chọn tất cả câu hỏi đề (${data.answers.filter(a => a.question_audio_file_id).length})`
                     : `Chọn tất cả tình huống đề (${data.answers.filter(a => a.context_audio_file_id).length})`}
                  </span>
                </div>

                {/* speaking list */}
                {(reviewMode === 'grade' || reviewMode === 'clean' || reviewMode === 'transcribe') && speakingAnswers.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>volume_up</span>
                      PHẦN THI SPEAKING (NÓI)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {speakingAnswers.map(ans => {
                        const isCleaned = !!ans.cleaned_audio_url;
                        const isSelected = reviewMode === 'grade'
                          ? selectedGradeIds.includes(ans.id)
                          : selectedCleanIds.includes(ans.id);
                        return (
                          <div key={ans.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '8px',
                            border: isCleaned ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(245, 158, 11, 0.2)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (reviewMode === 'grade') {
                                    if (e.target.checked) {
                                      setSelectedGradeIds(prev => [...prev, ans.id]);
                                    } else {
                                      setSelectedGradeIds(prev => prev.filter(id => id !== ans.id));
                                    }
                                  } else {
                                    if (e.target.checked) {
                                      setSelectedCleanIds(prev => [...prev, ans.id]);
                                    } else {
                                      setSelectedCleanIds(prev => prev.filter(id => id !== ans.id));
                                    }
                                  }
                                }}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '13px', fontWeight: '600' }}>Câu {ans.question_no}</span>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              {isCleaned ? (
                                <span style={{
                                  fontSize: '11px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399',
                                  padding: '2px 8px', borderRadius: '4px', fontWeight: '600'
                                }}>
                                  Đã làm sạch
                                </span>
                              ) : (
                                <span style={{
                                  fontSize: '11px', background: 'rgba(245, 158, 11, 0.1)', color: '#fb923c',
                                  padding: '2px 8px', borderRadius: '4px', fontWeight: '600'
                                }}>
                                  Chưa làm sạch (Khuyên dùng clean)
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* writing list */}
                {reviewMode === 'grade' && writingAnswers.length > 0 && (
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>edit_note</span>
                      PHẦN THI WRITING (VIẾT)
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {writingAnswers.map(ans => {
                        const hasWriting = !!ans.student_writing;
                        const isSelected = selectedGradeIds.includes(ans.id);
                        return (
                          <div key={ans.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '8px',
                            border: '1px solid var(--bento-border)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              {reviewMode === 'grade' && (
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedGradeIds(prev => [...prev, ans.id]);
                                    } else {
                                      setSelectedGradeIds(prev => prev.filter(id => id !== ans.id));
                                    }
                                  }}
                                  style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                />
                              )}
                              <span style={{ fontSize: '13px', fontWeight: '600' }}>Câu {ans.question_no}</span>
                            </div>
                            <span style={{
                              fontSize: '11px', 
                              background: hasWriting ? 'rgba(0, 85, 165, 0.08)' : 'rgba(239, 68, 68, 0.1)', 
                              color: hasWriting ? 'var(--primary)' : 'var(--error)',
                              padding: '2px 8px', borderRadius: '4px', fontWeight: '600'
                            }}>
                              {hasWriting ? 'Đã viết bài làm' : 'Trống'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* stt_question list */}
                {reviewMode === 'stt_question' && (
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>translate</span>
                      DỊCH AUDIO CÂU HỎI ĐỀ THI
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {data.answers?.filter(a => a.question_audio_file_id).map(ans => {
                        const hasText = !!ans.question_name;
                        const isSelected = selectedQuestionSttIds.includes(ans.id);
                        return (
                          <div key={ans.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '8px',
                            border: hasText ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(245, 158, 11, 0.2)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedQuestionSttIds(prev => [...prev, ans.id]);
                                  } else {
                                    setSelectedQuestionSttIds(prev => prev.filter(id => id !== ans.id));
                                  }
                                }}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '13px', fontWeight: '600' }}>Câu {ans.question_no}</span>
                            </div>
                            <span style={{
                              fontSize: '11px', background: hasText ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: hasText ? '#34d399' : '#fb923c',
                              padding: '2px 8px', borderRadius: '4px', fontWeight: '600'
                            }}>
                              {hasText ? 'Đã dịch' : 'Chưa dịch'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* stt_context list */}
                {reviewMode === 'stt_context' && (
                  <div>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '700' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>translate</span>
                      DỊCH AUDIO BỐI CẢNH ĐỀ THI
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {data.answers?.filter(a => a.context_audio_file_id).map(ans => {
                        const hasText = !!ans.context_text || (ans.section === 'Speaking' && ans.question_no !== 8 && ans.question_no !== 9 && ans.question_no !== 10);
                        const isSelected = selectedContextSttIds.includes(ans.id);
                        return (
                          <div key={ans.id} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '8px',
                            border: hasText ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid rgba(245, 158, 11, 0.2)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedContextSttIds(prev => [...prev, ans.id]);
                                  } else {
                                    setSelectedContextSttIds(prev => prev.filter(id => id !== ans.id));
                                  }
                                }}
                                style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                              />
                              <span style={{ fontSize: '13px', fontWeight: '600' }}>Câu {ans.question_no}</span>
                            </div>
                            <span style={{
                              fontSize: '11px', background: hasText ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: hasText ? '#34d399' : '#fb923c',
                              padding: '2px 8px', borderRadius: '4px', fontWeight: '600'
                            }}>
                              {hasText ? 'Đã dịch' : 'Chưa dịch'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
              </div>

              {/* Modal Footer Actions */}
              <div style={{
                padding: '18px 24px', borderTop: '1px solid var(--outline-var)',
                display: 'flex', justifyContent: 'flex-end', gap: '12px',
                background: 'var(--surface-low)'
              }}>
                <button
                  onClick={() => setIsReviewOpen(false)}
                  style={{
                    padding: '8px 16px', borderRadius: '6px', background: 'transparent',
                    border: '1px solid var(--outline-var)', color: 'var(--on-surface)',
                    fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>
                {reviewMode === 'clean' && selectedCleanIds.length > 0 && (
                  <button
                    onClick={() => runBulkCleanQueue(selectedCleanIds)}
                    style={{
                      padding: '8px 16px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)',
                      border: '1px solid #10b981', color: '#34d399',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    Clean {selectedCleanIds.length} Audio hàng loạt
                  </button>
                )}
                {reviewMode === 'transcribe' && selectedCleanIds.length > 0 && (
                  <button
                    onClick={() => runBulkTranscribeQueue(selectedCleanIds)}
                    style={{
                      padding: '8px 16px', borderRadius: '6px', background: 'var(--primary)',
                      border: 'none', color: 'var(--on-primary)',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,85,165,0.2)'
                    }}
                  >
                    Bắt đầu Transcribe ({selectedCleanIds.length} câu)
                  </button>
                )}
                {reviewMode === 'stt_question' && selectedQuestionSttIds.length > 0 && (
                  <button
                    onClick={() => runBulkTargetSttQueue(selectedQuestionSttIds, 'STT_QUESTION')}
                    style={{
                      padding: '8px 16px', borderRadius: '6px', background: 'var(--primary)',
                      border: 'none', color: 'var(--on-primary)',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,85,165,0.2)'
                    }}
                  >
                    Dịch STT {selectedQuestionSttIds.length} Câu hỏi hàng loạt
                  </button>
                )}
                {reviewMode === 'stt_context' && selectedContextSttIds.length > 0 && (
                  <button
                    onClick={() => runBulkTargetSttQueue(selectedContextSttIds, 'STT_CONTEXT')}
                    style={{
                      padding: '8px 16px', borderRadius: '6px', background: 'var(--primary)',
                      border: 'none', color: 'var(--on-primary)',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,85,165,0.2)'
                    }}
                  >
                    Dịch STT {selectedContextSttIds.length} Bối cảnh hàng loạt
                  </button>
                )}
                {reviewMode === 'grade' && (
                  <button
                    onClick={() => runBulkGradeQueue(selectedGradeIds)}
                    style={{
                      padding: '8px 16px', borderRadius: '6px', background: 'var(--primary)',
                      border: 'none', color: 'var(--on-primary)',
                      fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(0,85,165,0.2)'
                    }}
                  >
                    Bắt đầu Chấm điểm ({selectedGradeIds.length} câu)
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 2. FLOATING QUEUE PROGRESS WIDGET IN CORNER ── */}
        {bulkQueue && bulkQueue.status !== 'idle' && (
          <div style={{
            position: 'fixed', bottom: '80px', right: '24px', zIndex: 9999,
            width: '320px', background: 'var(--surface)', border: '1px solid var(--bento-border)',
            borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
            padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px',
            backdropFilter: 'blur(20px)'
          }}>
            {/* Widget Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--primary)' }}>
                <span className="spinner material-symbols-outlined" style={{ fontSize: '18px', animation: bulkQueue.status === 'running' ? 'spin 2s linear infinite' : 'none' }}>
                  {bulkQueue.status === 'running' ? 'sync' : 'check_circle'}
                </span>
                <span style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {bulkQueue.type === 'clean' ? 'Hàng đợi Làm sạch' : 'Hàng đợi Chấm điểm'}
                </span>
              </div>
              <button
                onClick={() => setBulkQueue(prev => ({ ...prev, status: 'idle' }))}
                style={{ background: 'none', border: 'none', color: 'var(--on-surface-var)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
              </button>
            </div>

            {/* Progress calculation */}
            {(() => {
              const processed = bulkQueue.completedCount + bulkQueue.failedCount;
              const pct = bulkQueue.totalCount > 0 ? (processed / bulkQueue.totalCount) * 100 : 0;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Progress bar */}
                  <div style={{ height: '6px', background: 'var(--outline-var)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: 'var(--primary)', width: `${pct}%`, transition: 'width 0.3s ease' }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--on-surface-var)' }}>
                    <span>Đã xử lý: <strong>{processed}/{bulkQueue.totalCount}</strong></span>
                    <span>{Math.round(pct)}%</span>
                  </div>
                </div>
              );
            })()}

            {/* Queue statistics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center', fontSize: '11px' }}>
              <div style={{ background: 'var(--surface-high)', padding: '6px', borderRadius: '6px' }}>
                <span style={{ display: 'block', color: 'var(--primary)', fontWeight: '700' }}>{bulkQueue.activeList.length}</span>
                <span style={{ fontSize: '9px', color: 'var(--on-surface-var)' }}>Đang chạy</span>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '6px', borderRadius: '6px' }}>
                <span style={{ display: 'block', color: '#10b981', fontWeight: '700' }}>{bulkQueue.completedCount}</span>
                <span style={{ fontSize: '9px', color: 'var(--on-surface-var)' }}>Thành công</span>
              </div>
              <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '6px', borderRadius: '6px' }}>
                <span style={{ display: 'block', color: 'var(--error)', fontWeight: '700' }}>{bulkQueue.failedCount}</span>
                <span style={{ fontSize: '9px', color: 'var(--on-surface-var)' }}>Lỗi</span>
              </div>
            </div>

            {/* List of active targets */}
            {bulkQueue.activeList.length > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--on-surface-var)', borderTop: '1px solid var(--outline-var)', paddingTop: '8px' }}>
                <span style={{ display: 'block', marginBottom: '4px', fontWeight: '600' }}>Đang xử lý (Tuần tự 1-by-1):</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {bulkQueue.activeList.map(activeId => {
                    const ansRow = data.answers?.find(a => a.id === activeId);
                    const label = ansRow ? `${ansRow.section} Q${ansRow.question_no}` : activeId;
                    return (
                      <div key={activeId} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="spinner material-symbols-outlined" style={{ fontSize: '12px', animation: 'spin 2s linear infinite', color: 'var(--primary)' }}>sync</span>
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 3. FLOATING TOOLS FAB BUTTON (OUTSIDE THE SECTION) ── */}
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999
        }}>
          <button
            onClick={() => setIsToolsOpen(!isToolsOpen)}
            style={{
              width: '46px', height: '46px', borderRadius: '50%',
              background: 'var(--primary)', color: 'var(--on-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: 'none', cursor: 'pointer', boxShadow: '0 4px 16px rgba(0, 85, 165, 0.4)',
              transition: 'transform 0.15s'
            }}
            className="hover:scale-105 active:scale-95"
            title="Công cụ AI hàng loạt"
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
              {isToolsOpen ? 'close' : 'build'}
            </span>
          </button>

          {isToolsOpen && (
            <div style={{
              position: 'absolute',
              bottom: '56px',
              right: 0,
              width: '200px',
              background: 'var(--surface-high)',
              border: '1px solid var(--bento-border)',
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <button
                onClick={() => {
                  setIsToolsOpen(false);
                  openReviewPopup('clean');
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-low)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                  border: 'none', background: 'transparent', color: 'var(--on-surface)',
                  fontSize: '12px', fontWeight: '500', textAlign: 'left', cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#10b981' }}>cleaning_services</span>
                Làm sạch âm thanh
              </button>
              
              <button
                onClick={() => {
                  setIsToolsOpen(false);
                  openReviewPopup('transcribe');
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-low)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                  border: 'none', background: 'transparent', color: 'var(--on-surface)',
                  fontSize: '12px', fontWeight: '500', textAlign: 'left', cursor: 'pointer',
                  transition: 'background 0.15s', borderTop: '1px solid var(--outline-var)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>keyboard_voice</span>
                AI Transcribe hàng loạt
              </button>

              <button
                onClick={() => {
                  setIsToolsOpen(false);
                  openReviewPopup('stt_question');
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-low)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                  border: 'none', background: 'transparent', color: 'var(--on-surface)',
                  fontSize: '12px', fontWeight: '500', textAlign: 'left', cursor: 'pointer',
                  transition: 'background 0.15s', borderTop: '1px solid var(--outline-var)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>translate</span>
                STT Audio Câu hỏi
              </button>

              <button
                onClick={() => {
                  setIsToolsOpen(false);
                  openReviewPopup('stt_context');
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-low)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                  border: 'none', background: 'transparent', color: 'var(--on-surface)',
                  fontSize: '12px', fontWeight: '500', textAlign: 'left', cursor: 'pointer',
                  transition: 'background 0.15s', borderTop: '1px solid var(--outline-var)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--primary)' }}>translate</span>
                STT Audio Bối cảnh
              </button>

              <button
                onClick={() => {
                  setIsToolsOpen(false);
                  openReviewPopup('grade');
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-low)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                  border: 'none', background: 'transparent', color: 'var(--on-surface)',
                  fontSize: '12px', fontWeight: '500', textAlign: 'left', cursor: 'pointer',
                  transition: 'background 0.15s', borderTop: '1px solid var(--outline-var)'
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '16px', color: '#f59e0b' }}>psychology</span>
                Chấm điểm hàng loạt
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};


function App() {
  console.log("App component is rendering...");
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('currentUser');
      if (!saved || saved === 'undefined') return null;
      return JSON.parse(saved);
    } catch (e) {
      console.error('Error parsing localStorage currentUser:', e);
      return null;
    }
  });

  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;
  let activeTab = 'submissions';
  if (path.startsWith('/mappings')) activeTab = 'mappings';
  else if (path.startsWith('/ai')) activeTab = 'ai';
  else if (path.startsWith('/users')) activeTab = 'users';
  else if (path.startsWith('/questions')) activeTab = 'questions';
  else if (path.startsWith('/logs')) activeTab = 'logs';

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  const [isLightTheme, setIsLightTheme] = useState(() => {
    return localStorage.getItem('theme') === 'light';
  });

  useEffect(() => {
    if (isLightTheme) {
      document.documentElement.classList.add('light-theme');
    } else {
      document.documentElement.classList.remove('light-theme');
    }
  }, [isLightTheme]);

  const toggleTheme = () => {
    setIsLightTheme(prev => {
      const next = !prev;
      localStorage.setItem('theme', next ? 'light' : 'dark');
      return next;
    });
  };

  const [submissions, setSubmissions] = useState([]);
  const [subCurrentPage, setSubCurrentPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(10);
  
  // Login form states
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  // Scoring Sync states
  const [keycode, setKeycode] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncingMappings, setSyncingMappings] = useState(false);
  const [syncFromDate, setSyncFromDate] = useState('');
  const [syncToDate, setSyncToDate] = useState('');

  const [syncPageSize, setSyncPageSize] = useState('100');
  const [syncKeyword, setSyncKeyword] = useState('');
  const [searchKey, setSearchKey] = useState('');
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncCount, setSyncCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [message, setMessage] = useState(null);
  
  // Live log states
  const [liveLogs, setLiveLogs] = useState(() => {
    try {
      const saved = localStorage.getItem('ai_scoring_live_logs');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed loading live logs from localStorage:', e);
    }
    return [
      { time: new Date().toLocaleTimeString('vi-VN', { hour12: false }), text: 'AI Scoring Admin console initialized.' },
      { time: new Date().toLocaleTimeString('vi-VN', { hour12: false }), text: 'Websocket simulator channel connected.' }
    ];
  });

  const addLiveLog = (text) => {
    const timestamp = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    setLiveLogs(prev => {
      const updated = [...prev, { time: timestamp, text }];
      let finalLogs = updated;
      if (updated.length > 200) {
        finalLogs = updated.slice(updated.length - 200);
      }
      try {
        localStorage.setItem('ai_scoring_live_logs', JSON.stringify(finalLogs));
      } catch (e) {
        console.error('Failed saving live logs to localStorage:', e);
      }
      return finalLogs;
    });

    // Auto-scroll the live-log box
    setTimeout(() => {
      const logBox = document.getElementById('live-log');
      if (logBox) {
        logBox.scrollTop = logBox.scrollHeight;
      }
    }, 100);
  };

  const [showPullModal, setShowPullModal] = useState(false);
  const [pullKeycode, setPullKeycode] = useState('');
  const [pullStatus, setPullStatus] = useState('idle');
  const [pullResultId, setPullResultId] = useState('');
  const [bulkPullProgress, setBulkPullProgress] = useState({ total: 0, completed: [], failed: [], active: '', logs: [] });
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [gradeStatus, setGradeStatus] = useState('idle');
  const [bulkGradeProgress, setBulkGradeProgress] = useState({ total: 0, completed: [], failed: [], active: '', logs: [] });
  
  // User management states
  const [usersList, setUsersList] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  
  // Keycode mapping states
  const [mappingsList, setMappingsList] = useState([]);
  const [newKeycode, setNewKeycode] = useState('');
  const [newCourseScoringId, setNewCourseScoringId] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newTestName, setNewTestName] = useState('');
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [isEditingMapping, setIsEditingMapping] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [mappingSearch, setMappingSearch] = useState('');
  const [mapCurrentPage, setMapCurrentPage] = useState(1);
  const [mapPageSize, setMapPageSize] = useState(10);
  const [selectedSubIds, setSelectedSubIds] = useState([]);
  // Dify AI Config mock states
  const [difyEndpoint, setDifyEndpoint] = useState('http://178.105.45.146:8080/v1/workflows/run');
  const [difyApiKey, setDifyApiKey] = useState('app-XXXXXX...');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  // Fetch submissions list
  const fetchSubmissions = async () => {
    if (!currentUser) return;
    setLoading(true);
    setSubCurrentPage(1);
    try {
      const res = await axios.get(API_BASE, {
        params: {
          keycode: searchKey,
          status: statusFilter
        }
      });
      if (res.data.success) {
        setSubmissions(res.data.data);
      }
    } catch (error) {
      showMsg('error', 'Failed to fetch submissions list: ' + error.message);
    } finally {
      setLoading(false);
    }
  };



  // Sync a single Keycode
  const handleSyncKeycode = async (e) => {
    e.preventDefault();
    if (!keycode.trim()) return;
    setLoading(true);
    addLiveLog(`🔄 Bắt đầu đồng bộ keycode: ${keycode.toUpperCase()}`);
    showMsg('info', `Syncing keycode ${keycode.toUpperCase()}...`);
    try {
      const res = await axios.post(`${API_BASE}/sync`, { keycode: keycode.trim() });
      if (res.data.success) {
        addLiveLog(`✅ Đồng bộ thành công keycode: ${keycode.toUpperCase()}`);
        showMsg('success', res.data.message);
        setKeycode('');
        fetchSubmissions();
        fetchMappings();
      }
    } catch (error) {
      addLiveLog(`❌ Lỗi đồng bộ keycode ${keycode.toUpperCase()}: ${error.message}`);
      showMsg('error', error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncMappings = async () => {
    setSyncingMappings(true);
    setSyncStatus('loading');
    addLiveLog(`🔄 Bắt đầu đồng bộ hàng loạt mappings từ Elearning...`);
    try {
      const payload = {
        pageSize: parseInt(syncPageSize, 10) || 100,
        keyword: syncKeyword.trim() || null,
        fromSubmittedDate: syncFromDate ? `${syncFromDate}T00:00:00Z` : null,
        toSubmittedDate: syncToDate ? `${syncToDate}T23:59:59Z` : null
      };
      const res = await axios.post(`${API_BASE}/sync-mappings`, payload);
      if (res.data.success) {
        addLiveLog(`✅ Đồng bộ mappings thành công. Số lượng: ${res.data.count || 0} items.`);
        setSyncCount(res.data.count || 0);
        setSyncStatus('success');
        fetchSubmissions();
        fetchMappings();
      } else {
        addLiveLog(`❌ Đồng bộ mappings thất bại.`);
        setSyncStatus('error');
      }
    } catch (error) {
      addLiveLog(`❌ Lỗi đồng bộ mappings: ${error.message}`);
      setSyncStatus('error');
      showMsg('error', 'Đồng bộ mappings thất bại: ' + (error.response?.data?.error || error.message));
    } finally {
      setSyncingMappings(false);
    }
  };

  // Pull submissions by Keycode (Bulk / Single)
  const handlePullSubmission = async (e) => {
    e.preventDefault();
    const keycodes = pullKeycode.split(/[\n,; ]+/).map(k => k.trim().toUpperCase()).filter(Boolean);
    if (keycodes.length === 0) return;

    setPullStatus('loading');
    setPullResultId('');
    
    setBulkPullProgress({
      total: keycodes.length,
      completed: [],
      failed: [],
      active: keycodes[0],
      logs: [`📥 Khởi động tiến trình kéo ${keycodes.length} keycode từ Elearning...`]
    });

    const completed = [];
    const failed = [];
    let activeId = '';

    for (let i = 0; i < keycodes.length; i++) {
      const code = keycodes[i];
      setBulkPullProgress(prev => ({ 
        ...prev, 
        active: code, 
        logs: [...prev.logs, `🔄 [${i+1}/${keycodes.length}] Đang kéo dữ liệu keycode: ${code}...`] 
      }));

      try {
        const res = await axios.post(`${API_BASE}/sync`, {
          keycode: code
        });
        if (res.data.success) {
          completed.push(code);
          if (res.data.data?.id) activeId = res.data.data.id;
          const successMsg = `✅ [${i+1}/${keycodes.length}] Kéo thành công keycode: ${code}`;
          addLiveLog(successMsg);
          setBulkPullProgress(prev => ({
            ...prev,
            completed: [...prev.completed, code],
            logs: [...prev.logs, successMsg]
          }));
        } else {
          failed.push(code);
          const failMsg = `❌ [${i+1}/${keycodes.length}] Kéo keycode ${code} thất bại.`;
          addLiveLog(failMsg);
          setBulkPullProgress(prev => ({
            ...prev,
            failed: [...prev.failed, code],
            logs: [...prev.logs, failMsg]
          }));
        }
      } catch (error) {
        failed.push(code);
        const errMsg = error.response?.data?.error || error.message;
        const errorMsg = `❌ [${i+1}/${keycodes.length}] Lỗi kéo keycode ${code}: ${errMsg}`;
        addLiveLog(errorMsg);
        setBulkPullProgress(prev => ({
          ...prev,
          failed: [...prev.failed, code],
          logs: [...prev.logs, errorMsg]
        }));
      }
    }

    setPullResultId(keycodes.length === 1 ? activeId : '');
    setPullStatus('success');
    fetchSubmissions();
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    console.log('🔘 Đăng nhập button clicked. Payload:', { username: loginUser, password: loginPass });
    if (!loginUser.trim() || !loginPass.trim()) {
      console.warn('⚠️ Username or password is empty');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${AUTH_BASE}/login`, {
        username: loginUser.trim(),
        password: loginPass.trim()
      });
      if (res.data.data) {
        const user = res.data.data;
        console.log('🎉 Login API succeeded! User info:', user);
        try {
          localStorage.setItem('currentUser', JSON.stringify(user));
        } catch (storageErr) {
          console.warn('Failed to save to localStorage:', storageErr);
        }
        setCurrentUser(user);
        navigate('/submissions');
        showMsg('success', `Đăng nhập thành công! Chào mừng ${user.username}`);
      }    } catch (error) {
      console.error('Login Failure Details:', error);
      if (error.response) {
        // Lỗi từ server trả về
        showMsg('error', error.response.data?.error || 'Đăng nhập thất bại: Thông tin tài khoản không hợp lệ.');
      } else {
        // Lỗi không kết nối được server (Network Error / CORS)
        showMsg('error', 'Lỗi kết nối: Không thể kết nối tới máy chủ backend (cổng 5005). Vui lòng kiểm tra lại server.js.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    navigate('/login');
    setSubmissions([]);
  };

  // Fetch Users (Admin Only)
  const fetchUsers = async () => {
    if (currentUser?.role !== 'admin') return;
    setLoadingUsers(true);
    try {
      const res = await axios.get(`${AUTH_BASE}/users`);
      if (res.data.success) {
        setUsersList(res.data.data);
      }
    } catch (error) {
      showMsg('error', 'Failed to load users: ' + error.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Save User (Create or Edit - Admin Only)
  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!newUsername.trim() || !newRole) return;
    
    // Check if adding new, require password
    if (!isEditingUser && !newPassword.trim()) {
      showMsg('error', 'Mật khẩu là bắt buộc khi tạo tài khoản mới.');
      return;
    }

    try {
      if (isEditingUser) {
        // Edit Mode
        const res = await axios.put(`${AUTH_BASE}/users/${editingUserId}`, {
          role: newRole,
          password: newPassword.trim() || null
        });
        if (res.data.success) {
          showMsg('success', res.data.message);
          setNewUsername('');
          setNewPassword('');
          setNewRole('user');
          setIsEditingUser(false);
          setEditingUserId('');
          setShowCreateModal(false);
          fetchUsers();
        }
      } else {
        // Create Mode
        const res = await axios.post(`${AUTH_BASE}/users`, {
          username: newUsername.trim(),
          password: newPassword.trim(),
          role: newRole
        });
        if (res.data.success) {
          showMsg('success', res.data.message);
          setNewUsername('');
          setNewPassword('');
          setNewRole('user');
          setShowCreateModal(false);
          fetchUsers();
        }
      }
    } catch (error) {
      showMsg('error', error.response?.data?.error || error.message);
    }
  };
  // Delete User (Admin Only)
  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa user này không?')) return;
    try {
      const res = await axios.delete(`${AUTH_BASE}/users/${userId}`);
      if (res.data.success) {
        showMsg('success', res.data.message);
        fetchUsers();
      }
    } catch (error) {
      showMsg('error', error.response?.data?.error || error.message);
    }
  };

  // Fetch Keycode Mappings
  const fetchMappings = async () => {
    setLoadingMappings(true);
    setMapCurrentPage(1);
    try {
      const res = await axios.get(`${API_BASE}/mappings`);
      if (res.data.success) {
        setMappingsList(res.data.data);
      }
    } catch (error) {
      showMsg('error', 'Failed to load mappings: ' + error.message);
    } finally {
      setLoadingMappings(false);
    }
  };

  // Add or Update Keycode Mapping
  const handleSaveMapping = async (e) => {
    e.preventDefault();
    if (!newKeycode.trim() || !newCourseScoringId.trim()) return;
    try {
      const res = await axios.post(`${API_BASE}/mappings`, {
        keycode: newKeycode.trim(),
        courseScoringId: newCourseScoringId.trim(),
        studentName: newStudentName.trim() || null,
        testName: newTestName.trim() || null
      });
      if (res.data.success) {
        showMsg('success', res.data.message);
        setNewKeycode('');
        setNewCourseScoringId('');
        setNewStudentName('');
        setNewTestName('');
        setShowMappingModal(false);
        fetchMappings();
      }
    } catch (error) {
      showMsg('error', error.response?.data?.error || error.message);
    }
  };

  // Delete Mocktest Submission (Only allowed if status === 1)
  const handleDeleteSubmission = async (subId, keycodeVal, status) => {
    if (status !== 1) {
      alert("Không thể xóa bài làm đã được chấm điểm.");
      return;
    }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bài làm của keycode ${keycodeVal} khỏi hệ thống không?`)) {
      return;
    }
    try {
      const res = await axios.delete(`${API_BASE}/${subId}`);
      if (res.data.success) {
        showMsg('success', res.data.message);
        fetchSubmissions();
      }
    } catch (error) {
      showMsg('error', error.response?.data?.error || error.message);
    }
  };

  // Show Bulk AI Auto-Grading Confirmation Modal
  const handleBulkGradeSubmissions = () => {
    if (selectedSubIds.length === 0) return;
    setShowGradeModal(true);
    setGradeStatus('idle');
  };

  // Start Bulk AI Auto-Grading loop
  const startBulkGradeExecution = async () => {
    const selectedKeycodes = submissions
      .filter(s => selectedSubIds.includes(s.id))
      .map(s => ({ id: s.id, keycode: s.keycode }));

    setGradeStatus('loading');
    setBulkGradeProgress({
      total: selectedKeycodes.length,
      completed: [],
      failed: [],
      active: selectedKeycodes[0].keycode,
      logs: [`🎬 Bắt đầu tiến trình chấm điểm tự động cho ${selectedKeycodes.length} bài thi...`]
    });

    const completed = [];
    const failed = [];

    const appendLog = (msg) => {
      setBulkGradeProgress(prev => ({
        ...prev,
        logs: [...prev.logs, msg]
      }));
      addLiveLog(msg);
    };

    for (let i = 0; i < selectedKeycodes.length; i++) {
      const { id: subId, keycode } = selectedKeycodes[i];
      setBulkGradeProgress(prev => ({ ...prev, active: keycode }));
      appendLog(`🔄 [Bài ${i+1}/${selectedKeycodes.length}] Bắt đầu xử lý keycode: ${keycode}...`);

      try {
        // Step 1: Fetch all 19 answers
        appendLog(`   [${keycode}] 1. Đang tải danh sách câu hỏi & câu trả lời...`);
        const detailRes = await axios.get(`${API_BASE}/${subId}`);
        if (!detailRes.data.success || !detailRes.data.data.answers) {
          throw new Error('Không thể tải chi tiết bài làm từ API.');
        }

        const answers = detailRes.data.data.answers;
        appendLog(`   [${keycode}] 2. Phát hiện ${answers.length} câu trả lời. Bắt đầu xử lý song song các câu...`);

        // Process all 19 answers in parallel
        await Promise.all(answers.map(async (ans) => {
          const labelQ = `${ans.section} Q${ans.question_no}`;
          
          if (ans.section === 'Speaking') {
            // A. Check student audio file
            if (ans.student_audio_file_id) {
              // A1. Clean audio
              try {
                await axios.post(`${API_BASE}/clean-audio`, { answerId: ans.id });
              } catch (err) {
                console.warn(`[Bulk Clean Audio Warning] ${labelQ}:`, err.message);
              }

              // A2. STT student answer if not transcribed yet
              if (!ans.transcribe) {
                try {
                  await axios.post(`${API_BASE}/transcribe-ai`, { answerId: ans.id, targetType: 'student_answer' });
                } catch (err) {
                  console.warn(`[Bulk Student STT Warning] ${labelQ}:`, err.message);
                }
              }

              // A3. STT question audio if not transcribed yet
              if (ans.question_audio_file_id && !ans.question_name) {
                try {
                  await axios.post(`${API_BASE}/transcribe-ai`, { answerId: ans.id, targetType: 'question' });
                } catch (err) {
                  console.warn(`[Bulk Question STT Warning] ${labelQ}:`, err.message);
                }
              }

              // A4. STT context audio if not transcribed yet (Speaking Q8-10 only)
              const qNo = parseInt(ans.question_no, 10);
              if (ans.context_audio_file_id && !ans.context_text && (qNo === 8 || qNo === 9 || qNo === 10)) {
                try {
                  await axios.post(`${API_BASE}/transcribe-ai`, { answerId: ans.id, targetType: 'context' });
                } catch (err) {
                  console.warn(`[Bulk Context STT Warning] ${labelQ}:`, err.message);
                }
              }
            }

            // A5. Trigger AI Grading for Speaking
            try {
              await axios.post(`${API_BASE}/grade-ai`, { answerId: ans.id });
            } catch (err) {
              console.warn(`[Bulk Speaking Grade Warning] ${labelQ}:`, err.message);
              appendLog(`   ⚠️ [Cảnh báo] Lỗi chấm Speaking Câu ${ans.question_no}: ${err.response?.data?.error || err.message}`);
            }
          } else if (ans.section === 'Writing') {
            // B. Trigger AI Grading for Writing
            try {
              await axios.post(`${API_BASE}/grade-ai`, { answerId: ans.id });
            } catch (err) {
              console.warn(`[Bulk Writing Grade Warning] ${labelQ}:`, err.message);
              appendLog(`   ⚠️ [Cảnh báo] Lỗi chấm Writing Câu ${ans.question_no}: ${err.response?.data?.error || err.message}`);
            }
          }
        }));

        completed.push(keycode);
        appendLog(`✅ [Bài ${i+1}/${selectedKeycodes.length}] Hoàn tất chấm tự động bài: ${keycode}`);
        setBulkGradeProgress(prev => ({
          ...prev,
          completed: [...prev.completed, keycode]
        }));

      } catch (error) {
        failed.push(keycode);
        const errorMsg = `❌ [Bài ${i+1}/${selectedKeycodes.length}] Thất bại tại bài ${keycode}: ${error.message}`;
        appendLog(errorMsg);
        setBulkGradeProgress(prev => ({
          ...prev,
          failed: [...prev.failed, keycode]
        }));
      }
    }

    setGradeStatus('success');
    setSelectedSubIds([]);
    fetchSubmissions();
  };

  // Bulk Delete Submissions
  const handleBulkDeleteSubmissions = async () => {
    if (selectedSubIds.length === 0) return;
    
    // Find keycodes of selected items for display in confirmation
    const selectedKeycodes = submissions
      .filter(s => selectedSubIds.includes(s.id))
      .map(s => s.keycode);

    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedSubIds.length} bài làm đã chọn (${selectedKeycodes.join(', ')}) khỏi hệ thống không?\nLưu ý: Chỉ bài làm CHƯA CHẤM mới thực sự bị xóa.`)) {
      return;
    }

    try {
      const res = await axios.post(`${API_BASE}/bulk-delete`, {
        ids: selectedSubIds
      });
      if (res.data.success) {
        showMsg('success', res.data.message);
        setSelectedSubIds([]);
        fetchSubmissions();
      }
    } catch (error) {
      showMsg('error', error.response?.data?.error || error.message);
    }
  };

  // Export Checked Submissions to Excel
  const handleExportExcel = async () => {
    if (selectedSubIds.length === 0) return;
    try {
      showMsg('success', 'Đang chuẩn bị file excel, vui lòng chờ...');
      const response = await axios.post(`${API_BASE}/export`, {
        submissionIds: selectedSubIds
      }, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `export_diem_submissions_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showMsg('success', 'Tải file Excel thành công.');
    } catch (error) {
      console.error('handleExportExcel error:', error);
      showMsg('error', 'Lỗi xuất file Excel: ' + (error.message));
    }
  };

  // Delete Keycode Mapping
  const handleDeleteMapping = async (keycodeVal) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa mapping của keycode ${keycodeVal} không?`)) return;
    try {
      const res = await axios.delete(`${API_BASE}/mappings/${keycodeVal}`);
      if (res.data.success) {
        showMsg('success', res.data.message);
        fetchMappings();
      }
    } catch (error) {
      showMsg('error', error.response?.data?.error || error.message);
    }
  };

  const showMsg = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  useEffect(() => {
    if (currentUser) {
      fetchSubmissions();
    }
  }, [currentUser, searchKey, statusFilter]);

  useEffect(() => {
    if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'mappings') {
      fetchMappings();
    }
  }, [activeTab]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 1:
        return <span className="badge-pending"><Clock size={11}/> Chưa chấm</span>;
      case 2:
        return <span className="badge-processing"><RefreshCw className="spinner" size={11}/> Đang chấm</span>;
      case 3:
        return <span className="badge-done"><CheckCircle size={11}/> Đã chấm</span>;
      case 4:
        return <span className="badge-error"><AlertTriangle size={11}/> Lỗi</span>;
      default:
        return <span className="badge-pending">Không rõ</span>;
    }
  };

  // IF NOT LOGGED IN, SHOW LOGIN VIEW
  if (!currentUser) {
    // Particles config
    const particles = [
      { left: '10%', size: 3, duration: 18, delay: 0 },
      { left: '25%', size: 2, duration: 24, delay: 4 },
      { left: '40%', size: 4, duration: 20, delay: 8 },
      { left: '55%', size: 2, duration: 28, delay: 2 },
      { left: '70%', size: 3, duration: 22, delay: 12 },
      { left: '82%', size: 2, duration: 16, delay: 6 },
      { left: '92%', size: 3, duration: 26, delay: 10 },
    ];
    return (
      <Routes>
        <Route path="/login" element={
          <div className="login-page">
            {/* Ambient orbs */}
            <div className="login-orb login-orb-1" />
            <div className="login-orb login-orb-2" />
            <div className="login-orb login-orb-3" />
            {/* Grid mesh */}
            <div className="login-grid" />
            {/* Floating particles */}
            {particles.map((p, i) => (
              <div key={i} className="login-particle" style={{
                left: p.left,
                width: `${p.size}px`,
                height: `${p.size}px`,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
              }} />
            ))}

            {/* ── LEFT BRANDING PANEL ── */}
            <div className="login-panel-left">
              <div className="login-brand-logo">
                <img src="/IIG_logo.webp" alt="IIG Vietnam" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '12px', boxSizing: 'border-box' }} />
              </div>
              <p className="login-brand-subtitle">IIG Vietnam · AI Technology</p>
              <h1 className="login-brand-title">IIG AI Scoring<br/>Admin Console</h1>
              <p className="login-brand-desc">
                Hệ thống chấm điểm thông minh sử dụng trí tuệ nhân tạo, hỗ trợ đánh giá năng lực tiếng Anh TOEIC Speaking &amp; Writing theo chuẩn quốc tế.
              </p>

              {/* Stats */}
              <div className="login-stats">
                <div className="login-stat-item">
                  <span className="login-stat-value">AI</span>
                  <span className="login-stat-label">Powered</span>
                </div>
                <div className="login-stat-item">
                  <span className="login-stat-value">TOEIC</span>
                  <span className="login-stat-label">Scoring</span>
                </div>
                <div className="login-stat-item">
                  <span className="login-stat-value">Real‑time</span>
                  <span className="login-stat-label">Processing</span>
                </div>
              </div>

              {/* Feature badges */}
              <div className="login-features">
                <span className="login-feature-badge">
                  <span className="login-feature-badge-dot" />
                  Speaking Evaluation
                </span>
                <span className="login-feature-badge">
                  <span className="login-feature-badge-dot" />
                  Writing Evaluation
                </span>
                <span className="login-feature-badge">
                  <span className="login-feature-badge-dot" />
                  Auto Scoring
                </span>
              </div>
            </div>

            {/* ── RIGHT FORM PANEL ── */}
            <div className="login-panel-right">
              <div id="login-form-card" className="login-form-card">
                {/* Form header */}
                <div className="login-form-header">
                  <div className="login-form-logo">
                    <img src="/IIG_logo.webp" alt="IIG Vietnam Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px', boxSizing: 'border-box' }} />
                  </div>
                  <h2 className="login-form-title">Đăng nhập</h2>
                  <p className="login-form-subtitle">Admin Console · IIG AI Scoring</p>
                </div>

                {/* Alert message */}
                {message && (
                  <div className={`toast ${message.type}`} style={{ position: 'relative', top: 'auto', right: 'auto', marginBottom: '20px', animation: 'none' }}>
                    {message.text}
                  </div>
                )}

                {/* Login form */}
                <form onSubmit={(e) => {
                  const card = document.getElementById('login-form-card');
                  if (card) {
                    card.classList.remove('login-form-shake');
                    void card.offsetWidth; // reflow
                  }
                  handleLogin(e);
                }} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                  {/* Username */}
                  <div className="login-input-group">
                    <label className="section-label">Tên đăng nhập</label>
                    <div className="login-input-wrapper">
                      <span className="login-input-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                        </svg>
                      </span>
                      <input
                        id="login-username"
                        type="text"
                        placeholder="Nhập tên đăng nhập..."
                        value={loginUser}
                        onChange={(e) => setLoginUser(e.target.value)}
                        className="login-field-input"
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  {/* Password Field */}
                  <div className="login-input-group">
                    <label className="section-label">Mật khẩu</label>
                    <div className="login-input-wrapper">
                      <span className="login-input-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </span>
                      <input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="Nhập mật khẩu..."
                        value={loginPass}
                        onChange={(e) => setLoginPass(e.target.value)}
                        className="login-field-input"
                        style={{ paddingRight: '48px' }}
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword(!showLoginPassword)}
                        style={{ position: 'absolute', right: '14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-var)', display: 'flex', alignItems: 'center', padding: 0, opacity: 0.7, transition: 'opacity 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
                      >
                        {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Submit */}
                  <button
                    id="login-submit-btn"
                    type="submit"
                    className="login-submit-btn"
                  >
                    <LogIn size={16} />
                    Đăng nhập
                  </button>
                </form>

                {/* Footer */}
                <p className="login-footer">
                  © 2025 IIG Vietnam · Bảo mật &amp; Bảo hành thông tin
                </p>
              </div>
            </div>
          </div>
        } />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100%', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}>
      {/* Ambient glows */}
      <div style={{ position: 'fixed', top: '-96px', left: '-96px', width: '384px', height: '384px', background: 'rgba(168,200,255,0.08)', borderRadius: '50%', filter: 'blur(120px)', pointerEvents: 'none', zIndex: 0 }} />
      <div style={{ position: 'fixed', top: '50%', right: '-96px', width: '320px', height: '320px', background: 'rgba(224,182,255,0.05)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none', zIndex: 0 }} />

      {/* ── SIDEBAR ── */}
      <aside className="glass-sidebar" style={{
        width: sidebarCollapsed ? '72px' : 'var(--sidebar-width)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        zIndex: 50,
        position: 'relative',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        {/* Logo & Toggle */}
        <div>
          <div style={{ padding: sidebarCollapsed ? '20px 14px' : '24px 24px 20px', display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(0,85,165,0.35)', border: '1px solid rgba(168,200,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,85,165,0.4)', flexShrink: 0 }}>
                <img src="/IIG_logo.webp" alt="IIG Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px', boxSizing: 'border-box' }} />
              </div>
              {!sidebarCollapsed && (
                <div style={{ animation: 'formFadeIn 0.2s ease forwards' }}>
                  <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif', lineHeight: 1.2, whiteSpace: 'nowrap' }}>IIG AI Scoring</h1>
                  <p style={{ margin: 0, fontSize: '10px', fontWeight: '600', letterSpacing: '0.10em', textTransform: 'uppercase', color: 'var(--on-surface-var)', whiteSpace: 'nowrap' }}>Admin Console</p>
                </div>
              )}
            </div>
            {!sidebarCollapsed && (
              <button onClick={toggleSidebar} title="Thu gọn menu" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', borderRadius: '6px', padding: 0 }} onMouseEnter={e=>e.currentTarget.style.color='var(--primary)'} onMouseLeave={e=>e.currentTarget.style.color='var(--on-surface-var)'}>
                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_left</span>
              </button>
            )}
          </div>

          {/* Toggle button when collapsed */}
          {sidebarCollapsed && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 0' }}>
              <button onClick={toggleSidebar} title="Mở rộng menu" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: 'var(--on-surface-var)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '8px' }} onMouseEnter={e=>e.currentTarget.style.color='var(--primary)'} onMouseLeave={e=>e.currentTarget.style.color='var(--on-surface-var)'}>
                <Sliders size={16} />
              </button>
            </div>
          )}

          {/* Nav */}
          <nav style={{ padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: '4px', alignItems: sidebarCollapsed ? 'center' : 'stretch' }}>
            <button onClick={() => navigate('/submissions')} className={`nav-item${activeTab === 'submissions' ? ' active' : ''}`} title="Xem bài chấm" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px 0' : '12px 20px', width: sidebarCollapsed ? '48px' : '100%' }}>
              <FileText size={16} style={{ flexShrink: 0 }}/>
              {!sidebarCollapsed && <span>Xem bài chấm</span>}
            </button>
            {currentUser?.role === 'admin' && (
              <button onClick={() => navigate('/mappings')} className={`nav-item${activeTab === 'mappings' ? ' active' : ''}`} title="Mapping Keycode" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px 0' : '12px 20px', width: sidebarCollapsed ? '48px' : '100%' }}>
                <Database size={16} style={{ flexShrink: 0 }}/>
                {!sidebarCollapsed && <span>Mapping Keycode</span>}
              </button>
            )}
            {currentUser?.role === 'admin' && (
              <button onClick={() => navigate('/ai')} className={`nav-item${activeTab === 'ai' ? ' active' : ''}`} title="Cấu hình AI" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px 0' : '12px 20px', width: sidebarCollapsed ? '48px' : '100%' }}>
                <Cpu size={16} style={{ flexShrink: 0 }}/>
                {!sidebarCollapsed && <span>Cấu hình AI</span>}
              </button>
            )}
            {currentUser?.role === 'admin' && (
              <button onClick={() => navigate('/users')} className={`nav-item${activeTab === 'users' ? ' active' : ''}`} title="Quản lý Users" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px 0' : '12px 20px', width: sidebarCollapsed ? '48px' : '100%' }}>
                <Users size={16} style={{ flexShrink: 0 }}/>
                {!sidebarCollapsed && <span>Quản lý Users</span>}
              </button>
            )}
            <button onClick={() => navigate('/logs')} className={`nav-item${activeTab === 'logs' ? ' active' : ''}`} title="AI Logs" style={{ justifyContent: sidebarCollapsed ? 'center' : 'flex-start', padding: sidebarCollapsed ? '12px 0' : '12px 20px', width: sidebarCollapsed ? '48px' : '100%' }}>
              <MessageSquare size={16} style={{ flexShrink: 0 }}/>
              {!sidebarCollapsed && <span>AI Logs</span>}
            </button>
          </nav>
        </div>

        {/* Profile */}
        <div style={{ padding: sidebarCollapsed ? '12px 8px' : '16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', flexDirection: sidebarCollapsed ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', padding: sidebarCollapsed ? '10px 4px' : '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', gap: sidebarCollapsed ? '12px' : '0' }}>
            <div style={{ display: 'flex', flexDirection: sidebarCollapsed ? 'column' : 'row', alignItems: 'center', gap: '10px', overflow: 'hidden', flex: 1, width: '100%', justifyContent: 'center' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--primary-container), var(--tertiary-container))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: '700', fontSize: '13px', color: 'var(--on-primary-container)',
                border: '2px solid rgba(168,200,255,0.2)'
              }} title={currentUser?.username || ''}>
                {(currentUser?.username || 'US').substring(0, 2).toUpperCase()}
              </div>
              {!sidebarCollapsed && (
                <div style={{ overflow: 'hidden', flex: 1, animation: 'formFadeIn 0.2s ease forwards' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--on-surface)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.username || ''}</div>
                  <div style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--on-surface-var)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentUser?.role === 'admin' ? 'Administrator' : 'User'}</div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexDirection: sidebarCollapsed ? 'column' : 'row' }}>
              <button 
                onClick={toggleTheme} 
                title={isLightTheme ? "Chuyển sang chế độ tối" : "Chuyển sang chế độ sáng"} 
                style={{ 
                  background: 'none', border: 'none', cursor: 'pointer', 
                  color: 'var(--on-surface-var)', display: 'flex', alignItems: 'center', 
                  padding: '4px', borderRadius: '6px', transition: 'color 0.2s', flexShrink: 0 
                }} 
                onMouseEnter={e=>e.currentTarget.style.color='var(--primary)'} 
                onMouseLeave={e=>e.currentTarget.style.color='var(--on-surface-var)'}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
                  {isLightTheme ? 'dark_mode' : 'light_mode'}
                </span>
              </button>
              <button onClick={handleLogout} title="Đăng xuất" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-var)', display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '6px', transition: 'color 0.2s', flexShrink: 0 }} onMouseEnter={e=>e.currentTarget.style.color='var(--error)'} onMouseLeave={e=>e.currentTarget.style.color='var(--on-surface-var)'}>
                <LogOut size={16}/>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* MESSAGE TOAST */}
      {message && (
        <div className={`toast ${message.type}`}>{message.text}</div>
      )}

      {/* MAIN CONTENT */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        
        <Routes>
          <Route path="/submissions" element={
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* ── Stat cards (Đưa lên đầu) ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', padding: '24px 24px 0' }}>
                {/* Total */}
                <div className="stat-card" style={{ minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'visible', position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={14} style={{ color: 'var(--primary)' }}/>
                      <span className="section-label">Tổng bài nộp</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'Lexend, sans-serif' }}>{submissions.length}</span>
                  </div>
                  {/* Biểu đồ số bài nộp theo ngày từ dữ liệu thực tế */}
                  <div className="mini-bar" style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '70px', marginTop: '12px', overflow: 'visible', position: 'relative' }}>
                    {(() => {
                      // Tính toán số lượng bài nộp theo từng ngày (7 ngày gần nhất)
                      const last7Days = Array.from({ length: 7 }, (_, i) => {
                        const d = new Date();
                        d.setDate(d.getDate() - i);
                        return d.toISOString().split('T')[0];
                      }).reverse();

                      const counts = last7Days.map(dateStr => {
                        return submissions.filter(s => {
                          if (!s.submitted_date) return false;
                          const sDate = new Date(s.submitted_date).toISOString().split('T')[0];
                          return sDate === dateStr;
                        }).length;
                      });

                      const maxCount = Math.max(...counts, 1);
                      return counts.map((count, i) => {
                        const heightPct = (count / maxCount) * 100;
                        const dateLabel = new Date(last7Days[i]).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
                        return (
                          <div
                            key={i}
                            className="bar-item"
                            style={{
                              flex: 1,
                              height: `${Math.max(heightPct, 12)}%`,
                              background: count > 0 ? 'var(--primary)' : 'var(--outline-var)',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            {/* Rich CSS Tooltip */}
                            <div className="tooltip-text" style={{
                              position: 'absolute',
                              bottom: '100%',
                              left: '50%',
                              transform: 'translate(-50%, 0)',
                              background: 'var(--surface-high)',
                              border: '1px solid var(--bento-border)',
                              color: 'var(--on-surface)',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: '600',
                              whiteSpace: 'nowrap',
                              opacity: 0,
                              visibility: 'hidden',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              transition: 'all 0.15s ease',
                              zIndex: 10
                            }}>
                              Ngày {dateLabel}: <strong style={{ color: 'var(--primary)' }}>{count} bài</strong>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
                {/* Done */}
                <div className="stat-card" style={{ minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle size={14} style={{ color: 'var(--primary)' }}/>
                      <span className="section-label">Đã chấm</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'Lexend, sans-serif' }}>{submissions.filter(s=>s.status===3).length}</span>
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    {submissions.length > 0 && (() => { const pct = Math.round(submissions.filter(s=>s.status===3).length/submissions.length*100); return (
                      <><div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div><p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600' }}>{pct}% hoàn thành</p></>
                    );})()} 
                  </div>
                </div>
                {/* Pending */}
                <div className="stat-card" style={{ minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Clock size={14} style={{ color: 'var(--primary)' }}/>
                      <span className="section-label">Chưa chấm</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'Lexend, sans-serif' }}>{submissions.filter(s=>s.status===1).length}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--outline-var)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600' }}>
                      Chờ kích hoạt chấm
                    </span>
                  </div>
                </div>
                {/* Processing */}
                <div className="stat-card" style={{ minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <RefreshCw size={14} className={submissions.filter(s=>s.status===2).length > 0 ? 'spinner' : ''} style={{ color: 'var(--primary)' }}/>
                      <span className="section-label">Đang chấm</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--primary)', fontFamily: 'Lexend, sans-serif' }}>{submissions.filter(s=>s.status===2).length}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)', className: submissions.filter(s=>s.status===2).length > 0 ? 'pulse-dot' : '' }} />
                    <span style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600' }}>
                      {submissions.filter(s=>s.status===2).length > 0 ? 'Đang chạy tiến trình...' : 'Không có tiến trình'}
                    </span>
                  </div>
                </div>
                {/* Errors */}
                <div className="stat-card" style={{ minHeight: '145px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertTriangle size={14} style={{ color: 'var(--error)' }}/>
                      <span className="section-label" style={{ color: 'var(--error)' }}>Bị lỗi</span>
                    </div>
                    <span style={{ fontSize: '20px', fontWeight: '700', color: 'var(--error)', fontFamily: 'Lexend, sans-serif' }}>{submissions.filter(s=>s.status===4).length}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--error)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: '600' }}>
                      Cần kiểm tra cấu hình
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Table card (Di chuyển Search, Filter, Sync vào đây) ── */}
              <div className="glass-card" style={{ margin: '20px 24px 24px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
                    <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif', whiteSpace: 'nowrap' }}>Danh sách bài chấm</h2>
                    {/* Search bar */}
                    <div style={{ position: 'relative', flex: '1', maxWidth: '320px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-var)' }}/>
                      <input
                        type="text"
                        placeholder="Tìm keycode, học viên..."
                        value={searchKey}
                        onChange={(e) => setSearchKey(e.target.value)}
                        className="glass-input"
                        style={{ width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingVertical: '8px', borderRadius: '9999px', boxSizing: 'border-box', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {selectedSubIds.length > 0 && (
                      <>
                        <button onClick={handleBulkGradeSubmissions} className="btn-primary" style={{ background: 'rgba(0, 85, 165, 0.1)', color: 'var(--primary)', border: '1px solid rgba(0, 85, 165, 0.3)', fontSize: '11px', padding: '6px 14px', gap: '4px', display: 'flex', alignItems: 'center' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>auto_awesome</span> Tự động chấm ({selectedSubIds.length})
                        </button>
                        <button onClick={handleExportExcel} className="btn-primary" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '11px', padding: '6px 14px', gap: '4px' }}>
                          <Download size={13}/> Xuất Excel ({selectedSubIds.length})
                        </button>
                        <button onClick={handleBulkDeleteSubmissions} className="btn-primary" style={{ background: 'var(--error-container)', color: 'var(--error)', fontSize: '11px', padding: '6px 14px' }}>
                          Xóa ({selectedSubIds.length})
                        </button>
                      </>
                    )}
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="glass-input" style={{ padding: '7px 12px', fontSize: '12px' }}>
                      <option value="">Tất cả trạng thái</option>
                      <option value="1">Chưa chấm</option>
                      <option value="2">Đang chấm</option>
                      <option value="3">Đã chấm</option>
                      <option value="4">Lỗi</option>
                    </select>
                    <button onClick={() => { setPullKeycode(''); setPullStatus('idle'); setPullResultId(''); setShowPullModal(true); }} className="btn-primary" style={{ gap: '4px', padding: '8px 14px', fontSize: '12px' }}>
                      <Download size={13}/> Kéo dữ liệu bài thi
                    </button>
                  </div>
                </div>
                {/* TABULAR SUBMISSIONS LIST */}
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {loading && submissions.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '64px' }}>
                      <RefreshCw className="spinner" size={32} style={{ marginBottom: '12px', color: '#3b82f6' }}/>
                      <div style={{ fontWeight: '500' }}>Đang tải danh sách bài làm...</div>
                    </div>
                  ) : submissions.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '64px' }}>
                      Không tìm thấy bài làm nào được đồng bộ. Vui lòng nhập Keycode để đồng bộ mới.
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          <th style={{ padding: '14px 20px', width: '40px' }}>
                            <input type="checkbox"
                              checked={submissions.length > 0 && submissions.slice((subCurrentPage-1)*subPageSize, subCurrentPage*subPageSize).every(sub=>selectedSubIds.includes(sub.id))}
                              onChange={(e) => {
                                const pageItems = submissions.slice((subCurrentPage-1)*subPageSize, subCurrentPage*subPageSize);
                                if (e.target.checked) { const ns=[...selectedSubIds]; pageItems.forEach(it=>{ if(!ns.includes(it.id)) ns.push(it.id); }); setSelectedSubIds(ns); }
                                else { const ids=pageItems.map(it=>it.id); setSelectedSubIds(selectedSubIds.filter(id=>!ids.includes(id))); }
                              }}
                              style={{ cursor:'pointer', accentColor:'var(--primary)' }}
                            />
                          </th>
                          {['STT','Mã đề (Keycode)','Học viên','Tên đề thi','Ngày nộp','Đồng bộ','Trạng thái','Hành động'].map(h=>(
                            <th key={h} style={{ padding:'14px 16px', fontSize:'11px', fontWeight:'700', color:'var(--on-surface-var)', textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap', textAlign: h==='Hành động'?'center':'left' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {submissions.slice((subCurrentPage-1)*subPageSize, subCurrentPage*subPageSize).map((sub, index) => (
                          <tr
                            key={sub.id}
                            className={`sub-row${selectedSubIds.includes(sub.id)?' selected':''}`}
                            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                            onClick={() => navigate(`/submissions/${sub.id}`)}
                          >
                            <td style={{ padding:'14px 20px' }} onClick={e=>e.stopPropagation()}>
                              <input type="checkbox" checked={selectedSubIds.includes(sub.id)}
                                onChange={() => { if(selectedSubIds.includes(sub.id)) setSelectedSubIds(selectedSubIds.filter(id=>id!==sub.id)); else setSelectedSubIds([...selectedSubIds,sub.id]); }}
                                style={{ cursor:'pointer', accentColor:'var(--primary)' }}
                              />
                            </td>
                            <td style={{ padding:'14px 16px', fontSize:'12px', color:'var(--on-surface-var)' }}>{(subCurrentPage-1)*subPageSize+index+1}</td>
                            <td style={{ padding:'14px 16px' }}><span className="keycode-chip">{sub.keycode}</span></td>
                            <td style={{ padding:'14px 16px' }}>
                              <div style={{ fontWeight:'600', color:'var(--on-surface)', fontSize:'13px' }}>{sub.student_name}</div>
                              {(sub.student_email||sub.student_phone) && (
                                <div style={{ fontSize:'10px', color:'var(--on-surface-var)', marginTop:'2px' }}>
                                  {sub.student_email && sub.student_email!=='Unknown Student' && <span>📧 {sub.student_email}</span>}
                                  {sub.student_phone && sub.student_phone!=='Unknown Student' && <span> 📞 {sub.student_phone}</span>}
                                </div>
                              )}
                            </td>
                            <td style={{ padding:'14px 16px', color:'var(--on-surface-var)', fontSize:'12px', maxWidth:'220px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sub.test_name}</td>
                            <td style={{ padding:'14px 16px' }}>
                              <div style={{ fontSize:'12px', fontWeight:'600', color:'var(--on-surface)' }}>{new Date(sub.submitted_date).toLocaleTimeString('vi-VN',{hour12:false})}</div>
                              <div style={{ fontSize:'10px', color:'var(--on-surface-var)' }}>{new Date(sub.submitted_date).toLocaleDateString('vi-VN')}</div>
                            </td>
                            <td style={{ padding:'14px 16px' }}>
                              <div style={{ fontSize:'12px', color:'var(--on-surface-var)' }}>{new Date(sub.synced_at||sub.updated_at).toLocaleString('vi-VN')}</div>
                            </td>
                            <td style={{ padding:'14px 16px' }}>{getStatusBadge(sub.status)}</td>
                            <td style={{ padding:'14px 16px', textAlign:'center' }} onClick={e=>e.stopPropagation()}>
                              <div style={{ display:'flex', gap:'6px', justifyContent:'center' }}>
                                <button className="icon-btn" title="Xem chi tiết" onClick={()=>navigate(`/submissions/${sub.id}`)}><Eye size={14}/></button>
                                <button className="icon-btn danger" disabled={sub.status!==1} title={sub.status===1?'Xóa bài':'Không thể xóa bài đã chấm'} onClick={()=>handleDeleteSubmission(sub.id,sub.keycode,sub.status)}><Trash2 size={14}/></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* PAGINATION */}
                {submissions.length > 0 && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.02)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', color:'var(--on-surface-var)' }}>
                      <span>Hiển thị hàng:</span>
                      <select value={subPageSize} onChange={(e)=>{ setSubPageSize(parseInt(e.target.value,10)); setSubCurrentPage(1); }} className="glass-input" style={{ padding:'4px 10px', fontSize:'12px' }}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={40}>40</option>
                        <option value={100}>100</option>
                      </select>
                      <span style={{ marginLeft:'8px' }}>Trang {subCurrentPage} / {Math.ceil(submissions.length/subPageSize)||1} (Tổng {submissions.length} bài chấm)</span>
                    </div>
                    <div style={{ display:'flex', gap:'6px' }}>
                      <button disabled={subCurrentPage===1} onClick={()=>setSubCurrentPage(subCurrentPage-1)} className="btn-secondary" style={{ padding:'6px 16px', fontSize:'12px' }}>Trước</button>
                      <button disabled={subCurrentPage>=Math.ceil(submissions.length/subPageSize)} onClick={()=>setSubCurrentPage(subCurrentPage+1)} className="btn-secondary" style={{ padding:'6px 16px', fontSize:'12px' }}>Sau</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          } />

          <Route path="/submissions/:id" element={
            <SubmissionDetailView showMsg={showMsg} getStatusBadge={getStatusBadge} addLiveLog={addLiveLog} />
          } />

        {/* MAPPINGS MANAGEMENT TAB CONTENT */}
          <Route path="/mappings" element={
            currentUser?.role === 'admin' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '24px' }}>
                
                {/* External Page Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                      Quản lý Mapping Keycode ↔ ID
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--on-surface-var)' }}>
                      Cấu hình liên kết mã đề thi (Keycode) với Course Scoring ID từ IIG Elearning.
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {/* Search */}
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-var)' }}/>
                      <input 
                        type="text" 
                        placeholder="Tìm keycode hoặc đề..." 
                        value={mappingSearch}
                        onChange={(e) => setMappingSearch(e.target.value)}
                        className="glass-input"
                        style={{ width: '200px', paddingLeft: '34px', fontSize: '12px', paddingVertical: '8px' }}
                      />
                    </div>
                    
                    {/* Sync from Elearning Trigger */}
                    <button 
                      onClick={() => {
                        setShowSyncModal(true);
                        setSyncStatus('idle');
                        setSyncCount(0);
                      }} 
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '8px 16px', borderColor: 'rgba(16, 185, 129, 0.4)', color: '#10b981' }}
                    >
                      <RefreshCw size={13}/>
                      Đồng bộ Elearning
                    </button>

                    {/* Add Manual */}
                    <button 
                      onClick={() => {
                        setNewKeycode('');
                        setNewCourseScoringId('');
                        setNewStudentName('');
                        setNewTestName('');
                        setIsEditingMapping(false);
                        setShowMappingModal(true);
                      }}
                      className="btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '9px 18px', borderRadius: '12px' }}
                    >
                      <Plus size={14}/> Thêm Mapping
                    </button>
                  </div>
                </div>

                {/* Table Glass Card */}
                <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loadingMappings ? (
                      <div style={{ padding: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <RefreshCw className="spinner" size={28} style={{ color: 'var(--primary)' }}/>
                        <span style={{ fontSize: '14px', color: 'var(--on-surface-var)' }}>Đang tải danh sách mappings...</span>
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '60px' }}>STT</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mã đề (Keycode)</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Học sinh</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tên đề thi</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Course Scoring ID</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cập nhật</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Hành động</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mappingsList
                            .filter(item => 
                              item.keycode.toLowerCase().includes(mappingSearch.toLowerCase()) ||
                              (item.student_name || '').toLowerCase().includes(mappingSearch.toLowerCase()) ||
                              (item.test_name || '').toLowerCase().includes(mappingSearch.toLowerCase())
                            )
                            .slice((mapCurrentPage - 1) * mapPageSize, mapCurrentPage * mapPageSize)
                            .map((mapItem, index) => (
                              <tr key={mapItem.keycode} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--on-surface-var)' }}>
                                  {(mapCurrentPage - 1) * mapPageSize + index + 1}
                                </td>
                                <td style={{ padding: '14px 20px', fontWeight: '700', color: 'var(--primary)', fontSize: '14px', letterSpacing: '0.05em' }}>{mapItem.keycode}</td>
                                <td style={{ padding: '14px 20px', color: 'var(--on-surface)', fontSize: '13px' }}>
                                  {mapItem.student_name
                                    ? <span style={{ fontWeight: '500' }}>{mapItem.student_name}</span>
                                    : <em style={{ color: 'var(--on-surface-var)', opacity: 0.5, fontSize: '12px' }}>Chưa đồng bộ</em>}
                                </td>
                                <td style={{ padding: '14px 20px', color: 'var(--on-surface-var)', fontSize: '13px', maxWidth: '260px' }}>
                                  {mapItem.test_name
                                    ? <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={mapItem.test_name}>{mapItem.test_name}</span>
                                    : <em style={{ color: 'var(--on-surface-var)', opacity: 0.5, fontSize: '12px' }}>Chưa đồng bộ</em>}
                                </td>
                                <td style={{ padding: '14px 20px', color: 'var(--on-surface-var)', opacity: 0.6, fontSize: '11px', fontFamily: 'monospace' }}>{mapItem.course_scoring_id}</td>
                                <td style={{ padding: '14px 20px', color: 'var(--on-surface-var)', fontSize: '12.5px' }}>{new Date(mapItem.updated_at || mapItem.created_at).toLocaleString('vi-VN')}</td>
                                <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <button 
                                      onClick={() => {
                                        setNewKeycode(mapItem.keycode);
                                        setNewCourseScoringId(mapItem.course_scoring_id);
                                        setNewStudentName(mapItem.student_name || '');
                                        setNewTestName(mapItem.test_name || '');
                                        setIsEditingMapping(true);
                                        setShowMappingModal(true);
                                      }}
                                      className="icon-btn" 
                                      title="Sửa mapping"
                                    >
                                      <Edit2 size={13}/>
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteMapping(mapItem.keycode)}
                                      className="icon-btn danger" 
                                      title="Xóa mapping"
                                    >
                                      <Trash2 size={13}/>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PAGINATION PANEL FOR MAPPINGS */}
                  {!loadingMappings && mappingsList.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--on-surface-var)' }}>
                        <span>Hiển thị hàng:</span>
                        <select 
                          value={mapPageSize} 
                          onChange={(e) => {
                            setMapPageSize(parseInt(e.target.value, 10));
                            setMapCurrentPage(1);
                          }}
                          className="glass-input"
                          style={{ padding: '4px 8px', fontSize: '12px' }}
                        >
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                          <option value={40}>40</option>
                          <option value={100}>100</option>
                        </select>
                        <span style={{ marginLeft: '12px' }}>
                          {(() => { const f = mappingsList.filter(item => item.keycode.toLowerCase().includes(mappingSearch.toLowerCase()) || (item.student_name||'').toLowerCase().includes(mappingSearch.toLowerCase()) || (item.test_name||'').toLowerCase().includes(mappingSearch.toLowerCase())); return `Trang ${mapCurrentPage} / ${Math.ceil(f.length / mapPageSize) || 1} (Tổng ${f.length} mappings)`; })()}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          disabled={mapCurrentPage === 1}
                          onClick={() => setMapCurrentPage(mapCurrentPage - 1)}
                          className="btn-secondary"
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          Trước
                        </button>
                        <button 
                          disabled={mapCurrentPage >= Math.ceil(mappingsList.filter(item => item.keycode.toLowerCase().includes(mappingSearch.toLowerCase()) || (item.student_name||'').toLowerCase().includes(mappingSearch.toLowerCase()) || (item.test_name||'').toLowerCase().includes(mappingSearch.toLowerCase())).length / mapPageSize)}
                          onClick={() => setMapCurrentPage(mapCurrentPage + 1)}
                          className="btn-secondary"
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          Sau
                        </button>
                      </div>
                    </div>
                  )}
                </div>

            {/* ADD/EDIT MAPPING MODAL POPUP */}
            {showMappingModal && (
              <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(11, 19, 38, 0.6)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
              }}>
                <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '32px', boxSizing: 'border-box', background: 'rgba(23, 31, 51, 0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <h3 style={{ margin: '0 0 20px 0', fontSize: '17px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                    {isEditingMapping ? 'Cập nhật Mapping Keycode' : 'Thêm Mapping Keycode thủ công'}
                  </h3>
                  
                  <form onSubmit={handleSaveMapping} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>MÃ ĐỀ (KEYCODE) *</label>
                      <input 
                        type="text" 
                        placeholder="Nhập mã đề (e.g. Z9FH65)..."
                        value={newKeycode}
                        onChange={(e) => setNewKeycode(e.target.value)}
                        className="glass-input"
                        style={{ fontSize: '13px', textTransform: 'uppercase', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
                        disabled={isEditingMapping}
                        required
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>COURSE SCORING ID (UUID TỪ IIG ELEARNING) *</label>
                      <input 
                        type="text" 
                        placeholder="Nhập ID từ Elearning..."
                        value={newCourseScoringId}
                        onChange={(e) => setNewCourseScoringId(e.target.value)}
                        className="glass-input"
                        style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
                        required
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>HỌ TÊN HỌC VIÊN (TÙY CHỌN)</label>
                      <input 
                        type="text" 
                        placeholder="Nhập tên học viên (e.g. Nghi Nguyen)..."
                        value={newStudentName}
                        onChange={(e) => setNewStudentName(e.target.value)}
                        className="glass-input"
                        style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>TÊN ĐỀ THI (TÙY CHỌN)</label>
                      <input 
                        type="text" 
                        placeholder="Nhập tên đề thi..."
                        value={newTestName}
                        onChange={(e) => setNewTestName(e.target.value)}
                        className="glass-input"
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                      <button 
                        type="button" 
                        onClick={() => setShowMappingModal(false)} 
                        className="btn-secondary"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        Hủy bỏ
                      </button>
                      <button 
                        type="submit" 
                        className="btn-primary"
                        style={{ padding: '8px 16px', fontSize: '13px' }}
                      >
                        Lưu Mapping
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
              </div>
            ) : <Navigate to="/submissions" replace />
          } />

          {/* AI AGENT MANAGEMENT TAB CONTENT */}
          <Route path="/ai" element={
            currentUser?.role === 'admin' ? (
              <AgentManagementView showMsg={showMsg} />
            ) : <Navigate to="/submissions" replace />
          } />

          {/* USER MANAGEMENT TAB CONTENT (Admin Only) */}
          <Route path="/questions" element={
            currentUser?.role === 'admin' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                  Quản lý ngân hàng câu hỏi (TOEFL iBT)
                </h2>
                <p style={{ margin: '4px 0 24px 0', fontSize: '13px', color: 'var(--on-surface-var)' }}>
                  Giao diện quản lý ngân hàng câu hỏi TOEFL iBT 4 kỹ năng đang được chuẩn bị xây dựng.
                </p>
                <div className="glass-card" style={{ padding: '32px', textAlign: 'center', color: 'var(--on-surface-var)' }}>
                  <HelpCircle size={48} style={{ color: 'var(--primary)', marginBottom: '16px', opacity: 0.8 }} />
                  <div>Các tính năng tiếp theo đang chờ bạn chỉ thị để triển khai từng bước...</div>
                </div>
              </div>
            ) : <Navigate to="/submissions" replace />
          } />

          <Route path="/users" element={
            currentUser?.role === 'admin' ? (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '24px' }}>
                
                {/* External Page Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                      Quản lý tài khoản
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--on-surface-var)' }}>
                      Danh sách tài khoản hệ thống IIG AI Scoring Admin Console.
                    </p>
                  </div>
                  
                  <button 
                    onClick={() => {
                      setNewUsername('');
                      setNewPassword('');
                      setNewRole('user');
                      setIsEditingUser(false);
                      setShowCreateModal(true);
                    }}
                    className="btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', padding: '9px 18px', borderRadius: '12px' }}
                  >
                    <Plus size={15}/> Thêm tài khoản
                  </button>
                </div>

                {/* Table Glass Card */}
                <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {loadingUsers ? (
                      <div style={{ padding: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                        <RefreshCw className="spinner" size={28} style={{ color: 'var(--primary)' }}/>
                        <span style={{ fontSize: '14px', color: 'var(--on-surface-var)' }}>Đang tải danh sách người dùng...</span>
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '60px' }}>STT</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em', width: '120px' }}>ID</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tên đăng nhập</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quyền hạn (Role)</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ngày tạo</th>
                            <th style={{ padding: '14px 20px', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Hành động</th>
                          </tr>
                        </thead>
                        <tbody>
                          {usersList.map((userItem, index) => (
                            <tr key={userItem.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--on-surface-var)' }}>{index + 1}</td>
                              <td style={{ padding: '14px 20px', color: 'var(--on-surface-var)', opacity: 0.6, fontSize: '12px', fontFamily: 'monospace' }} title={userItem.id}>
                                {userItem.id ? `${userItem.id.substring(0, 8)}...` : ''}
                              </td>
                              <td style={{ padding: '14px 20px', fontWeight: '600', color: 'var(--on-surface)', fontSize: '14px' }}>{userItem.username}</td>
                              <td style={{ padding: '14px 20px' }}>
                                <span style={{ 
                                  background: userItem.role === 'admin' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                  color: userItem.role === 'admin' ? '#ef4444' : '#10b981',
                                  padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                                  border: userItem.role === 'admin' ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(16,185,129,0.25)'
                                }}>
                                  {userItem.role}
                                </span>
                              </td>
                              <td style={{ padding: '14px 20px', color: 'var(--on-surface-var)', fontSize: '13px' }}>
                                {userItem.created_at ? new Date(userItem.created_at).toLocaleDateString('vi-VN') : ''}
                              </td>
                              <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  {/* Sửa User */}
                                  <button 
                                    onClick={() => {
                                      setNewUsername(userItem.username);
                                      setNewRole(userItem.role);
                                      setNewPassword(''); // Trống nếu giữ nguyên
                                      setIsEditingUser(true);
                                      setEditingUserId(userItem.id);
                                      setShowCreateModal(true);
                                    }}
                                    className="icon-btn" 
                                    title="Sửa tài khoản"
                                  >
                                    <Edit2 size={13}/>
                                  </button>

                                  {/* Xóa User */}
                                  <button 
                                    disabled={userItem.username === currentUser?.username}
                                    onClick={() => handleDeleteUser(userItem.id)}
                                    className="icon-btn danger" 
                                    title="Xóa tài khoản"
                                  >
                                    <Trash2 size={13}/>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* CREATE USER POPUP MODAL */}
                {showCreateModal && (
                  <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(11, 19, 38, 0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                  }}>
                    <div className="glass-card" style={{ width: '100%', maxWidth: '400px', padding: '32px', boxSizing: 'border-box', background: 'rgba(23, 31, 51, 0.95)', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <h3 style={{ margin: '0 0 20px 0', fontSize: '17px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                        {isEditingUser ? 'Cập nhật tài khoản' : 'Thêm tài khoản mới'}
                      </h3>
                      
                      <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>TÊN ĐĂNG NHẬP *</label>
                          <input 
                            type="text" 
                            placeholder="Nhập tên đăng nhập..."
                            value={newUsername}
                            onChange={(e) => setNewUsername(e.target.value)}
                            className="glass-input"
                            style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
                            required
                            disabled={isEditingUser}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>MẬT KHẨU</label>
                          <input 
                            type="password" 
                            placeholder={isEditingUser ? 'Bỏ trống nếu giữ nguyên mật khẩu cũ...' : 'Nhập mật khẩu...'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="glass-input"
                            style={{ fontSize: '13px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
                            required={!isEditingUser}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>QUYỀN HẠN (ROLE) *</label>
                          <select 
                            value={newRole}
                            onChange={(e) => setNewRole(e.target.value)}
                            className="glass-input"
                            style={{ fontSize: '13px', padding: '10px', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}
                          >
                            <option value="user">User (Chỉ chấm bài)</option>
                            <option value="admin">Admin (Toàn quyền)</option>
                          </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                          <button 
                            type="button" 
                            onClick={() => setShowCreateModal(false)} 
                            className="btn-secondary"
                            style={{ padding: '8px 16px', fontSize: '13px' }}
                          >
                            Hủy bỏ
                          </button>
                          <button 
                            type="submit" 
                            className="btn-primary"
                            style={{ padding: '8px 16px', fontSize: '13px' }}
                          >
                            {isEditingUser ? 'Lưu thay đổi' : 'Tạo tài khoản'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

              </div>
            ) : <Navigate to="/submissions" replace />
          } />

          <Route path="/logs" element={
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                    Nhật ký AI & Đồng bộ (AI Logs Console)
                  </h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--on-surface-var)' }}>
                    Nhật ký chi tiết các yêu cầu kích hoạt AI Agents chấm điểm, dịch STT và đồng bộ dữ liệu.
                  </p>
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => {
                      const txt = liveLogs.map(l => `[${l.time}] ${l.text}`).join('\n');
                      const blob = new Blob([txt], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `ai-scoring-log-${new Date().toISOString().split('T')[0]}.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showMsg('success', 'Xuất file log thành công!');
                    }}
                    className="btn-secondary" 
                    style={{ padding: '9px 16px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>download</span>
                    Xuất File Log
                  </button>
                  
                  <button 
                    onClick={() => {
                      const clearedLogs = [
                        { time: new Date().toLocaleTimeString('vi-VN', { hour12: false }), text: 'Logs console cleared by administrator.' }
                      ];
                      setLiveLogs(clearedLogs);
                      try {
                        localStorage.setItem('ai_scoring_live_logs', JSON.stringify(clearedLogs));
                      } catch (e) {}
                      showMsg('success', 'Đã xóa trắng lịch sử log.');
                    }}
                    className="btn-secondary" 
                    style={{ padding: '9px 16px', fontSize: '12px', color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>delete_sweep</span>
                    Xóa nhật ký
                  </button>
                </div>
              </div>

              {/* Log terminal box */}
              <div className="glass-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0b121f', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 16px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontFamily: 'Courier New, monospace', fontWeight: 'bold', marginLeft: '12px' }}>bash - logs@console</span>
                </div>
                
                <div id="live-log" style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'Courier New, monospace', fontSize: '12.5px', color: '#cbd5e1', lineHeight: 1.6 }}>
                  {liveLogs.map((log, index) => {
                    let logColor = '#cbd5e1';
                    if (log.text.includes('✅') || log.text.includes('🟢')) logColor = '#10b981';
                    else if (log.text.includes('❌') || log.text.includes('🔴')) logColor = '#ef4444';
                    else if (log.text.includes('🔄') || log.text.includes('🤖')) logColor = '#38bdf8';
                    
                    return (
                      <div key={index} style={{ display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '4px' }}>
                        <span style={{ color: 'var(--primary)', fontWeight: 'bold', flexShrink: 0 }}>[{log.time}]</span>
                        <span style={{ color: logColor }}>{log.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          } />

          <Route path="/" element={<Navigate to="/submissions" replace />} />
          <Route path="*" element={<Navigate to="/submissions" replace />} />
        </Routes>

      </main>


      {/* SYNC FROM ELEARNING POPUP MODAL (ROOT LEVEL) */}
      {showSyncModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--md-sys-color-scrim, rgba(0, 0, 0, 0.45))', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '440px', padding: '32px', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--outline-var)' }}>
            
            {/* Trạng thái 1: Nhập cấu hình lọc đồng bộ */}
            {syncStatus === 'idle' && (
              <>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '16px', fontWeight: '700', color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Lexend, sans-serif' }}>
                  <RefreshCw size={18} style={{ color: 'var(--primary)' }}/>
                  Cấu hình đồng bộ Elearning
                </h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>TỪ NGÀY NỘP</label>
                      <input 
                        type="date" 
                        value={syncFromDate} 
                        onChange={(e) => setSyncFromDate(e.target.value)} 
                        className="glass-input"
                        style={{ fontSize: '13px', padding: '8px 12px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>ĐẾN NGÀY NỘP</label>
                      <input 
                        type="date" 
                        value={syncToDate} 
                        onChange={(e) => setSyncToDate(e.target.value)} 
                        className="glass-input"
                        style={{ fontSize: '13px', padding: '8px 12px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>TỪ KHÓA TÌM KIẾM</label>
                    <input 
                      type="text" 
                      placeholder="Nhập tên học sinh, tên đề thi..." 
                      value={syncKeyword} 
                      onChange={(e) => setSyncKeyword(e.target.value)} 
                      className="glass-input"
                      style={{ fontSize: '13px', padding: '8px 12px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>SỐ LƯỢNG TẢI (MAX PAGE SIZE)</label>
                    <input 
                      type="number" 
                      min="10" 
                      max="2000"
                      value={syncPageSize} 
                      onChange={(e) => setSyncPageSize(e.target.value)} 
                      className="glass-input"
                      style={{ fontSize: '13px', padding: '8px 12px' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                    <button 
                      type="button" 
                      onClick={() => setShowSyncModal(false)} 
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      Hủy bỏ
                    </button>
                    <button 
                      type="button" 
                      onClick={handleSyncMappings}
                      className="btn-primary"
                      style={{ padding: '8px 20px', fontSize: '13px' }}
                    >
                      Xác nhận đồng bộ
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Trạng thái 2: Đang tải (Loading) */}
            {syncStatus === 'loading' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', gap: '16px' }}>
                <RefreshCw className="spinner" size={40} style={{ color: 'var(--primary)' }}/>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--on-surface)', textAlign: 'center' }}>Đang đồng bộ dữ liệu...</div>
                <div style={{ fontSize: '12.5px', color: 'var(--on-surface-var)', textAlign: 'center', lineHeight: 1.6 }}>Hệ thống đang truy xuất bài thi và ánh xạ keycode từ IIG Elearning. Quá trình này có thể mất vài chục giây.</div>
              </div>
            )}

            {/* Trạng thái 3: Đồng bộ thành công (Success) */}
            {syncStatus === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: '16px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981',
                  border: '2px solid rgba(16, 185, 129, 0.2)'
                }}>
                  <CheckCircle size={32} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--on-surface)' }}>Đồng bộ hoàn tất!</div>
                <div style={{ fontSize: '13px', color: 'var(--on-surface)', textAlign: 'center', background: 'var(--surface-low)', padding: '12px 20px', borderRadius: '12px', border: '1px solid var(--outline-var)', lineHeight: 1.6 }}>
                  Đã ánh xạ và đồng bộ thành công <strong style={{ color: '#10b981', fontSize: '15px' }}>{syncCount}</strong> keycode từ Elearning.
                </div>
                <button 
                  onClick={() => setShowSyncModal(false)}
                  className="btn-primary"
                  style={{ padding: '8px 24px', fontSize: '13px', marginTop: '8px' }}
                >
                  Hoàn thành
                </button>
              </div>
            )}

            {/* Trạng thái 4: Đồng bộ thất bại (Error) */}
            {syncStatus === 'error' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 0', gap: '16px' }}>
                <div style={{
                  width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444',
                  border: '2px solid rgba(239, 68, 68, 0.2)'
                }}>
                  <AlertTriangle size={32} />
                </div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--on-surface)' }}>Không thể đồng bộ</div>
                <div style={{ fontSize: '12.5px', color: 'var(--on-surface-var)', textAlign: 'center', lineHeight: 1.6 }}>Vui lòng kiểm tra lại cấu hình bộ lọc hoặc phiên đăng nhập Elearning của bạn.</div>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                  <button 
                    onClick={() => setShowSyncModal(false)}
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Đóng
                  </button>
                  <button 
                    onClick={() => setSyncStatus('idle')}
                    className="btn-primary"
                    style={{ padding: '8px 16px', fontSize: '13px', background: '#ef4444', border: 'none' }}
                  >
                    Thử lại
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* PULL SUBMISSION BY KEYCODE POPUP MODAL */}
      {showPullModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(11, 19, 38, 0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '460px', padding: '32px', boxSizing: 'border-box', background: 'var(--surface)', border: '1px solid var(--outline-var)' }}>
            
            {/* Trạng thái 1: Nhập Keycode */}
            {pullStatus === 'idle' && (
              <>
                <h3 style={{ margin: '0 0 20px 0', fontSize: '17px', fontWeight: '700', color: 'var(--on-surface)', display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'Lexend, sans-serif' }}>
                  <Download size={18} style={{ color: 'var(--primary)' }}/>
                  Kéo dữ liệu bài thi hàng loạt
                </h3>
                
                <form onSubmit={handlePullSubmission} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)', letterSpacing: '0.05em' }}>DANH SÁCH MÃ KEYCODE</label>
                    <textarea 
                      placeholder="Nhập danh sách keycodes, cách nhau bằng dấu phẩy, dòng mới hoặc khoảng trắng...&#10;Ví dụ:&#10;MNTT4A&#10;Z9FH65" 
                      value={pullKeycode} 
                      onChange={(e) => setPullKeycode(e.target.value)} 
                      className="glass-input"
                      style={{ fontSize: '13px', padding: '10px 14px', height: '120px', fontFamily: 'monospace', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', resize: 'vertical' }}
                      required
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                    <button 
                      type="button" 
                      onClick={() => setShowPullModal(false)} 
                      className="btn-secondary"
                      style={{ padding: '8px 16px', fontSize: '13px' }}
                    >
                      Hủy bỏ
                    </button>
                    <button 
                      type="submit"
                      className="btn-primary"
                      style={{ padding: '8px 20px', fontSize: '13px' }}
                    >
                      Xác nhận kéo bài
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Trạng thái 2: Loading (Tiến trình kéo từng code) */}
            {pullStatus === 'loading' && (() => {
              const processed = bulkPullProgress.completed.length + bulkPullProgress.failed.length;
              const progressPct = bulkPullProgress.total > 0 ? Math.round((processed / bulkPullProgress.total) * 100) : 0;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '12px 0', gap: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'center' }}>
                    <RefreshCw className="spinner" size={24} style={{ color: 'var(--primary)' }}/>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--on-surface)' }}>Đang kéo dữ liệu bài thi...</div>
                  </div>
                  
                  <div style={{ fontSize: '12.5px', color: 'var(--on-surface-var)', textAlign: 'center' }}>
                    Đang xử lý: <strong style={{ color: 'var(--primary)' }}>{bulkPullProgress.active}</strong> ({processed}/{bulkPullProgress.total} keycodes)
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{ width: `${progressPct}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.3s ease' }} />
                  </div>
                  <div style={{ fontSize: '11px', textAlign: 'right', color: 'var(--on-surface-var)', fontWeight: '600', marginTop: '-8px' }}>{progressPct}%</div>

                  {/* Real-time Logs Console */}
                  <div style={{
                    width: '100%', height: '150px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '11px', color: '#10b981',
                    overflowY: 'auto', boxSizing: 'border-box', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px'
                  }}>
                    {bulkPullProgress.logs.map((log, idx) => (
                      <div key={idx} style={{ color: log.includes('❌') ? '#f87171' : log.includes('✅') ? '#34d399' : '#93c5fd' }}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Trạng thái 3: Thành công (Success Summary) */}
            {pullStatus === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '12px 0', gap: '16px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981',
                    border: '2px solid rgba(16, 185, 129, 0.25)'
                  }}>
                    <CheckCircle size={32} />
                  </div>
                </div>
                
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--on-surface)' }}>Đồng bộ hoàn tất!</div>
                
                <div style={{ display: 'flex', justifyContent: 'space-around', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--on-surface-var)', fontWeight: 'bold' }}>TỔNG CỘNG</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--on-surface)' }}>{bulkPullProgress.total}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#34d399', fontWeight: 'bold' }}>THÀNH CÔNG</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#10b981' }}>{bulkPullProgress.completed.length}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: '#f87171', fontWeight: 'bold' }}>THẤT BẠI</div>
                    <div style={{ fontSize: '18px', fontWeight: '800', color: '#ef4444' }}>{bulkPullProgress.failed.length}</div>
                  </div>
                </div>

                {/* Final Logs Console */}
                <div style={{
                  width: '100%', height: '120px', background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px', padding: '12px', fontFamily: 'monospace', fontSize: '11px', color: '#10b981',
                  overflowY: 'auto', boxSizing: 'border-box', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                  {bulkPullProgress.logs.map((log, idx) => (
                    <div key={idx} style={{ color: log.includes('❌') ? '#f87171' : log.includes('✅') ? '#34d399' : '#93c5fd' }}>
                      {log}
                    </div>
                  ))}
                </div>
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '12px', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setShowPullModal(false)}
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '13px' }}
                  >
                    Đóng
                  </button>
                  {pullResultId && (
                    <button 
                      onClick={() => {
                        setShowPullModal(false);
                        setSelectedSubId(pullResultId);
                      }}
                      className="btn-primary"
                      style={{ padding: '8px 20px', fontSize: '13px', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none' }}
                    >
                      Xem bài chấm ngay
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* BULK GRADE POPUP MODAL */}
      {showGradeModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'var(--md-sys-color-scrim, rgba(0, 0, 0, 0.45))', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          animation: 'formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          <div className="glass-card" style={{ 
            width: '100%', maxWidth: '520px', padding: '36px', boxSizing: 'border-box', 
            background: 'var(--surface)', 
            border: '1px solid var(--outline-var)',
            borderRadius: '24px',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.12), 0 0 0 1px var(--outline-var)'
          }}>
            
            {/* Trạng thái 0: Xác nhận trước khi chấm */}
            {gradeStatus === 'idle' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '24px', textAlign: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <div style={{
                    width: '64px', height: '64px', borderRadius: '50%', background: 'var(--surface-low)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)',
                    border: '1px solid var(--outline-var)'
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '32px' }}>auto_awesome</span>
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                    Xác Nhận Tự Động Chấm Điểm
                  </h3>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--on-surface-var)', lineHeight: 1.6 }}>
                    Bạn đang yêu cầu chạy chấm điểm tự động cho <strong style={{ color: 'var(--primary)' }}>{selectedSubIds.length} bài thi</strong> đã chọn.
                  </p>
                </div>

                <div style={{ 
                  background: 'var(--surface-low)', 
                  padding: '16px', borderRadius: '16px', border: '1px solid var(--outline-var)',
                  textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '10px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface)' }}>CÁC BƯỚC SẼ ĐƯỢC THỰC HIỆN TỰ ĐỘNG:</div>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12.5px', color: 'var(--on-surface-var)', display: 'flex', flexDirection: 'column', gap: '6px', lineHeight: 1.5 }}>
                    <li>Quét và làm sạch nhiễu âm thanh của học viên (nếu có).</li>
                    <li>Chạy dịch âm thanh sang văn bản (STT) cho những phần chưa dịch.</li>
                    <li>Sử dụng Agent AI tương ứng để chấm điểm tự động cho tất cả 19 câu.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
                  <button 
                    onClick={() => setShowGradeModal(false)}
                    className="btn-secondary"
                    style={{ padding: '10px 20px', fontSize: '13px', borderRadius: '12px' }}
                  >
                    Hủy bỏ
                  </button>
                  <button 
                    onClick={startBulkGradeExecution}
                    className="btn-primary"
                    style={{ padding: '10px 24px', fontSize: '13px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    Bắt đầu chấm điểm
                  </button>
                </div>
              </div>
            )}

            {/* Trạng thái 1: Đang chấm điểm hàng loạt */}
            {gradeStatus === 'loading' && (() => {
              const processed = bulkGradeProgress.completed.length + bulkGradeProgress.failed.length;
              const progressPct = bulkGradeProgress.total > 0 ? Math.round((processed / bulkGradeProgress.total) * 100) : 0;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '50%', background: 'var(--surface-low)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)',
                      border: '1px solid var(--outline-var)'
                    }}>
                      <RefreshCw className="spinner" size={24} />
                    </div>
                    <h3 style={{ margin: '8px 0 0 0', fontSize: '18px', fontWeight: '800', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                      Đang Tự Động Chấm Điểm
                    </h3>
                    <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--on-surface-var)' }}>
                      Đang xử lý bài thi: <strong style={{ color: 'var(--primary)' }}>{bulkGradeProgress.active}</strong> ({processed}/{bulkGradeProgress.total} keycodes)
                    </p>
                  </div>

                  {/* Progress Section */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: '700', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <span>Tiến trình hoàn thành</span>
                      <span style={{ color: 'var(--primary)' }}>{progressPct}%</span>
                    </div>
                    <div style={{ width: '100%', height: '10px', background: 'var(--surface-container-high, rgba(0,0,0,0.05))', borderRadius: '9999px', overflow: 'hidden', padding: '1px', boxSizing: 'border-box' }}>
                      <div style={{ 
                        width: `${progressPct}%`, height: '100%', 
                        background: 'linear-gradient(90deg, var(--primary) 0%, var(--tertiary, #00d2fd) 100%)', 
                        borderRadius: '9999px',
                        transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' 
                      }} />
                    </div>
                  </div>

                  {/* Real-time Logs Console */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>LOG TIẾN TRÌNH CHI TIẾT</label>
                    <div style={{
                      width: '100%', height: '220px', 
                      background: '#191c1e', 
                      borderRadius: '12px', padding: '16px', 
                      fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '11.5px', 
                      overflowY: 'auto', boxSizing: 'border-box', textAlign: 'left', 
                      display: 'flex', flexDirection: 'column', gap: '6px',
                      boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}>
                      {bulkGradeProgress.logs.map((log, idx) => (
                        <div key={idx} style={{ 
                          color: log.includes('❌') ? '#f87171' : log.includes('✅') ? '#34d399' : log.includes('🔄') ? '#60a5fa' : '#94a3b8',
                          paddingLeft: log.startsWith('   ') ? '14px' : '0px',
                          lineHeight: 1.5
                        }}>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Trạng thái 2: Thành công (Success Summary) */}
            {gradeStatus === 'success' && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
                  <div style={{
                    width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981',
                    border: '2px solid rgba(16, 185, 129, 0.2)'
                  }}>
                    <CheckCircle size={32} />
                  </div>
                  <h3 style={{ margin: '8px 0 0 0', fontSize: '18px', fontWeight: '800', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>
                    Đã Hoàn Tất Chấm Điểm!
                  </h3>
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'var(--on-surface-var)' }}>
                    Tất cả các bài nộp đã được chấm điểm AI tự động hoàn tất.
                  </p>
                </div>
                
                {/* Stats Summary Dashboard */}
                <div style={{ 
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
                  background: 'var(--surface-container-low, rgba(0,0,0,0.02))', 
                  padding: '16px', borderRadius: '16px', 
                  border: '1px solid var(--outline-var)' 
                }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '10px', color: 'var(--on-surface-var)', fontWeight: '800', letterSpacing: '0.05em' }}>TỔNG CỘNG</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: 'var(--on-surface)', marginTop: '4px' }}>{bulkGradeProgress.total}</div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid var(--outline-var)' }}>
                    <div style={{ fontSize: '10px', color: '#10b981', fontWeight: '800', letterSpacing: '0.05em' }}>THÀNH CÔNG</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#10b981', marginTop: '4px' }}>{bulkGradeProgress.completed.length}</div>
                  </div>
                  <div style={{ textAlign: 'center', borderLeft: '1px solid var(--outline-var)' }}>
                    <div style={{ fontSize: '10px', color: '#ef4444', fontWeight: '800', letterSpacing: '0.05em' }}>THẤT BẠI</div>
                    <div style={{ fontSize: '20px', fontWeight: '800', color: '#ef4444', marginTop: '4px' }}>{bulkGradeProgress.failed.length}</div>
                  </div>
                </div>

                {/* Final Logs Console */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '800', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CHI TIẾT LỊCH SỬ CHẤM</label>
                  <div style={{
                    width: '100%', height: '140px', 
                    background: '#191c1e', 
                    borderRadius: '12px', padding: '16px', 
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace', fontSize: '11.5px', 
                    overflowY: 'auto', boxSizing: 'border-box', textAlign: 'left', 
                    display: 'flex', flexDirection: 'column', gap: '6px',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    {bulkGradeProgress.logs.map((log, idx) => (
                      <div key={idx} style={{ 
                        color: log.includes('❌') ? '#f87171' : log.includes('✅') ? '#34d399' : log.includes('🔄') ? '#60a5fa' : '#94a3b8',
                        paddingLeft: log.startsWith('   ') ? '14px' : '0px',
                        lineHeight: 1.5
                      }}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                  <button 
                    onClick={() => setShowGradeModal(false)}
                    className="btn-primary"
                    style={{ padding: '10px 24px', fontSize: '13px', borderRadius: '12px' }}
                  >
                    Đóng cửa sổ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const AgentManagementView = ({ showMsg }) => {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiType, setApiType] = useState('Grading'); // STT or Grading
  const [sttTarget, setSttTarget] = useState('student_answer'); // student_answer, question, context
  const [targetQuestions, setTargetQuestions] = useState([]);
  const [showApiKey, setShowApiKey] = useState(false);

  // Search, filter, and pagination states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL'); // ALL, Grading, STT
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

  const SPEAKING_GROUPS = [
    { key: 'sp_read_aloud', label: 'Speaking Q1-2: Read a Text Aloud' },
    { key: 'sp_describe_pic', label: 'Speaking Q3-4: Describe a Picture' },
    { key: 'sp_respond_q', label: 'Speaking Q5-7: Respond to Questions' },
    { key: 'sp_respond_info', label: 'Speaking Q8-10: Respond to Questions Using Information Provided' },
    { key: 'sp_opinion', label: 'Speaking Q11: Express an Opinion' },
  ];

  const WRITING_GROUPS = [
    { key: 'w_picture', label: 'Writing Q1-5: Write a Sentence Based on a Picture' },
    { key: 'w_email', label: 'Writing Q6-7: Respond to a Written Request' },
    { key: 'w_text', label: 'Writing Q8: Write an Opinion Essay' },
  ];

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/agents');
      if (res.data.success) {
        setAgents(res.data.data);
      }
    } catch (e) {
      showMsg('error', 'Lỗi tải danh sách Agent: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleOpenCreate = () => {
    setName('');
    setDescription('');
    setApiEndpoint('');
    setApiKey('');
    setApiType('Grading');
    setSttTarget('student_answer');
    setTargetQuestions([]);
    setIsEditing(false);
    setShowModal(true);
  };

  const handleOpenEdit = (agent) => {
    setName(agent.name);
    setDescription(agent.description || '');
    setApiEndpoint(agent.api_endpoint);
    setApiKey(agent.api_key);
    setApiType(agent.api_type);
    setSttTarget(agent.stt_target || 'student_answer');
    setTargetQuestions(agent.target_questions || []);
    setIsEditing(true);
    setEditingId(agent.id);
    setShowModal(true);
  };

  const handleToggleQuestion = (key) => {
    if (targetQuestions.includes(key)) {
      setTargetQuestions(targetQuestions.filter(k => k !== key));
    } else {
      setTargetQuestions([...targetQuestions, key]);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim() || !apiEndpoint.trim() || !apiKey.trim()) {
      showMsg('error', 'Vui lòng điền đầy đủ các thông tin bắt buộc.');
      return;
    }

    if (targetQuestions.length === 0) {
      showMsg('error', 'Vui lòng chọn ít nhất một nhóm câu hỏi áp dụng.');
      return;
    }

    // Constraint check
    if (apiType === 'STT') {
      const hasWriting = targetQuestions.some(q => q.startsWith('w_'));
      if (hasWriting) {
        showMsg('error', 'Transcribe Agent chỉ được gán cho các nhóm câu hỏi Speaking.');
        return;
      }
    }

    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        api_endpoint: apiEndpoint.trim(),
        api_key: apiKey.trim(),
        api_type: apiType,
        stt_target: sttTarget,
        target_questions: targetQuestions
      };

      let res;
      if (isEditing) {
        res = await axios.put(`/api/agents/${editingId}`, payload);
      } else {
        res = await axios.post('/api/agents', payload);
      }

      if (res.data.success) {
        showMsg('success', isEditing ? 'Cập nhật Agent thành công!' : 'Tạo Agent mới thành công!');
        setShowModal(false);
        fetchAgents();
      }
    } catch (err) {
      showMsg('error', err.response?.data?.error || err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa Agent này không?')) return;
    try {
      const res = await axios.delete(`/api/agents/${id}`);
      if (res.data.success) {
        showMsg('success', 'Xóa Agent thành công!');
        fetchAgents();
      }
    } catch (err) {
      showMsg('error', err.response?.data?.error || err.message);
    }
  };

  const filteredAgents = agents.filter(agent => {
    const matchesSearch = agent.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (agent.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      agent.api_endpoint.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesType = filterType === 'ALL' || agent.api_type === filterType;
    
    return matchesSearch && matchesType;
  });

  const totalPages = Math.ceil(filteredAgents.length / pageSize);
  const indexOfLastItem = currentPage * pageSize;
  const indexOfFirstItem = indexOfLastItem - pageSize;
  const currentAgents = filteredAgents.slice(indexOfFirstItem, indexOfLastItem);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif' }}>Quản lý AI Agents</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--on-surface-var)' }}>Cấu hình linh hoạt endpoint và key cho từng loại câu hỏi thi.</p>
        </div>
        <button onClick={handleOpenCreate} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span>
          Thêm Agent
        </button>
      </div>

      {/* Agents Table List */}
      <div className="glass-card" style={{ flex: 1, overflowY: 'auto', borderRadius: '16px', display: 'flex', flexDirection: 'column' }}>
        
        {/* Table Card Header (Search & Filter) */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '280px' }}>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: 'var(--on-surface)', fontFamily: 'Lexend, sans-serif', whiteSpace: 'nowrap' }}>Danh sách AI Agents</h2>
            {/* Search bar */}
            <div style={{ position: 'relative', flex: '1', maxWidth: '320px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--on-surface-var)' }}/>
              <input 
                type="text" 
                placeholder="Tìm tên, endpoint, mô tả..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="glass-input" 
                style={{ width: '100%', paddingLeft: '34px', paddingRight: '12px', paddingVertical: '8px', borderRadius: '9999px', boxSizing: 'border-box', fontSize: '12px' }}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <select 
              value={filterType} 
              onChange={(e) => setFilterType(e.target.value)} 
              className="glass-input" 
              style={{ padding: '7px 12px', fontSize: '12px' }}
            >
              <option value="ALL">Tất cả loại Agent</option>
              <option value="Grading">Grading (Chấm điểm)</option>
              <option value="STT">Transcribe (STT)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '64px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <span className="material-symbols-outlined spinner" style={{ fontSize: '32px', color: 'var(--primary)' }}>sync</span>
            <span style={{ fontSize: '14px', color: 'var(--on-surface-var)' }}>Đang tải danh sách Agents...</span>
          </div>
        ) : filteredAgents.length === 0 ? (
          <div style={{ padding: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', opacity: 0.6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: '48px', color: 'var(--on-surface-var)' }}>search</span>
            <span style={{ fontSize: '14px', color: 'var(--on-surface-var)' }}>Không tìm thấy AI Agent nào khớp với bộ lọc.</span>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }}>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Tên Agent</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Loại API</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Endpoint</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Nhóm áp dụng</th>
                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 'bold', color: 'var(--on-surface-var)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right' }}>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {currentAgents.map((agent) => (
                    <tr key={agent.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{ fontSize: '14.5px', fontWeight: 'bold', color: 'var(--on-surface)', display: 'block' }}>{agent.name}</span>
                        {agent.description && <span style={{ fontSize: '11px', color: 'var(--on-surface-var)' }}>{agent.description}</span>}
                      </td>
                      <td style={{ padding: '16px 20px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold',
                          background: agent.api_type === 'STT' ? 'rgba(0, 103, 126, 0.15)' : 'rgba(0, 85, 165, 0.15)',
                          color: agent.api_type === 'STT' ? '#38bdf8' : '#60a5fa'
                        }}>
                          {agent.api_type === 'STT' 
                            ? `Transcribe (STT - ${
                                agent.stt_target === 'question' ? 'Câu hỏi đề bài' : 
                                agent.stt_target === 'context' ? 'Bối cảnh đề bài' : 
                                'Câu trả lời học sinh'
                              })` 
                            : 'Grading (Chấm điểm)'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 20px', fontSize: '13px', fontFamily: 'monospace', color: 'var(--on-surface-var)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {agent.api_endpoint}
                      </td>
                      <td style={{ padding: '16px 20px', maxWidth: '300px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(agent.target_questions || []).map((qKey) => {
                            const allGroup = [...SPEAKING_GROUPS, ...WRITING_GROUPS];
                            const found = allGroup.find(g => g.key === qKey);
                            return (
                              <span key={qKey} style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', color: 'var(--on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} title={found?.label}>
                                {qKey.replace('sp_', 'SP: ').replace('w_', 'WR: ').replace('_', ' ')}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          <button onClick={() => handleOpenEdit(agent)} className="btn-secondary" style={{ padding: '8px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center' }} title="Sửa">
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>edit</span>
                          </button>
                          <button onClick={() => handleDelete(agent.id)} className="btn-secondary" style={{ padding: '8px', borderRadius: '8px', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.1)', display: 'inline-flex', alignItems: 'center' }} title="Xóa">
                            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredAgents.length > 0 && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '12px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                background: 'rgba(255, 255, 255, 0.02)',
                fontSize: '12px',
                color: 'var(--on-surface-var)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span>Hiển thị</span>
                  <select 
                    value={pageSize} 
                    onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }} 
                    className="glass-input" 
                    style={{ margin: '0 8px', padding: '4px 8px', fontSize: '12px' }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={40}>40</option>
                    <option value={100}>100</option>
                  </select>
                  <span style={{ marginLeft: '8px' }}>Trang {currentPage} / {totalPages || 1} (Tổng {filteredAgents.length} Agents)</span>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    disabled={currentPage === 1} 
                    onClick={() => setCurrentPage(currentPage - 1)} 
                    className="btn-secondary" 
                    style={{ padding: '6px 16px', fontSize: '12px' }}
                  >
                    Trước
                  </button>
                  <button 
                    disabled={currentPage >= totalPages} 
                    onClick={() => setCurrentPage(currentPage + 1)} 
                    className="btn-secondary" 
                    style={{ padding: '6px 16px', fontSize: '12px' }}
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* CREATE / EDIT AGENT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: '640px', padding: '28px', boxSizing: 'border-box', overflowY: 'auto', maxHeight: '90vh' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 'bold', color: 'var(--on-surface)' }}>
              {isEditing ? 'Cập nhật AI Agent' : 'Cấu hình Agent mới'}
            </h3>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>TÊN AGENT *</label>
                  <input type="text" placeholder="Ví dụ: Dify Speaking Q1-2..." value={name} onChange={(e) => setName(e.target.value)} className="glass-input" required />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>LOẠI API *</label>
                  <select value={apiType} onChange={(e) => {
                    setApiType(e.target.value);
                    if (e.target.value === 'STT') {
                      // Filter out writing groups if STT selected
                      setTargetQuestions(prev => prev.filter(q => !q.startsWith('w_')));
                    }
                  }} className="glass-input" style={{ padding: '10px' }}>
                    <option value="Grading">Grading (Chấm điểm & STT kết hợp)</option>
                    <option value="STT">Transcribe (STT riêng biệt)</option>
                  </select>
                </div>
              </div>

              {apiType === 'STT' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>ĐỐI TƯỢNG TRANSCRIBE (STT TARGET) *</label>
                  <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--on-surface)' }}>
                      <input 
                        type="radio" 
                        name="sttTarget" 
                        value="student_answer" 
                        checked={sttTarget === 'student_answer'} 
                        onChange={() => setSttTarget('student_answer')} 
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      Câu trả lời học sinh
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--on-surface)' }}>
                      <input 
                        type="radio" 
                        name="sttTarget" 
                        value="question" 
                        checked={sttTarget === 'question'} 
                        onChange={() => setSttTarget('question')} 
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      Câu hỏi đề bài
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--on-surface)' }}>
                      <input 
                        type="radio" 
                        name="sttTarget" 
                        value="context" 
                        checked={sttTarget === 'context'} 
                        onChange={() => setSttTarget('context')} 
                        style={{ accentColor: 'var(--primary)' }}
                      />
                      Bối cảnh đề bài
                    </label>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>MÔ TẢ NGẮN</label>
                <input type="text" placeholder="Nhập mô tả về nhiệm vụ của Agent..." value={description} onChange={(e) => setDescription(e.target.value)} className="glass-input" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>API ENDPOINT *</label>
                <input type="text" placeholder="http://178.105.45.146:8080/v1" value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} className="glass-input" required />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>API KEY *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input type={showApiKey ? 'text' : 'password'} placeholder="app-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="glass-input" style={{ width: '100%', paddingRight: '40px' }} required />
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)} style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-var)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{showApiKey ? 'visibility_off' : 'visibility'}</span>
                  </button>
                </div>
              </div>

              {/* Targets question group */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--on-surface-var)' }}>CHỌN NHÓM CÂU HỎI ÁP DỤNG *</label>
                
                {/* speaking */}
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#22c55e' }}>mic</span>
                    <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#22c55e' }}>Speaking Groups</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {SPEAKING_GROUPS.map((g) => (
                      <label key={g.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--on-surface)' }}>
                        <input type="checkbox" checked={targetQuestions.includes(g.key)} onChange={() => handleToggleQuestion(g.key)} style={{ width: '16px', height: '16px' }} />
                        {g.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* writing (Only show if type is Grading) */}
                {apiType === 'Grading' && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '14px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#3b82f6' }}>edit_note</span>
                      <span style={{ fontSize: '12.5px', fontWeight: 'bold', color: '#3b82f6' }}>Writing Groups</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {WRITING_GROUPS.map((g) => (
                        <label key={g.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--on-surface)' }}>
                          <input type="checkbox" checked={targetQuestions.includes(g.key)} onChange={() => handleToggleQuestion(g.key)} style={{ width: '16px', height: '16px' }} />
                          {g.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary" style={{ padding: '10px 20px' }}>Hủy bỏ</button>
                <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>Lưu cấu hình</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
