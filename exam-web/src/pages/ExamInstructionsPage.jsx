import { useEffect, useRef, useState } from 'react'
import { getPublicExamDetail } from '../services/publicExamApi'

const Icon = ({ children }) => <span className="material-symbols-outlined">{children}</span>

const steps = [
  {
    icon: 'fact_check',
    title: 'Xác nhận thông tin bài thi',
    description: 'Kiểm tra tên đề, số lượng câu hỏi và thời gian làm bài trước khi bắt đầu. Thời gian chỉ được tính sau khi bạn chọn “Bắt đầu làm bài”.',
  },
  {
    icon: 'headphones',
    title: 'Kiểm tra thiết bị',
    description: 'Bật âm thanh và cho phép trình duyệt sử dụng tai nghe hoặc micro nếu bài thi có nội dung Nghe, Nói hoặc ghi âm.',
  },
  {
    icon: 'view_carousel',
    title: 'Làm bài và điều hướng câu hỏi',
    description: 'Sử dụng nút Trước/Tiếp theo hoặc bảng câu hỏi để di chuyển. Bạn có thể đánh dấu câu chưa chắc chắn và quay lại trước khi nộp bài.',
  },
  {
    icon: 'timer',
    title: 'Theo dõi thời gian',
    description: 'Đồng hồ đếm ngược luôn hiển thị trên màn hình. Câu trả lời được lưu tự động và bài thi sẽ tự nộp khi hết giờ.',
  },
  {
    icon: 'task_alt',
    title: 'Kiểm tra và nộp bài',
    description: 'Xem lại danh sách câu chưa trả lời, sau đó chọn “Nộp bài”. Khi đã xác nhận nộp, bạn không thể thay đổi đáp án.',
  },
]

function ExamInstructionsPage({ examId }) {
  const [exam, setExam] = useState(null)
  const contentRef = useRef(null)

  useEffect(() => {
    let active = true
    window.scrollTo(0, 0)
    if (contentRef.current) contentRef.current.scrollTop = 0
    getPublicExamDetail(examId).then(result => {
      if (active) setExam(result.data)
    }).catch(() => {})
    return () => { active = false }
  }, [examId])

  return <div className="test-rules-page test-instructions-page">
    <header className="test-header">
      <div className="test-header-inner">
        <a href={`/exams/${examId}`} aria-label="Quay lại chi tiết đề thi"><img src="/iig-vietnam-logo.png" alt="IIG Việt Nam" /></a>
        <strong>ONLINE TEST SYSTEM</strong>
        <span aria-hidden="true"><Icon>verified_user</Icon></span>
      </div>
    </header>

    <main className="test-rules-main">
      <section className="test-rules-card test-instructions-card">
        <header className="test-rules-heading test-instructions-heading">
          <div><span><Icon>menu_book</Icon></span><div><small>{exam?.title || 'Bài thi TOEIC trực tuyến'}</small><h1>Hướng dẫn làm bài</h1></div></div>
          <Icon>assignment_turned_in</Icon>
        </header>

        <div className="test-instructions-content" ref={contentRef} tabIndex="0">
          <p>Hãy dành ít phút làm quen với quy trình và các công cụ trước khi bắt đầu bài thi.</p>
          <div className="instruction-steps">
            {steps.map((step, index) => <article key={step.title}>
              <span className="instruction-number">Bước {index + 1}</span>
              <div><h2>{step.title}</h2><p>{step.description}</p></div>
            </article>)}
          </div>
          <aside><Icon>info</Icon><span>Khi đã sẵn sàng, chọn “Tiếp tục” để chuyển đến màn hình bắt đầu bài thi.</span></aside>
        </div>

        <footer className="test-instructions-footer">
          <a href={`/exams/${examId}/rules`}><Icon>arrow_back</Icon>Quay lại</a>
          <a className="primary" href={`/exams/${examId}/sound-test`}>Tiếp tục <Icon>arrow_forward</Icon></a>
        </footer>
      </section>
    </main>
  </div>
}

export default ExamInstructionsPage
