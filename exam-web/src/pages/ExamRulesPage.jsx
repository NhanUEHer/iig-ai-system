import { useEffect, useRef, useState } from 'react'
import { getPublicExamDetail } from '../services/publicExamApi'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>

const rules = [
  {
    title: 'Chuẩn bị thiết bị và môi trường làm bài',
    items: [
      'Sử dụng máy tính có kết nối Internet ổn định; đóng các ứng dụng không cần thiết trước khi bắt đầu.',
      'Kiểm tra tai nghe, loa, micro và quyền truy cập thiết bị nếu đề thi có phần Nghe, Nói hoặc ghi âm.',
      'Chọn không gian yên tĩnh và không tải lại trang trong suốt quá trình làm bài.',
    ],
  },
  {
    title: 'Trong thời gian làm bài',
    items: [
      'Thời gian được tính liên tục từ khi bắt đầu. Hệ thống sẽ tự động nộp bài khi hết giờ.',
      'Đọc kỹ hướng dẫn của từng phần thi; câu trả lời được lưu trong quá trình bạn làm bài.',
      'Không mở nhiều cửa sổ làm bài, không chia sẻ nội dung đề và không nhờ người khác thực hiện thay.',
    ],
  },
  {
    title: 'Nộp bài và nhận kết quả',
    items: [
      'Kiểm tra lại các câu chưa trả lời trước khi chọn nộp bài.',
      'Sau khi xác nhận nộp, bạn không thể quay lại thay đổi đáp án.',
      'Kết quả và phân tích bài thi sẽ hiển thị sau khi hệ thống hoàn tất xử lý.',
    ],
  },
]

function ExamRulesPage({ examId }) {
  const [accepted, setAccepted] = useState(false)
  const [examTitle, setExamTitle] = useState('Bài thi TOEIC trực tuyến')
  const rulesContentRef = useRef(null)

  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    if (rulesContentRef.current) rulesContentRef.current.scrollTop = 0
    getPublicExamDetail(examId).then(result => {
      if (active && result.data?.title) setExamTitle(result.data.title)
    }).catch(() => {})
    return () => { active = false }
  }, [examId])

  const continueToExam = () => {
    if (!accepted) return
    window.location.href = `/exams/${examId}/instructions`
  }

  return <div className="test-rules-page">
    <header className="test-header">
      <div className="test-header-inner">
        <a href={`/exams/${examId}`} aria-label="Quay lại chi tiết đề thi"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
        <strong>ONLINE TEST SYSTEM</strong>
        <span aria-hidden="true"><Icon>verified_user</Icon></span>
      </div>
    </header>

    <main className="test-rules-main">
      <section className="test-rules-card">
        <header className="test-rules-heading">
          <div><span><Icon>policy</Icon></span><div><small>{examTitle}</small><h1>Quy định bảo mật và nội quy thi</h1></div></div>
          <Icon>shield_lock</Icon>
        </header>

        <div className="test-rules-content" ref={rulesContentRef} tabIndex="0">
          <p className="test-rules-intro"><b>QUY ĐỊNH ĐỐI VỚI THÍ SINH THAM DỰ BÀI THI TRỰC TUYẾN</b><span>Vui lòng đọc kỹ các nội dung dưới đây trước khi bắt đầu. Việc tiếp tục đồng nghĩa với việc bạn hiểu và đồng ý tuân thủ quy định của bài thi.</span></p>
          {rules.map((group, groupIndex) => <section key={group.title}>
            <h2><span>{String(groupIndex + 1).padStart(2, '0')}</span>{group.title}</h2>
            <ol>{group.items.map(item => <li key={item}>{item}</li>)}</ol>
          </section>)}
          <aside><Icon>info</Icon><span>Nếu gặp sự cố kỹ thuật, hãy giữ nguyên màn hình và liên hệ bộ phận hỗ trợ. Không tự ý tải lại hoặc đóng cửa sổ bài thi.</span></aside>
        </div>

        <footer className="test-rules-footer">
          <label><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} /><span><b>Tôi đã đọc và đồng ý</b> với quy định làm bài thi</span></label>
          <div>
            <a href={`/exams/${examId}`}><Icon>arrow_back</Icon>Quay lại</a>
            <button type="button" disabled={!accepted} onClick={continueToExam}>Tiếp tục <Icon>arrow_forward</Icon></button>
          </div>
        </footer>
      </section>
    </main>
  </div>
}

export default ExamRulesPage
