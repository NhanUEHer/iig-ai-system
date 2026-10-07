import { useEffect, useMemo, useRef, useState } from 'react'
import { featureCards, institutions, learningOptions } from './data/landingData'
import ExamListPage from './pages/ExamListPage'
import ExamDetailPage from './pages/ExamDetailPage'
import ExamStructurePage from './pages/ExamStructurePage'
import ExamTestPage from './pages/ExamTestPage'
import ExamResultPage from './pages/ExamResultPage'

const Icon = ({ children, className = '' }) => <span className={`material-symbols-outlined ${className}`}>{children}</span>

export function Header({ active = 'home' }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="header-inner">
        <a className="brand" href="/" aria-label="IIG Việt Nam">
          <img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" />
        </a>
        <span className="header-divider" />
        <span className="challenge-badge"><i />TOEIC Challenge 2026</span>
        <nav aria-label="Điều hướng chính">
          <a className={active === 'home' ? 'active' : ''} href="/">Trang chủ</a>
          <a className={active === 'exams' ? 'active' : ''} href="/exams">Danh sách đề thi</a>
          <a href="https://elearning.iigvietnam.com/" target="_blank" rel="noreferrer">Khóa học IIG</a>
        </nav>
        <a className="hotline" href="tel:1900636929"><Icon>call</Icon><span>1900 636 929</span></a>
        <button className="mobile-menu-toggle" type="button" aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}><Icon>{menuOpen ? 'close' : 'menu'}</Icon></button>
      </div>
      {menuOpen && <nav className="mobile-nav" aria-label="Điều hướng mobile">
        <a className={active === 'home' ? 'active' : ''} href="/" onClick={() => setMenuOpen(false)}><Icon>home</Icon>Trang chủ</a>
        <a className={active === 'exams' ? 'active' : ''} href="/exams" onClick={() => setMenuOpen(false)}><Icon>quiz</Icon>Danh sách đề thi</a>
        <a href="https://elearning.iigvietnam.com/" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}><Icon>school</Icon>Khóa học IIG</a>
      </nav>}
    </header>
  )
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-photo" />
      <div className="hero-overlay" />
      <div className="container hero-grid hero-grid-single">
        <div className="hero-copy">
          <div className="hero-badges"><span><Icon>verified</Icon>Đề thi theo định dạng TOEIC</span><span><Icon>workspace_premium</Icon>Thi thử trực tuyến miễn phí</span></div>
          <h1>TOEIC CHALLENGE 2026 – CHINH PHỤC MỤC TIÊU TOEIC</h1>
          <p>Trải nghiệm bài thi thử trực tuyến, làm quen với cấu trúc đề và theo dõi kết quả theo từng phần thi để xây dựng kế hoạch ôn tập phù hợp.</p>
          <a className="hero-cta" href="#registration"><span className="cta-icon"><Icon>edit_calendar</Icon></span><span>Đăng ký dự thi ngay</span><span className="cta-arrow"><Icon>arrow_forward</Icon></span></a>
          <div className="social-proof">
            <div className="avatars" aria-label="Cộng đồng thí sinh"><span>MT</span><span>PL</span><span>HA</span><span>TL</span></div>
            <div><strong>+45.000+ Thí sinh</strong><span>Đến từ hơn 60+ trường ĐH & Cao đẳng</span></div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section className="features" id="exams">
      <div className="container">
        <header className="section-heading"><h2>Sẵn sàng chinh phục <em>mục tiêu TOEIC</em></h2><p>Làm quen với định dạng bài thi, đánh giá năng lực hiện tại và xác định nội dung cần tập trung trong quá trình ôn luyện.</p><i /></header>
        <div className="feature-grid">
          {featureCards.map(card => <article className={`feature-card ${card.tone}`} key={card.title}><Icon className="feature-icon">{card.icon}</Icon><h3>{card.title}</h3><p>{card.text}</p><span className="feature-tag"><Icon>{card.tagIcon}</Icon>{card.tag}</span></article>)}
        </div>
      </div>
    </section>
  )
}

function InstitutionCombobox({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const filtered = useMemo(() => {
    const query = value.trim().toLocaleLowerCase('vi')
    if (!query) return institutions.slice(0, 12)
    return institutions.filter(item => item.toLocaleLowerCase('vi').includes(query)).slice(0, 12)
  }, [value])
  useEffect(() => {
    const close = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  return (
    <div className="combo" ref={rootRef}>
      <div className="field-control"><Icon>account_balance</Icon><input value={value} onChange={event => { onChange(event.target.value); setOpen(true) }} onFocus={() => setOpen(true)} placeholder="Tìm kiếm hoặc nhập tên trường/cơ quan" aria-autocomplete="list" aria-expanded={open} /></div>
      {open && <div className="combo-menu" role="listbox">
        {filtered.length ? filtered.map(item => <button type="button" role="option" key={item} onClick={() => { onChange(item); setOpen(false) }}><Icon>school</Icon>{item}</button>) : <p>Không tìm thấy kết quả. Bạn vẫn có thể nhập tên trường hoặc cơ quan.</p>}
      </div>}
    </div>
  )
}

function Registration() {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [institution, setInstitution] = useState('')
  const [learning, setLearning] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [consent, setConsent] = useState(false)

  useEffect(() => {
    try {
      const profile = JSON.parse(window.localStorage.getItem('exam-candidate-profile') || 'null')
      if (!profile || typeof profile !== 'object') return
      setFullName(String(profile.fullName || ''))
      setPhone(String(profile.phone || ''))
      setEmail(String(profile.email || ''))
      setInstitution(String(profile.schoolName || ''))
      setLearning(String(profile.toeicExperience || ''))
      setBirthYear(profile.birthYear == null ? '' : String(profile.birthYear))
      setConsent(profile.privacyConsent === true)
    } catch {
      window.localStorage.removeItem('exam-candidate-profile')
    }
  }, [])

  const submit = event => {
    event.preventDefault()
    const profile = {
      fullName, phone, email, birthYear: birthYear ? Number(birthYear) : null, schoolName: institution,
      toeicExperience: learning, privacyConsent: consent,
    }
    window.localStorage.setItem('exam-candidate-profile', JSON.stringify(profile))
    window.location.href = '/exams'
  }
  return (
    <section className="registration-section" id="registration">
      <div className="registration-card">
        <header><h2>Đăng ký dự thi</h2><p>Nhập thông tin để tham gia TOEIC Challenge 2026</p></header>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label><span className="field-label">Họ và tên</span><span className="field-control"><Icon>badge</Icon><input autoComplete="name" value={fullName} onChange={event => setFullName(event.target.value)} placeholder="Nhập họ và tên" /></span></label>
            <label><span className="field-label">Số điện thoại</span><span className="field-control"><Icon>call</Icon><input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="Nhập số điện thoại" /></span></label>
            <label><span className="field-label">Email</span><span className="field-control"><Icon>alternate_email</Icon><input type="text" inputMode="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="Nhập email nhận thông tin dự thi" /></span></label>
            <label><span className="field-label">Năm sinh</span><span className="field-control"><Icon>calendar_today</Icon><select value={birthYear} onChange={event => setBirthYear(event.target.value)}><option value="">Chọn năm sinh</option>{Array.from({ length: 77 }, (_, i) => 2026 - i).map(year => <option key={year} value={year}>{year}</option>)}</select></span></label>
            <label className="full"><span className="field-label">Trường học hoặc cơ quan công tác</span><InstitutionCombobox value={institution} onChange={setInstitution} /></label>
            <label className="full"><span className="field-label">Kinh nghiệm học và thi TOEIC</span><span className="field-control"><Icon>school</Icon><select value={learning} onChange={event => setLearning(event.target.value)}><option value="">Chọn tình trạng học/thi TOEIC</option>{learningOptions.map(option => <option value={option.value} key={option.value}>{option.label}</option>)}</select></span></label>
          </div>
          <label className="consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Tôi xác nhận thông tin đã cung cấp là chính xác và đồng ý với <a href="#rules">quy định dự thi</a> cùng chính sách xử lý thông tin của chương trình.</span></label>
          <button className="submit-button" type="submit"><Icon>how_to_reg</Icon>Đăng ký dự thi</button>
        </form>
      </div>
    </section>
  )
}

export function Footer() {
  return <footer className="footer" id="rules">
    <div className="container footer-grid">
      <div className="footer-about">
        <img src="/iig-vietnam-logo-footer.svg" alt="IIG Việt Nam" />
        <p>Tổ chức Giáo dục IIG Việt Nam cung cấp các dịch vụ khảo thí và đào tạo theo tiêu chuẩn quốc tế.</p>
        <div className="socials">
          <a href="https://iigvietnam.com/" target="_blank" rel="noreferrer" aria-label="Website IIG Việt Nam"><Icon>public</Icon></a>
          <a href="https://www.facebook.com/iigvn/" target="_blank" rel="noreferrer" aria-label="Facebook IIG Việt Nam"><Icon>thumb_up</Icon></a>
          <a href="mailto:info@iigvietnam.edu.vn" aria-label="Email IIG Việt Nam"><Icon>mail</Icon></a>
        </div>
      </div>
      <div className="footer-contact">
        <h3>Thông tin liên hệ</h3>
        <a href="tel:1900636929"><Icon>call</Icon><span><small>Hotline</small>1900 636 929</span></a>
        <a href="mailto:info@iigvietnam.edu.vn"><Icon>mail</Icon><span><small>Email</small>info@iigvietnam.edu.vn</span></a>
        <p><Icon>schedule</Icon><span><small>Giờ làm việc</small>08:00–12:00, Thứ Hai–Thứ Bảy<br />13:30–17:30, Thứ Hai–Thứ Sáu</span></p>
      </div>
      <div className="footer-offices">
        <h3>Văn phòng Hà Nội</h3>
        <FooterAddress label="Trụ sở chính" address="75 Giang Văn Minh, Phường Ngọc Hà, Hà Nội" />
        <FooterAddress label="Văn phòng Trung Yên" address="Tầng 3, Trung Yên Plaza, 1 Trung Hòa, Phường Yên Hòa, Hà Nội" />
      </div>
      <div className="footer-offices">
        <h3>Chi nhánh</h3>
        <FooterAddress label="TP. Đà Nẵng" address="539 Nguyễn Hữu Thọ, Phường Cẩm Lệ, TP. Đà Nẵng" />
        <FooterAddress label="TP. Hồ Chí Minh" address="Tầng 1, Tháp 1, The Sun Avenue, 28 Mai Chí Thọ, Phường Bình Trưng, TP. HCM" />
      </div>
    </div>
    <div className="container copyright">
      <span>© 2026 IIG Vietnam. All rights reserved.</span>
      <nav aria-label="Liên kết cuối trang">
        <a href="https://iigvietnam.com/gioi-thieu/" target="_blank" rel="noreferrer">Về IIG Việt Nam</a>
        <a href="https://elearning.iigvietnam.com/vi" target="_blank" rel="noreferrer">IIG E-Learning</a>
        <a href="https://iigvietnam.com/chinh-sach-bao-mat-thong-tin-khach-hang/" target="_blank" rel="noreferrer">Chính sách bảo vệ dữ liệu cá nhân</a>
      </nav>
    </div>
  </footer>
}

function FooterAddress({ label, address }) { return <div className="footer-address"><Icon>location_on</Icon><p><strong>{label}</strong><span>{address}</span></p></div> }

function LegacyPretestRedirect({ examId }) {
  useEffect(() => {
    window.location.replace(`/exams/${examId}/structure`)
  }, [examId])
  return null
}

export default function App() {
  const path = window.location.pathname.replace(/\/$/, '') || '/'
  if (path === '/exams') return <ExamListPage Header={Header} Footer={Footer} />
  const rulesMatch = path.match(/^\/exams\/([0-9a-f-]+)\/rules$/i)
  if (rulesMatch) return <LegacyPretestRedirect examId={rulesMatch[1]} />
  const instructionsMatch = path.match(/^\/exams\/([0-9a-f-]+)\/instructions$/i)
  if (instructionsMatch) return <LegacyPretestRedirect examId={instructionsMatch[1]} />
  const soundTestMatch = path.match(/^\/exams\/([0-9a-f-]+)\/sound-test$/i)
  if (soundTestMatch) return <LegacyPretestRedirect examId={soundTestMatch[1]} />
  const recordTestMatch = path.match(/^\/exams\/([0-9a-f-]+)\/record-test$/i)
  if (recordTestMatch) return <LegacyPretestRedirect examId={recordTestMatch[1]} />
  const structureMatch = path.match(/^\/exams\/([0-9a-f-]+)\/structure$/i)
  if (structureMatch) return <ExamStructurePage examId={structureMatch[1]} />
  const testMatch = path.match(/^\/exams\/([0-9a-f-]+)\/test$/i)
  if (testMatch) return <ExamTestPage examId={testMatch[1]} />
  const resultMatch = path.match(/^\/exams\/([0-9a-f-]+)\/result$/i)
  if (resultMatch) return <ExamResultPage examId={resultMatch[1]} Header={Header} Footer={Footer} />
  const detailMatch = path.match(/^\/exams\/([0-9a-f-]+)$/i)
  if (detailMatch) return <ExamDetailPage examId={detailMatch[1]} Header={Header} Footer={Footer} />
  return <><Header /><main><Hero /><Features /><Registration /></main><Footer /></>
}
