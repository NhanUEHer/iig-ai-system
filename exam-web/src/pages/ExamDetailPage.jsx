import { useEffect, useMemo, useState } from 'react'
import { getPublicExamDetail, registerExamCandidate } from '../services/publicExamApi'
import { FeaturedCourses } from './ExamListPage'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>
const ranking = [
  { rank: 1, initials: 'MA', name: 'Trần Minh Anh', duration: '89 phút', score: 945 },
  { rank: 2, initials: 'TH', name: 'Nguyễn Tuấn Hùng', duration: '104 phút', score: 920 },
  { rank: 3, initials: 'VT', name: 'Vũ Thị Tuyết', duration: '112 phút', score: 895 },
  { rank: 4, initials: 'BL', name: 'Đỗ Bảo Long', duration: '98 phút', score: 880 },
  { rank: 5, initials: 'DL', name: 'Phạm Diệu Linh', duration: '101 phút', score: 875 },
]

const sectionLetter = title => ({ listening: 'L', reading: 'R', speaking: 'S', writing: 'W' }[String(title || '').toLowerCase()] || String(title || 'P').slice(0, 1).toUpperCase())
const formatMinutes = seconds => `${Math.max(1, Math.round(Number(seconds || 0) / 60))} phút`

function RichIntroduction({ html }) {
  const safeHtml = useMemo(() => {
    if (!html) return ''
    const documentNode = new DOMParser().parseFromString(html, 'text/html')
    documentNode.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove())
    documentNode.querySelectorAll('*').forEach(node => [...node.attributes].forEach(attribute => {
      if (attribute.name.startsWith('on') || attribute.name === 'style') node.removeAttribute(attribute.name)
    }))
    return documentNode.body.innerHTML
  }, [html])
  return <div className="detail-rich-text" dangerouslySetInnerHTML={{ __html: safeHtml }} />
}

function DetailCard({ icon, title, children, className = '' }) {
  return <section className={`detail-card ${className}`}>
    <header className="detail-card-heading"><span><Icon>{icon}</Icon></span><h2>{title}</h2></header>
    {children}
  </section>
}

function Structure({ exam }) {
  return <DetailCard icon="format_list_bulleted" title="Cấu trúc đề thi chi tiết" className="structure-card">
    <div className="detail-section-grid">
      {exam.sections.map((section, index) => <article className={`detail-section-card section-tone-${index + 1}`} key={section.id}>
        <div className="detail-section-title"><span className={index % 2 ? 'secondary' : ''}>{sectionLetter(section.title)}</span><div><small>Phần {String(index + 1).padStart(2, '0')}</small><h3>{section.title}</h3></div></div>
        <dl>
          <div><dt><Icon>schedule</Icon><span>Thời gian</span></dt><dd>{formatMinutes(section.durationSeconds)}</dd></div>
          <div><dt><Icon>quiz</Icon><span>Số lượng</span></dt><dd>{section.questionCount} câu hỏi</dd></div>
        </dl>
      </article>)}
    </div>
    <div className="detail-summary"><span><Icon>info</Icon><span><small>Tổng quan</small>Tổng cấu trúc bài thi</span></span><strong><span><Icon>quiz</Icon>{exam.questionCount} câu hỏi</span><i /><span><Icon>schedule</Icon>{formatMinutes(exam.durationSeconds)}</span></strong></div>
  </DetailCard>
}

function Guidelines({ exam }) {
  const isSW = exam.examType === 'SPEAKING_WRITING'
  const steps = [
    ['headphones', 'Thiết bị & Kiểm tra âm thanh', isSW ? 'Kiểm tra tai nghe, micro và quyền ghi âm trước khi bắt đầu làm bài.' : 'Đeo tai nghe và kiểm tra âm lượng rõ ràng trước khi bắt đầu làm bài.'],
    ['edit_note', 'Giao diện làm bài & Công cụ', 'Làm quen với thanh điều hướng câu hỏi và các công cụ hỗ trợ trong quá trình làm bài.'],
    ['timer', 'Đồng hồ & Nộp bài tự động', 'Theo dõi thời gian của từng phần; hệ thống tự động lưu và nộp bài khi hết giờ.'],
    ['insights', 'Kết quả & Phân tích bài thi', 'Xem kết quả sau khi hoàn thành để nhận diện nội dung cần tiếp tục cải thiện.'],
  ]
  return <DetailCard icon="verified_user" title="Quy chuẩn & Hướng dẫn làm bài thi" className="guideline-card">
    <a className="detail-rules-link" href="/#rules">Xem quy định đầy đủ <Icon>arrow_forward</Icon></a>
    <div className="guideline-list">{steps.map((step, index) => <article key={step[1]}>
      <span className="step-number">{String(index + 1).padStart(2, '0')}</span><span className="step-icon"><Icon>{step[0]}</Icon></span>
      <div><h3>{step[1]}</h3><p>{step[2]}</p></div>
    </article>)}</div>
    <div className="audio-check"><button type="button" aria-label="Phát âm thanh kiểm tra"><Icon>play_arrow</Icon></button><div><strong>Kiểm tra loa / tai nghe trước khi thi</strong><span className="audio-wave"><i /><i /><i /><i /><i /><i /><i /><i /><small>0:00 / 0:10</small></span></div></div>
  </DetailCard>
}

function HallOfFame({ isSW }) {
  const max = isSW ? 400 : 990
  const currentScore = isSW ? 250 : 550
  const targetScore = isSW ? 300 : 650
  const progress = Math.round((currentScore / targetScore) * 1000) / 10
  return <aside className="detail-sidebar">
    <section className="hall-card">
      <header><span className="hall-icon"><Icon>workspace_premium</Icon></span><div><h2>Bảng Vinh Danh</h2></div></header>
      <div className="ranking-list">{ranking.map((item, index) => {
        const score = isSW ? [390, 375, 360, 350, 345][index] : item.score
        return <article key={item.rank}><span className={`rank-avatar rank-${item.rank}`}>{item.initials}<i>{item.rank}</i></span><div><h3>{item.name}</h3><p><Icon>schedule</Icon>{item.duration}<i /><span className={item.rank <= 3 ? 'complete' : ''}>{item.rank <= 3 ? '100% hoàn thành' : '100%'}</span></p></div><strong>{score}<small>/{max}</small></strong></article>
      })}</div>
      <section className="current-ranking">
        <header><div><small>Thứ hạng của bạn</small><strong>#156</strong></div><em>{currentScore}<small>/{max}</small></em></header>
        <div className="ranking-progress"><span>Mục tiêu {targetScore}+ {isSW ? 'S&W' : 'L&R'}</span><strong>Cần thêm {targetScore - currentScore} điểm</strong><i><b style={{ width: `${progress}%` }} /></i></div>
      </section>
    </section>
    <section className="tip-card"><header><Icon>tips_and_updates</Icon><h2>Bí quyết bứt phá mục tiêu 650+</h2></header><ul><li><Icon>check_circle</Icon><span>Phân bổ thời gian: 45 phút nghe và tối đa 75 phút đọc để không bỏ sót câu hỏi.</span></li><li><Icon>check_circle</Icon><span>Đọc kỹ yêu cầu, xác định từ khóa trước khi lựa chọn đáp án.</span></li><li><Icon>check_circle</Icon><span>Hoàn thành toàn bộ câu hỏi trước khi nộp bài.</span></li></ul><a href="#courses"><Icon>school</Icon>Khám phá khóa học IIG</a></section>
  </aside>
}

function ExamDetailPage({ examId, Header, Footer }) {
  const [exam, setExam] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entering, setEntering] = useState(false)
  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    getPublicExamDetail(examId).then(result => { if (active) setExam(result.data) }).catch(err => { if (active) setError(err.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [examId])

  const enterExam = async () => {
    let profile = null
    try { profile = JSON.parse(window.localStorage.getItem('exam-candidate-profile') || 'null') } catch { profile = null }
    if (!profile?.email || !profile?.phone || !profile?.fullName) {
      window.location.href = `/?registerExam=${encodeURIComponent(examId)}#registration`
      return
    }
    setEntering(true)
    try {
      const result = await registerExamCandidate({ examId, candidate: { ...profile, privacyConsent: true } })
      window.localStorage.setItem(`exam-candidate:${examId}`, JSON.stringify({
        examId,
        candidateId: result.data.candidate.id,
        candidateToken: result.data.candidateToken,
      }))
      window.location.href = `/exams/${examId}/rules`
    } catch (requestError) {
      setError(requestError.message)
      setEntering(false)
    }
  }

  if (loading) return <><Header active="exams" /><main className="detail-page"><div className="detail-state"><span className="catalog-spinner" /><strong>Đang tải thông tin đề thi...</strong></div></main><Footer /></>
  if (error || !exam) return <><Header active="exams" /><main className="detail-page"><div className="detail-state error"><Icon>error</Icon><strong>{error || 'Không tìm thấy đề thi.'}</strong><a href="/exams">Quay lại danh sách đề thi</a></div></main><Footer /></>

  return <>
    <Header active="exams" />
    <main className="detail-page">
      <div className="detail-container">
        <nav className="detail-breadcrumb" aria-label="Breadcrumb"><a href="/"><Icon>home</Icon>Trang chủ</a><Icon>chevron_right</Icon><a href="/exams">Danh sách đề thi</a><Icon>chevron_right</Icon><span>{exam.title}</span></nav>
        <section className="detail-hero">
          <div className="detail-hero-image" style={{ backgroundImage: 'url(/courses/toeic-mock-lr.png)' }} />
          <div className="detail-hero-image-shade" />
          <i className="detail-hero-glow" />
          <div><h1>{exam.title}</h1><p>{exam.description}</p></div>
          <button type="button" className="detail-enter-button" disabled={entering} onClick={enterExam}>{entering ? 'Đang chuẩn bị...' : 'Vào thi ngay'} <Icon>arrow_forward</Icon></button>
        </section>
        <div className="detail-layout">
          <div className="detail-main-column">
            <DetailCard icon="article" title="Giới thiệu đề thi"><RichIntroduction html={exam.introductionHtml} /></DetailCard>
            <Structure exam={exam} />
            <div id="exam-guidelines"><Guidelines exam={exam} /></div>
          </div>
          <HallOfFame isSW={exam.examType === 'SPEAKING_WRITING'} />
        </div>
      </div>
      <div id="courses" className="detail-courses"><FeaturedCourses /></div>
    </main>
    <Footer />
  </>
}

export default ExamDetailPage
