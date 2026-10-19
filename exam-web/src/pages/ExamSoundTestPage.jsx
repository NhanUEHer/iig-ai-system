import { useEffect, useRef, useState } from 'react'
import { getPublicExamDetail } from '../services/publicExamApi'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>

function ExamSoundTestPage({ examId }) {
  const [examTitle, setExamTitle] = useState('Bài thi TOEIC trực tuyến')
  const [requiresRecording, setRequiresRecording] = useState(false)
  const [volume, setVolume] = useState(55)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    getPublicExamDetail(examId).then(result => {
      if (!active) return
      const exam = result.data
      if (exam?.title) setExamTitle(exam.title)
      setRequiresRecording(
        ['SPEAKING', 'SPEAKING_WRITING'].includes(exam?.examType)
        || exam?.sections?.some(section => section.examMode === 'RECORD_NON_STOP'),
      )
    }).catch(() => {})
    return () => {
      active = false
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.currentTime = 0
      }
    }
  }, [examId])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100
  }, [volume])

  const stopSound = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setPlaying(false)
  }

  const toggleSound = async () => {
    if (playing) return stopSound()
    if (!audioRef.current) {
      const audio = new Audio('/audio/sound-test.mp3')
      audio.preload = 'auto'
      audio.addEventListener('ended', () => setPlaying(false))
      audioRef.current = audio
    }
    audioRef.current.volume = volume / 100
    try {
      await audioRef.current.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }

  return <div className="test-rules-page sound-test-page">
    <header className="test-header">
      <div className="test-header-inner">
        <a href={`/exams/${examId}`} aria-label="Quay lại chi tiết đề thi"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
        <strong>ONLINE TEST SYSTEM</strong>
        <span aria-hidden="true"><Icon>verified_user</Icon></span>
      </div>
    </header>

    <main className="sound-test-main">
      <section className="sound-test-card">
        <header className="sound-test-heading">
          <div><small>{examTitle}</small><h1>Kiểm tra âm thanh</h1></div>
          <span><Icon>headphones</Icon></span>
        </header>

        <div className="sound-test-content">
          <div className="sound-test-copy">
            <span><Icon>volume_up</Icon></span>
            <div><h2>Đảm bảo bạn nghe rõ âm thanh</h2><p>Nhấn phát để nghe âm thanh thử, sau đó điều chỉnh âm lượng đến mức phù hợp. Hãy kiểm tra tai nghe và thiết bị đầu ra nếu không nghe thấy.</p></div>
          </div>

          <button className={`sound-play-button ${playing ? 'playing' : ''}`} type="button" onClick={toggleSound}>
            <span><Icon>{playing ? 'stop' : 'play_arrow'}</Icon></span>
            <div><strong>{playing ? 'Dừng âm thanh thử' : 'Phát âm thanh thử'}</strong><small>{playing ? 'Âm thanh đang phát' : 'Bản ghi kiểm tra kéo dài khoảng 19 giây'}</small></div>
            <span className="sound-bars" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</span>
          </button>

          <label className="sound-volume-control">
            <span><Icon>volume_down</Icon></span>
            <input aria-label="Âm lượng" type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} style={{ '--sound-volume': `${volume}%` }} />
            <span><Icon>volume_up</Icon></span>
            <output>{volume}%</output>
          </label>

          <aside><Icon>info</Icon><span>Nếu không nghe thấy âm thanh, hãy kiểm tra thiết bị đầu ra, quyền phát âm thanh của trình duyệt hoặc thử kết nối lại tai nghe.</span></aside>
        </div>

        <footer className="sound-test-footer">
          <a href={`/exams/${examId}/instructions`}><Icon>arrow_back</Icon>Quay lại</a>
          <a className="primary" href={`/exams/${examId}/${requiresRecording ? 'record-test' : 'structure'}`}>Tiếp tục <Icon>arrow_forward</Icon></a>
        </footer>
      </section>
    </main>
  </div>
}

export default ExamSoundTestPage
