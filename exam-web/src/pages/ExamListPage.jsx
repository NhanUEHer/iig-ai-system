import { useEffect, useState } from 'react'
import { getPublicExamGroups, getPublicExams } from '../services/publicExamApi'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>
const difficultyNames = { BASIC: 'Cơ bản', INTERMEDIATE: 'Trung bình', ADVANCED: 'Nâng cao', EXPERT: 'Chuyên gia' }
const featuredCourses = [
  {
    title: 'TOEIC Compact Online – Tự học Listening & Reading',
    image: '/courses/toeic-compact-online.png',
    badge: 'Lộ trình tự học toàn diện',
    badgeTone: 'orange',
    imageNote: 'Học theo kỹ năng · Video tương tác',
    description: 'Lộ trình tự học TOEIC LR tinh gọn, tập trung chiến thuật xử lý từng dạng bài và cải thiện lỗi sai theo mục tiêu điểm số.',
    benefits: ['Lộ trình 550+ và 700+ theo mục tiêu', 'Bài giảng tương tác cùng bài luyện tập', 'Tài liệu ôn tập và kiểm tra theo chặng'],
    price: 'Từ 1.179.000đ',
    href: 'https://elearning.iigvietnam.com/vi/chuong-trinh-tu-hoc/toeic-compact-online',
  },
  {
    title: 'TOEIC Speaking & Writing Online',
    image: '/courses/toeic-sw-online.jpg',
    badge: 'Chuyên sâu 2 kỹ năng',
    badgeTone: 'blue',
    imageNote: 'Luyện Nói & Viết theo chuẩn TOEIC',
    description: 'Chương trình tự học trực tuyến giúp nắm cấu trúc bài thi, phát triển ý tưởng và luyện phản xạ cho hai kỹ năng Speaking & Writing.',
    benefits: ['Lộ trình theo từng mục tiêu điểm số', 'Video bài giảng ngắn, dễ theo dõi', 'Luyện tập theo tiêu chí bài thi TOEIC'],
    price: 'Liên hệ tư vấn',
    href: 'https://elearning.iigvietnam.com/vi/luyen-thi-toeic',
  },
  {
    title: 'Bộ đề thi thử TOEIC Listening & Reading',
    image: '/courses/toeic-mock-lr.png',
    badge: 'Học liệu chính thống ETS',
    badgeTone: 'navy',
    imageNote: 'Mô phỏng sát định dạng thi thật',
    description: 'Bộ đề thi thử trực tuyến giúp làm quen cấu trúc, áp lực thời gian và nhận kết quả phân tích chi tiết ngay sau khi hoàn thành.',
    benefits: ['Đề thi chính thống từ ETS', '200 câu trong 120 phút', 'Chấm điểm và phân tích Listening & Reading'],
    price: 'Từ 150.000đ',
    href: 'https://elearning.iigvietnam.com/vi/cong-cu-on-thi/bo-de-thi-thu-toeic-lr',
  },
  {
    title: 'Bộ đề thi thử TOEIC Speaking & Writing',
    image: '/courses/toeic-mock-sw.png',
    badge: 'Thi thử Speaking & Writing',
    badgeTone: 'purple',
    imageNote: 'Làm quen quy trình thi 2 kỹ năng',
    description: 'Trải nghiệm bài thi mô phỏng giúp luyện phản xạ Nói, cách triển khai bài Viết và chủ động làm quen với giới hạn thời gian.',
    benefits: ['Mô phỏng định dạng bài thi TOEIC SW', 'Luyện nói, viết theo thời gian thực', 'Phù hợp để đánh giá trước ngày thi'],
    price: 'Từ 275.000đ',
    href: 'https://elearning.iigvietnam.com/vi/cong-cu-on-thi/bo-de-thi-thu-toeic-sw',
  },
]

const formatDuration = seconds => {
  const minutes = Math.max(0, Math.round(Number(seconds || 0) / 60))
  return `${minutes} phút`
}
const formatCount = value => new Intl.NumberFormat('vi-VN').format(Number(value || 0))

const getCatalogPageSize = () => {
  if (window.matchMedia('(max-width: 760px)').matches) return 5
  if (window.matchMedia('(max-width: 1100px)').matches) return 6
  return 50
}

function ExamCard({ exam }) {
  const imageUrl = exam.image?.url || ''
  const groupLine = exam.groups?.map(group => group.name).join(' · ') || 'Đề thi TOEIC'
  return <article className="catalog-card">
    <div className="catalog-card-image" style={{ backgroundImage: `url(${imageUrl})` }}>
      <div className="catalog-card-shade" />
      <span className={`catalog-label difficulty-${exam.difficulty?.toLowerCase()}`}><Icon>workspace_premium</Icon>{exam.label || difficultyNames[exam.difficulty] || 'Đề luyện tập'}</span>
      <div className="catalog-card-title"><span>{groupLine}</span><h2>{exam.title}</h2></div>
    </div>
    <div className="catalog-card-body">
      <div className="catalog-metrics">
        <span><Icon>timer</Icon><small>Thời lượng:<strong>{formatDuration(exam.durationSeconds)}</strong></small></span>
        <span><Icon>quiz</Icon><small>Số câu:<strong>{formatCount(exam.questionCount)} câu</strong></small></span>
        <span><Icon>groups</Icon><small>Lượt thi:<strong>{formatCount(exam.popularityCount)}</strong></small></span>
        <span><Icon>signal_cellular_alt</Icon><small>Độ khó:<strong>{difficultyNames[exam.difficulty] || 'Đang cập nhật'}</strong></small></span>
      </div>
      <div className="catalog-card-actions">
        <a href={`/exams/${exam.id}`}><span>Vào thi ngay</span><Icon>play_arrow</Icon></a>
        <button type="button" aria-label={`Xem thông tin ${exam.title}`} title="Xem thông tin đề thi"><Icon>info</Icon></button>
      </div>
    </div>
  </article>
}

export function FeaturedCourses() {
  return <section className="featured-courses">
    <div className="container">
      <header className="courses-heading">
        <div><h2>Chương trình TOEIC nổi bật</h2><p>Khám phá lộ trình tự học và bộ đề thi thử chính thống cho cả bốn kỹ năng TOEIC.</p></div>
        <a className="desktop-course-link" href="https://elearning.iigvietnam.com/vi/luyen-thi-toeic" target="_blank" rel="noreferrer">Xem tất cả khóa học <Icon>arrow_forward</Icon></a>
      </header>
      <div className="course-grid">
        {featuredCourses.map(course => <article className="course-card" key={course.title}>
          <div className="course-image"><img src={course.image} alt={course.title} /><i /><span className={`course-badge ${course.badgeTone}`}>{course.badge}</span><strong><Icon>verified</Icon>{course.imageNote}</strong></div>
          <div className="course-body"><h3>{course.title}</h3><p>{course.description}</p><ul>{course.benefits.map(item => <li key={item}><Icon>check_circle</Icon>{item}</li>)}</ul><div className="course-price">{course.price}</div><a href={course.href} target="_blank" rel="noreferrer">Xem chương trình <Icon>arrow_forward</Icon></a></div>
        </article>)}
      </div>
      <a className="mobile-course-link" href="https://elearning.iigvietnam.com/vi/luyen-thi-toeic" target="_blank" rel="noreferrer">Xem tất cả khóa học <Icon>arrow_forward</Icon></a>
    </div>
  </section>
}

function ExamListPage({ Header, Footer }) {
  const [groups, setGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(getCatalogPageSize)
  const [catalog, setCatalog] = useState({ data: [], meta: { total: 0, totalPages: 1 } })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getPublicExamGroups().then(result => setGroups(result.data || [])).catch(() => setGroups([]))
  }, [])
  useEffect(() => {
    const desktopQuery = window.matchMedia('(max-width: 1100px)')
    const mobileQuery = window.matchMedia('(max-width: 760px)')
    const updatePageSize = () => setPageSize(getCatalogPageSize())
    desktopQuery.addEventListener('change', updatePageSize)
    mobileQuery.addEventListener('change', updatePageSize)
    return () => {
      desktopQuery.removeEventListener('change', updatePageSize)
      mobileQuery.removeEventListener('change', updatePageSize)
    }
  }, [])
  useEffect(() => setPage(1), [pageSize])
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1)
      setSearch(searchInput.trim())
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchInput])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    getPublicExams({ page, limit: pageSize, search, groupIds: selectedGroup, difficulties: difficulty })
      .then(result => { if (active) setCatalog({ data: result.data || [], meta: result.meta || { total: 0, totalPages: 1 } }) })
      .catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, pageSize, search, selectedGroup, difficulty])

  const selectGroup = id => {
    setPage(1)
    setSelectedGroup(id)
  }
  const selectDifficulty = value => {
    setPage(1)
    setDifficulty(value)
  }
  const changePage = nextPage => {
    setPage(nextPage)
    window.requestAnimationFrame(() => document.getElementById('exam-catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return <>
    <Header active="exams" />
    <main className="catalog-page">
      <section className="catalog-hero">
        <div className="catalog-glow catalog-glow-one" /><div className="catalog-glow catalog-glow-two" />
        <div className="container catalog-hero-inner">
          <div>
            <span className="catalog-kicker"><Icon>verified</Icon>Đề thi theo định dạng TOEIC</span>
            <h1>Chọn đề thi phù hợp với mục tiêu của bạn</h1>
            <p>Luyện tập với hệ thống đề thi được xây dựng theo từng kỹ năng và mức độ, giúp bạn chủ động đánh giá năng lực và cải thiện kết quả.</p>
          </div>
          <aside className="catalog-summary">
            <span><Icon>library_books</Icon><small>Đề thi hiện có<strong>{catalog.meta.total || 0} đề thi</strong></small></span>
            <span><Icon>category</Icon><small>Nhóm luyện tập<strong>{groups.length} nhóm đề</strong></small></span>
            <div><p>Chọn nhóm đề hoặc độ khó để tìm bài thi phù hợp nhất.</p><i><b /></i></div>
          </aside>
        </div>
      </section>

      <section className="catalog-content container" id="exam-catalog">
        <div className="catalog-toolbar">
          <div className="catalog-tabs" aria-label="Nhóm đề thi">
            <button className={!selectedGroup ? 'active' : ''} onClick={() => selectGroup('')}><Icon>dataset</Icon>Tất cả bài thi ({catalog.meta.total || 0})</button>
            {groups.map(group => <button className={selectedGroup === group.id ? 'active' : ''} onClick={() => selectGroup(group.id)} key={group.id}>{group.name} ({group.examCount})</button>)}
          </div>
          <div className="catalog-filters">
            <label><Icon>search</Icon><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Tìm kiếm tên đề thi..." /></label>
            <label className="catalog-select"><select value={difficulty} onChange={event => selectDifficulty(event.target.value)}><option value="">Mọi độ khó</option><option value="BASIC">Cơ bản</option><option value="INTERMEDIATE">Trung bình</option><option value="ADVANCED">Nâng cao</option><option value="EXPERT">Chuyên gia</option></select><Icon>expand_more</Icon></label>
          </div>
        </div>

        {loading && <div className="catalog-state"><span className="catalog-spinner" /><strong>Đang tải danh sách đề thi...</strong></div>}
        {!loading && error && <div className="catalog-state error"><Icon>error</Icon><strong>{error}</strong><button onClick={() => window.location.reload()}>Thử lại</button></div>}
        {!loading && !error && !catalog.data.length && <div className="catalog-state"><Icon>search_off</Icon><strong>Không tìm thấy đề thi phù hợp</strong><span>Hãy thử thay đổi nhóm đề, độ khó hoặc từ khóa.</span></div>}
        {!loading && !error && !!catalog.data.length && <div className="catalog-grid">{catalog.data.map(exam => <ExamCard exam={exam} key={exam.id} />)}</div>}
        {!loading && !error && catalog.meta.totalPages > 1 && <nav className="catalog-pagination" aria-label="Phân trang danh sách đề thi">
          <button type="button" className="pagination-direction" onClick={() => changePage(page - 1)} disabled={page <= 1}><Icon>chevron_left</Icon><span>Trước</span></button>
          <span className="pagination-status" aria-live="polite">Trang <strong>{page}</strong> / {catalog.meta.totalPages}</span>
          <button type="button" className="pagination-direction" onClick={() => changePage(page + 1)} disabled={page >= catalog.meta.totalPages}><span>Sau</span><Icon>chevron_right</Icon></button>
        </nav>}

      </section>
      <FeaturedCourses />
    </main>
    <Footer />
  </>
}

export default ExamListPage
