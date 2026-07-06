# Kế hoạch Triển khai Dự án & Tiêu chuẩn Code (AI Scoring Admin Task Sheet)

Tài liệu này đặc tả các tính năng, giao diện, danh sách nhiệm vụ chi tiết và tiêu chuẩn lập trình dành cho AI để phát triển hệ thống web **AI Scoring Admin** sử dụng bộ công nghệ **NodeJS (Express), PostgreSQL và React**.

---

## 1. Yêu cầu Tính năng (Features Spec)

### Chức năng 1: Nhập Keycode & Đồng bộ tự động
* Giao diện cho phép nhập mã đề (Keycode).
* Backend tìm kiếm trong bảng bộ nhớ đệm `keycode_mappings` cục bộ trước:
  * **Nếu CÓ:** Lấy ngay `courseScoringId` cục bộ $\rightarrow$ Gọi API lấy 19 câu hỏi chi tiết $\rightarrow$ Lưu thông tin lượt làm bài vào DB.
  * **Nếu KHÔNG CÓ:** Gọi API Elearning để tra cứu trực tuyến $\rightarrow$ Tìm ID bài làm tương ứng $\rightarrow$ Lưu/Cập nhật cặp Keycode và ID mới vào bảng `keycode_mappings` $\rightarrow$ Tiến hành gọi API chi tiết 19 câu hỏi và lưu thông tin bài làm.
* Đặt trạng thái ban đầu của bài thi là **"Chưa chấm"** (`status = 1`) và các câu là `pending`.

### Chức năng bổ sung: Đồng bộ hàng loạt Danh sách đề (Batch Mappings Sync)
* Khi gọi API đồng bộ danh sách (PageSize: 1000), backend tự động duyệt qua tất cả các bài thi trả về, bóc tách cặp `keycode` từ trường tên (`name`) và `courseScoringId` (`id`) của từng bài, sau đó lưu/cập nhật toàn bộ vào bảng `keycode_mappings` trong DB cục bộ.
* Hạn chế tối đa việc gọi Elearning API trực tiếp khi tìm kiếm mã đề.

### Chức năng 2: Danh sách Bài làm (Dashboard Submissions)
* Hiển thị danh sách các bài thi đã đồng bộ từ Elearning.
* Bộ lọc theo Keycode, Tên học viên và Trạng thái chấm AI (Chưa chấm, Đang chấm, Đã chấm, Lỗi).
* Hiển thị tổng quan số lượng bài làm theo từng trạng thái.

### Chức năng 3: Chi tiết Bài thi & Giao diện Chấm điểm
* Xem chi tiết nội dung làm bài của một học viên gồm 19 câu hỏi Speaking & Writing.
* Tích hợp trình phát âm thanh (Audio player) đối với phần thi Nói (Speaking) sử dụng link tạm thời được sinh tự động từ API.
* Hiển thị nội dung văn bản đề bài (đã làm sạch HTML) và câu trả lời dạng chữ của học viên (Writing).

### Chức năng 4: Kích hoạt Chấm điểm AI
* Nút bấm cho phép kích hoạt chấm điểm cho từng câu hoặc toàn bộ bài thi sang Dify API.
* Tự động cập nhật trạng thái chấm thành "Đang chấm" $\rightarrow$ "Đã chấm" và lưu điểm số/kết quả phản hồi vào DB sau khi hoàn tất.

---

## 2. Thiết kế Giao diện (UI/UX Spec)

* **Theme:** Giao diện tối giản, chuyên nghiệp, hỗ trợ Dark/Light mode (Ưu tiên dùng TailwindCSS hoặc CSS Variables với tông màu xanh dương/slate làm chủ đạo).
* **Trang Dashboard (Danh sách):**
  * Hộp tìm kiếm và nút đồng bộ Keycode ở góc trên cùng.
  * Các thẻ KPI (Tổng số bài, Chưa chấm, Đang chấm, Đã chấm).
  * Bảng danh sách bài thi (Họ tên, Keycode, Ngày nộp, Trạng thái, Hành động).
* **Trang Chi tiết (Submission Detail):**
  * Cột bên trái: Thông tin học viên (Họ tên, SĐT, Email, Đề thi).
  * Cột bên phải: Danh sách 19 câu hỏi dạng cuộn. Mỗi câu hiển thị:
    * Tiêu đề câu (ví dụ: *Speaking Question 1*).
    * Đề bài (Prompt text).
    * Bài làm của học sinh (Audio player hoặc Text box).
    * Nút kích hoạt chấm điểm riêng lẻ và khu vực hiển thị điểm/nhận xét sau khi chấm.

---

## 3. Danh sách Task triển khai chi tiết (Implementation Tasks)

### Giao đoạn 1: Khởi tạo Cơ sở dữ liệu & Backend
* [ ] **Task 1.1:** Khởi tạo dự án NodeJS, thiết lập thư mục Express và kết nối cơ sở dữ liệu PostgreSQL.
* [ ] **Task 1.2:** Tạo migration/schema khởi tạo các bảng `tokens`, `keycode_mappings`, `mocktest_submissions`, `submission_answers` theo cấu trúc vật lý đã thiết kế.
* [ ] **Task 1.3:** Xây dựng Module **Token Manager** tự động kiểm tra thời hạn và làm mới Admin Token qua API Elearning (lưu vào bảng `tokens`).
* [ ] **Task 1.4:** Xây dựng API Client kết nối IIG Elearning (Tìm ID theo Keycode, Lấy chi tiết câu hỏi, Lấy S3 signed URL cho file ghi âm).
* [ ] **Task 1.5:** Viết API Endpoint `POST /api/submissions/sync` nhận keycode, kiểm tra bảng `keycode_mappings` trước, nếu chưa có thì tìm qua API rồi lưu lại, tiếp tục đồng bộ toàn bộ đề và bài làm 19 câu về DB.
* [ ] **Task 1.6:** Viết API Endpoints `GET /api/submissions` (lấy danh sách) và `GET /api/submissions/:id` (lấy chi tiết bài làm).
* [ ] **Task 1.7:** Xây dựng API Endpoint/Job `POST /api/submissions/sync-mappings` gọi API Elearning với `PageSize: 1000` để quét và nạp hàng loạt cặp Keycode -> ID vào bảng `keycode_mappings`.

### Giai đoạn 2: Phát triển Frontend React
* [ ] **Task 2.1:** Khởi tạo dự án React (dùng Vite), cài đặt React Router và TailwindCSS.
* [ ] **Task 2.2:** Thiết kế UI Dashboard danh sách bài thi cùng hộp thoại/nút đồng bộ Keycode.
* [ ] **Task 2.3:** Thiết kế UI chi tiết 19 câu hỏi (phát audio cho Speaking, hiển thị text cho Writing).
* [ ] **Task 2.4:** Kết nối React với API Backend để đồng bộ và hiển thị dữ liệu thời gian thực.

---

## 4. Tiêu chuẩn Code bắt buộc (Coding Standards for AI)

AI thực hiện dự án này phải tuân thủ nghiêm ngặt các quy tắc lập trình sau:

### 4.1. Tiêu chuẩn Backend (NodeJS & PostgreSQL)
1. **Kiến trúc phân lớp:** Chia rõ ràng thành `routes/`, `controllers/`, `services/` (hoặc `clients/`), và `models/`.
2. **Xử lý bất đồng bộ:** Sử dụng hoàn toàn cú pháp `async/await`. Bắt buộc bao bọc các lời gọi ngoại vi bằng khối `try/catch`.
3. **Quản lý kết nối DB:** Sử dụng Connection Pool hoặc ORM uy tín (như Prisma/Sequelize) để truy vấn PostgreSQL an toàn, tránh SQL Injection.
4. **Không hardcode credentials:** Mọi thông tin nhạy cảm (DB URL, API Key, Account đăng nhập) phải được cấu hình qua biến môi trường `.env`.

### 4.2. Tiêu chuẩn Frontend (React)
1. **Component mô-đun hóa:** Tách nhỏ các component dùng chung (ví dụ: `AudioPlayer`, `StatusBadge`, `SubmissionRow`).
2. **Quản lý State sạch:** Sử dụng React Hooks tiêu chuẩn (`useState`, `useEffect`, `useMemo`). Tránh re-render thừa.
3. **Xử lý trạng thái tải (Loading/Error):** Mọi tác vụ tương tác API phải có hiệu ứng loading (Spinner/Skeleton) và thông báo lỗi trực quan cho người dùng.

### 4.3. Tiêu chuẩn bảo mật mạng
* Mọi API Endpoint ghi nhận dữ liệu (`POST`, `PUT`) phải kiểm tra dữ liệu đầu vào (Input Validation) trước khi chèn vào database.
* Xử lý lỗi tập trung bằng một Middleware Handler trên Express để tránh rò rỉ stack trace lỗi hệ thống về client.
