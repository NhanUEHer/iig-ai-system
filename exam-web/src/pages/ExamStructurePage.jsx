import { useEffect, useState } from 'react'
import { getPublicExamDetail, startExamAttempt } from '../services/publicExamApi'
import { getExamBrowserSessionId } from '../services/examAttemptTabLock'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>
const formatMinutes = seconds => `${Math.max(1, Math.round(Number(seconds || 0) / 60))} phút`
const sectionIcon = mode => mode === 'WRITING_NON_STOP' ? 'edit_note' : mode === 'RECORD_NON_STOP' ? 'graphic_eq' : mode === 'NON_STOP' ? 'headphones' : 'menu_book'
const sectionTone = mode => ({ NON_STOP: 'listening', FREESTYLE: 'reading', RECORD_NON_STOP: 'speaking', WRITING_NON_STOP: 'writing' }[mode] || 'default')

function ExamStructurePage({ examId }) {
  const [exam, setExam] = useState(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [deviceConflict, setDeviceConflict] = useState(false)

  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    getPublicExamDetail(examId)
      .then(result => { if (active) setExam(result.data) })
      .catch(requestError => { if (active) setError(requestError.message) })
    return () => { active = false }
  }, [examId])

  const hasSpeaking = exam?.examType === 'SPEAKING' || exam?.examType === 'SPEAKING_WRITING' || exam?.sections?.some(section => section.examMode === 'RECORD_NON_STOP')
  const partOffsets = exam?.sections?.map((_, sectionIndex, sections) => sections.slice(0, sectionIndex).reduce((total, section) => total + Math.max(1, section.parts?.length || 0), 0)) || []

  const startAttempt = async () => {
    if (!exam || starting) return
    const candidate = JSON.parse(window.localStorage.getItem(`exam-candidate:${examId}`) || 'null')
    if (!candidate?.candidateToken) {
      window.location.href = `/exams/${examId}`
      return
    }
    setStarting(true)
    setError('')
    try {
      const result = await startExamAttempt({
        examId,
        candidateToken: candidate.candidateToken,
        audioConfirmed: true,
        clientSessionId: getExamBrowserSessionId(),
      })
      window.localStorage.setItem(`exam-attempt:${examId}`, JSON.stringify({
        examId,
        attemptId: result.data.attemptId,
        attemptToken: result.data.attemptToken,
        expiresAt: result.data.expiresAt,
      }))
      window.location.href = `/exams/${examId}/test`
    } catch (requestError) {
      if (requestError.code === 'ATTEMPT_ACTIVE_ON_ANOTHER_DEVICE') {
        setDeviceConflict(true)
        setStarting(false)
        return
      }
      setError(requestError.message)
      setStarting(false)
    }
  }

  return <div className="test-rules-page exam-structure-page">
    <header className="test-header">
      <div className="test-header-inner">
        <a href={`/exams/${examId}`} aria-label="Quay lại chi tiết đề thi"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
        <strong>ONLINE TEST SYSTEM</strong>
        <span aria-hidden="true"><Icon>verified_user</Icon></span>
      </div>
    </header>

    <main className="exam-structure-main">
      <section className="exam-structure-card">
        <header className="exam-structure-heading">
          <div><h1>Cấu trúc đề thi</h1></div>
          <span><Icon>assignment</Icon></span>
        </header>

        <div className="exam-structure-content">
          {!exam && !error && <div className="structure-state"><span className="catalog-spinner" /><strong>Đang tải cấu trúc đề thi...</strong></div>}
          {error && <div className="structure-state error"><Icon>error</Icon><strong>{error}</strong></div>}
          {exam && <>
            <h2>{exam.title}</h2>
            <div className="structure-sections">
              {exam.sections.map((section, sectionIndex) => <article className={`structure-section structure-${sectionTone(section.examMode)}`} key={section.id}>
                <header>
                  <span><Icon>{sectionIcon(section.examMode)}</Icon>{section.title}</span>
                  <strong>{formatMinutes(section.durationSeconds)}</strong>
                </header>
                <div className="structure-parts">
                  {section.parts?.length ? section.parts.map((part, partIndex) => <div key={part.id}>
                    <b>{partOffsets[sectionIndex] + partIndex + 1}</b>
                    <span><strong>{part.title || `Phần ${partIndex + 1}`}</strong></span>
                    <em>{part.questionCount} câu hỏi</em>
                  </div>) : <div>
                    <b>{sectionIndex + 1}</b>
                    <span><strong>{section.title}</strong></span>
                    <em>{section.questionCount} câu hỏi</em>
                  </div>}
                </div>
                <footer>Tổng: {section.questionCount} câu hỏi</footer>
              </article>)}
            </div>
          </>}
        </div>

        <footer className="exam-structure-footer">
          <a href={`/exams/${examId}/${hasSpeaking ? 'record-test' : 'sound-test'}`}><Icon>arrow_back</Icon>Quay lại</a>
          <button className="primary" type="button" disabled={!exam || starting} onClick={startAttempt}>{starting ? 'Đang bắt đầu...' : 'Bắt đầu thi'} <Icon>arrow_forward</Icon></button>
        </footer>
      </section>
    </main>
    {deviceConflict && <div className="exam-timeout-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="device-conflict-title">
      <section className="exam-timeout-dialog exam-device-conflict-dialog">
        <span><Icon>devices</Icon></span>
        <h2 id="device-conflict-title">Bài thi đang mở ở thiết bị khác</h2>
        <p>Tài khoản này đang làm đúng đề thi trên một trình duyệt hoặc thiết bị khác. Vui lòng quay lại phiên đang mở để tiếp tục, tránh xung đột và mất đáp án.</p>
        <a href="/exams">Quay về danh sách đề thi</a>
      </section>
    </div>}
  </div>
}

export default ExamStructurePage
