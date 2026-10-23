import { useEffect, useMemo, useState } from 'react'
import { getExamAttemptResult } from '../services/publicExamApi'
import { FeaturedCourses } from './ExamListPage'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>

function readJson(key) {
  try { return JSON.parse(window.localStorage.getItem(key) || 'null') } catch { return null }
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(Number(value || 0))
}

function formatDateTime(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function formatDuration(value) {
  const total = Math.max(0, Math.round(Number(value || 0)))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [hours ? `${hours} giờ` : '', minutes ? `${minutes} phút` : '', `${seconds} giây`].filter(Boolean).join(' ')
}

function SectionResult({ section, index }) {
  const listening = /listen/i.test(`${section.sectionTitle} ${section.examMode}`)
  const skillTitle = listening ? 'Kỹ năng Nghe (Listening)' : 'Kỹ năng Đọc (Reading)'
  const accuracy = section.totalQuestions ? section.correctCount / section.totalQuestions * 100 : 0
  return <article className="result-section-card">
    <header>
      <div><i className={listening ? 'listening' : 'reading'}><Icon>{listening ? 'headphones' : 'auto_stories'}</Icon></i><span><small>Phần thi {index + 1}</small><h3>{skillTitle}</h3></span></div>
      <div className="result-section-score"><strong>{formatNumber(section.exactScore)}<small>/ {formatNumber(section.maxPossibleScore)}</small></strong></div>
    </header>
    <div className="result-section-stats"><span><small>Đúng</small><b>{section.correctCount} câu</b></span><span><small>Sai</small><b>{section.incorrectCount} câu</b></span><span><small>Bỏ qua</small><b>{section.unansweredCount} câu</b></span></div>
    <div className="result-parts"><div className="result-parts-heading"><h4>Tiến trình từng Part</h4><b>Tỷ lệ chính xác {formatNumber(accuracy)}%</b></div>{(section.parts || []).map(part => <div className="result-part" key={part.id}>
      <div><span>{part.title}</span><b>{part.correctCount}/{part.totalQuestions} câu ({formatNumber(part.accuracyPercent)}%)</b></div>
      <span><i style={{ width: `${Math.max(0, Math.min(100, part.accuracyPercent))}%` }} /></span>
    </div>)}</div>
  </article>
}

export default function ExamResultPage({ examId, Header, Footer }) {
  const session = useMemo(() => readJson(`exam-result-session:${examId}`), [examId])
  const cached = useMemo(() => readJson(`exam-result:${examId}`), [examId])
  const [result, setResult] = useState(cached)
  const [loading, setLoading] = useState(Boolean(session))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!session?.attemptId || !session?.attemptToken) {
      if (!cached) setError('Không tìm thấy phiên kết quả trên trình duyệt này.')
      setLoading(false)
      return
    }
    let active = true
    getExamAttemptResult(session).then(response => {
      if (!active) return
      setResult(response.data)
      window.localStorage.setItem(`exam-result:${examId}`, JSON.stringify(response.data))
    }).catch(requestError => {
      if (active && !cached) setError(requestError.message)
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [cached, examId, session])

  const retry = () => {
    window.localStorage.removeItem(`exam-result:${examId}`)
    window.localStorage.removeItem(`exam-result-session:${examId}`)
    window.location.href = `/exams/${examId}/structure`
  }

  if (loading && !result) return <div className="result-page-state"><span className="catalog-spinner" /><strong>Đang tổng hợp kết quả...</strong></div>
  if (error && !result) return <div className="result-page-state error"><Icon>error</Icon><strong>{error}</strong><a href={`/exams/${examId}`}>Quay lại đề thi</a></div>

  const total = Number(result?.totalQuestions || 0)
  const answered = Number(result?.answeredCount || 0)
  const totalScore = Number(result?.totalScore || 0)
  const maxScore = Number(result?.maxScore || 0)
  const candidate = result?.candidate || readJson('exam-candidate-profile')
  const scorePercent = maxScore ? Math.max(0, Math.min(100, totalScore / maxScore * 100)) : 0
  const isToefl = result?.exam?.testType === 'TOEFL_IBT'
  const sections = (result?.sections || []).slice().sort((left, right) => {
    if (isToefl) return 0
    const priority = section => /listen/i.test(`${section.sectionTitle} ${section.examMode}`) ? 0 : /read/i.test(`${section.sectionTitle} ${section.examMode}`) ? 1 : 2
    return priority(left) - priority(right)
  })

  return <div className="exam-result-page">
    <Header active="exams" campaignLabel={isToefl ? 'TOEFL iBT Online Test' : 'TOEIC Challenge 2026'} />
    <main className="result-main">
      <nav className="result-breadcrumb"><a href="/">Trang chủ</a><Icon>chevron_right</Icon><a href="/exams">Danh sách đề thi</a><Icon>chevron_right</Icon><span>{result?.exam?.title || 'Đề thi'}</span><Icon>chevron_right</Icon><b>Kết quả làm bài</b></nav>

      <section className="result-hero">
        <div className="result-hero-copy"><div className="result-hero-meta"><span><Icon>check_circle</Icon>Đã hoàn thành</span><small><Icon>timer</Icon>{formatDuration(result?.durationSeconds)}{result?.exam?.allowedDurationSeconds ? ` / ${formatDuration(result.exam.allowedDurationSeconds)}` : ''}</small><small><Icon>event</Icon>{formatDateTime(result?.submittedAt)}</small></div><h1>Chúc mừng bạn <em>{candidate?.fullName || 'Thí sinh'}</em> đã hoàn thành bài thi! 🎉</h1><p>Bạn đã hoàn thành bài thi. Kết quả chi tiết được tổng hợp bên dưới.</p><div className="result-hero-actions"><button type="button" disabled title="Tính năng xem lời giải sẽ được triển khai sau"><Icon>menu_book</Icon>Xem lời giải &amp; phân tích chi tiết</button><button type="button" onClick={retry}><Icon>refresh</Icon>Làm lại bài thi</button></div></div>
        <div className="result-score-showcase"><div className="result-score-gauge" style={{ '--score-progress': `${scorePercent * 3.6}deg` }}><div><strong>{formatNumber(totalScore)}</strong><span>/ {formatNumber(maxScore)} {isToefl ? 'TOEFL iBT' : 'TOEIC'}</span></div></div></div>
      </section>

      <section className="result-quick-stats">
        <article className="correct"><header><span>Số câu đúng</span><i><Icon>check_circle</Icon></i></header><strong>{result?.correctCount}<small>/ {total} câu</small></strong><p>{formatNumber(result?.accuracyPercent)}% chính xác</p></article>
        <article className="wrong"><header><span>Số câu chưa đúng</span><i><Icon>error</Icon></i></header><strong>{result?.incorrectCount}<small>/ {total} câu</small></strong><p>Cần rà soát lại đáp án</p></article>
        <article><header><span>Chưa làm / Bỏ qua</span><i><Icon>fast_forward</Icon></i></header><strong>{result?.unansweredCount}<small>/ {total} câu</small></strong><p>{total ? formatNumber(Number(result?.unansweredCount || 0) / total * 100) : 0}% tổng số câu hỏi</p></article>
        <article className="speed"><header><span>Tốc độ làm bài</span><i><Icon>bolt</Icon></i></header><strong>{result?.averageSecondsPerAnswered == null ? '—' : `${formatNumber(result.averageSecondsPerAnswered)}s`}<small>/ câu</small></strong><p>{answered} câu đã trả lời</p></article>
      </section>

      <section className="result-analysis"><div>{sections.map((section, index) => <SectionResult section={section} index={index} key={section.sectionId} />)}</div></section>
    </main>
    {!isToefl && <div className="result-featured-courses"><FeaturedCourses /></div>}
    <div className="result-after-courses"><section className="result-next-step"><div><Icon>support_agent</Icon><span><strong>Cần tư vấn lộ trình học phù hợp với kết quả?</strong><small>Liên hệ chuyên gia IIG để được hỗ trợ xây dựng kế hoạch ôn luyện.</small></span></div><a href="tel:1900636929">Đăng ký tư vấn miễn phí</a></section></div>
    <Footer />
  </div>
}
