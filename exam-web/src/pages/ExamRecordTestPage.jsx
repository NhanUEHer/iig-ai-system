import { useEffect, useRef, useState } from 'react'
import { getPublicExamDetail } from '../services/publicExamApi'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>

function ExamRecordTestPage({ examId }) {
  const [examTitle, setExamTitle] = useState('Bài thi TOEIC trực tuyến')
  const [permission, setPermission] = useState('idle')
  const [recording, setRecording] = useState(false)
  const [recordUrl, setRecordUrl] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const [playbackTime, setPlaybackTime] = useState(0)
  const [playbackDuration, setPlaybackDuration] = useState(15)
  const [playingBack, setPlayingBack] = useState(false)
  const [error, setError] = useState('')
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const recordUrlRef = useRef('')
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const autoStopRef = useRef(null)
  const playbackRef = useRef(null)

  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    getPublicExamDetail(examId).then(result => {
      if (active && result.data?.title) setExamTitle(result.data.title)
    }).catch(() => {})
    return () => {
      active = false
      window.clearInterval(timerRef.current)
      window.clearTimeout(autoStopRef.current)
      streamRef.current?.getTracks().forEach(track => track.stop())
      if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current)
    }
  }, [examId])

  const releaseMicrophone = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  const requestMicrophone = async () => {
    setError('')
    setPermission('requesting')
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setPermission('unsupported')
      setError('Trình duyệt này chưa hỗ trợ thu âm. Vui lòng dùng phiên bản Chrome, Edge hoặc Safari mới nhất.')
      return null
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      setPermission('granted')
      return stream
    } catch (requestError) {
      setPermission('denied')
      setError(requestError?.name === 'NotAllowedError'
        ? 'Bạn chưa cấp quyền sử dụng microphone. Hãy cho phép quyền microphone trong cài đặt trình duyệt rồi thử lại.'
        : 'Không thể kết nối microphone. Hãy kiểm tra thiết bị đầu vào rồi thử lại.')
      return null
    }
  }

  const startRecording = async () => {
    const stream = streamRef.current || await requestMicrophone()
    if (!stream) return
    if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current)
    recordUrlRef.current = ''
    setRecordUrl('')
    setElapsed(0)
    chunksRef.current = []
    const recorder = new MediaRecorder(stream)
    recorderRef.current = recorder
    recorder.ondataavailable = event => { if (event.data.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      window.clearInterval(timerRef.current)
      window.clearTimeout(autoStopRef.current)
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
      const nextUrl = URL.createObjectURL(blob)
      recordUrlRef.current = nextUrl
      setRecordUrl(nextUrl)
      setRecording(false)
      releaseMicrophone()
    }
    recorder.start()
    setRecording(true)
    timerRef.current = window.setInterval(() => setElapsed(value => Math.min(15, value + 1)), 1000)
    autoStopRef.current = window.setTimeout(() => {
      if (recorder.state === 'recording') {
        setElapsed(15)
        recorder.stop()
      }
    }, 15000)
  }

  const stopRecording = () => {
    window.clearInterval(timerRef.current)
    window.clearTimeout(autoStopRef.current)
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  const retry = () => {
    playbackRef.current?.pause()
    if (recordUrlRef.current) URL.revokeObjectURL(recordUrlRef.current)
    recordUrlRef.current = ''
    setRecordUrl('')
    setElapsed(0)
    setPlaybackTime(0)
    setPlayingBack(false)
  }

  const togglePlayback = async () => {
    const audio = playbackRef.current
    if (!audio) return
    if (!audio.paused) {
      audio.pause()
      setPlayingBack(false)
      return
    }
    try {
      await audio.play()
      setPlayingBack(true)
    } catch {
      setPlayingBack(false)
    }
  }

  const formatTime = value => `00:${String(Math.max(0, Math.floor(value || 0))).padStart(2, '0')}`

  return <div className="test-rules-page record-test-page">
    <header className="test-header">
      <div className="test-header-inner">
        <a href={`/exams/${examId}`} aria-label="Quay lại chi tiết đề thi"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
        <strong>ONLINE TEST SYSTEM</strong>
        <span aria-hidden="true"><Icon>verified_user</Icon></span>
      </div>
    </header>

    <main className="record-test-main">
      <section className="record-test-card">
        <header className="record-test-heading">
          <div><small>{examTitle}</small><h1>Kiểm tra thu âm</h1></div>
          <span><Icon>mic</Icon></span>
        </header>

        <div className="record-test-content">
          <div className="record-test-copy">
            <span><Icon>record_voice_over</Icon></span>
            <div><h2>Thử microphone trước khi vào thi</h2><p>Nhấn bắt đầu, đọc đoạn văn mẫu và nghe lại để đảm bảo giọng nói rõ ràng. Bản thu sẽ tự dừng sau 15 giây.</p></div>
          </div>

          <blockquote>“Teamwork is critical to the success of any organization. By working together, we can leverage our strengths, share ideas, and accomplish tasks more efficiently.”</blockquote>

          <div className={`record-panel ${recording ? 'recording' : ''}`}>
            {!recordUrl ? <>
              {recording ? <div className="recording-state">
                <span className="record-wave" aria-hidden="true">{Array.from({ length: 17 }, (_, index) => <i key={index} />)}</span>
                <strong>{formatTime(15 - elapsed)}</strong>
                <small>Đang thu âm</small>
                <button type="button" onClick={stopRecording} aria-label="Dừng thu âm"><Icon>stop</Icon><span>Dừng</span></button>
              </div> : <div className="record-idle-state">
                <button type="button" onClick={startRecording} aria-label="Bắt đầu thu âm"><Icon>mic</Icon></button>
                <strong>{permission === 'denied' ? 'Thử lại microphone' : 'Bắt đầu thu âm'}</strong>
                <small>Nhấn vào biểu tượng để bắt đầu</small>
              </div>}
            </> : <>
              <audio ref={playbackRef} src={recordUrl} preload="metadata"
                onLoadedMetadata={event => setPlaybackDuration(Number.isFinite(event.currentTarget.duration) ? Math.min(15, event.currentTarget.duration) : elapsed)}
                onTimeUpdate={event => setPlaybackTime(event.currentTarget.currentTime)}
                onEnded={() => setPlayingBack(false)} />
              <div className="record-player">
                <button className="record-player-toggle" type="button" onClick={togglePlayback} aria-label={playingBack ? 'Tạm dừng' : 'Phát bản thu'}><Icon>{playingBack ? 'pause' : 'play_arrow'}</Icon></button>
                <span>{formatTime(playbackTime)}</span>
                <input type="range" min="0" max={playbackDuration || 15} step="0.01" value={Math.min(playbackTime, playbackDuration || 15)} aria-label="Vị trí phát bản thu" onChange={event => {
                  const nextTime = Number(event.target.value)
                  if (playbackRef.current) playbackRef.current.currentTime = nextTime
                  setPlaybackTime(nextTime)
                }} style={{ '--record-progress': `${Math.min(100, playbackTime / (playbackDuration || 15) * 100)}%` }} />
                <span>{formatTime(playbackDuration)}</span>
                <Icon>volume_up</Icon>
              </div>
              <button className="retry" type="button" onClick={retry}><Icon>refresh</Icon>Thu lại</button>
            </>}
          </div>

          {error && <aside className="record-error"><Icon>error</Icon><span>{error}</span></aside>}
        </div>

        <footer className="sound-test-footer">
          <a href={`/exams/${examId}/sound-test`}><Icon>arrow_back</Icon>Quay lại</a>
          <a className={`primary ${!recordUrl ? 'disabled' : ''}`} aria-disabled={!recordUrl} href={recordUrl ? `/exams/${examId}/structure` : undefined}>Tiếp tục <Icon>arrow_forward</Icon></a>
        </footer>
      </section>
    </main>
  </div>
}

export default ExamRecordTestPage
