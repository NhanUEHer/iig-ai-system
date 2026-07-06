# Tài liệu Tổng hợp Yêu cầu & Tài nguyên Hệ thống (AI Scoring Admin Blueprint)

Tài liệu này tổng hợp toàn bộ các yêu cầu nghiệp vụ, luồng xử lý và danh sách tài nguyên (API, mã nguồn tham khảo) hiện có để chuẩn bị phát triển hệ thống quản lý chấm bài tập trung.

---

## 1. Yêu cầu Nghiệp vụ (System Requirements)

Hệ thống mới cần đáp ứng các nghiệp vụ sau:

### 1.1. Module Đăng nhập & Quản lý Token (Token Manager)
* **Tự động đăng nhập:** Gọi API login quản trị của Elearning IIG để lấy JWT Token mới.
* **Quản lý Vòng đời Token:** 
  * Cần giải mã payload JWT để đọc thời gian khởi tạo (`iat`).
  * Kiểm tra xem token hiện tại đã tạo quá **12 tiếng** chưa.
  * Nếu quá 12 tiếng hoặc chưa có token, tự động chạy luồng đăng nhập để lưu trữ token mới.
  * Cung cấp một hàm/API chung để các module khác gọi lấy Token khả dụng bất cứ lúc nào.

### 1.2. Module Trích xuất Thông tin theo Keycode (Scoring Client)
* **Truy vấn danh sách bài làm:** Khi nhận Keycode (ví dụ: `Z8CHWN`), thực hiện tìm kiếm bài làm tương ứng bằng cách truy vấn danh sách bài từ API Elearning.
* **Tách Keycode:** Quét qua các kết quả, dùng Regex để tìm mã đề trùng khớp ở tiền tố của tên bài thi (ví dụ: `Z8CHWN-Thi thử TOEIC...` -> Keycode = `Z8CHWN`).
* **Trích xuất CourseScoringID:** Lấy trường `id` của bản ghi để chuyển tiếp sang bộ chấm bài.

### 1.3. Module Điều phối Chấm điểm (Dify Client)
* Gọi API của Dify (workflow chạy chấm điểm dạng blocking) với cấu hình thời gian chờ (**Timeout 5 phút / 300 giây**).
* Đọc kết quả chấm điểm trả về và cập nhật trạng thái.

---

## 2. Danh sách Tài nguyên API Hệ thống (API Resources)

### 2.1. API Đăng nhập Admin
* **Endpoint:** `POST https://elearningapi.iigvietnam.com/identity/api/Auth/login-admin`
* **Headers:**
  * `apikey`: `4NsZEebAKUTliY1vHL5MQhsIuGUWivAy`
  * `category`: `admin`
  * `content-type`: `application/json`
  * `domain`: `iig`
* **Payload:** `{"username": "Nhan.ND", "password": "BAIIG@2025"}`
* **Dữ liệu trả về quan trọng:** `token` hoặc `accessToken` (JWT).

### 2.2. API Lấy Danh sách Bài chấm & Lọc mã đề
* **Endpoint:** `POST https://elearningapi.iigvietnam.com/api-admin-old/api/Scoring`
* **Headers:**
  * `authorization`: `Bearer <ACCESS_TOKEN>`
  * `category`: `admin`
  * `content-type`: `application/json`
  * `domain`: `iig`
* **Payload:**
  ```json
  {
    "Keyword": null,
    "PageNum": 1,
    "PageSize": 200,
    "StatusesFilter": [1], // 1 = Chờ chấm điểm
    "NameFilter": [], // Có thể truyền ["<KeyCode>-*"] để lọc trực tiếp
    "UnitOrCourseTestFilter": [], "LessonFilter": [], "StepFilter": [], "ActiveScoringFilter": []
  }
  ```

### 2.3. API Lấy Link File Audio/Ảnh đã ký hạn (Migrate File)
* **Endpoint:** `GET https://elearningapi.iigvietnam.com/api-admin-old/api/FileUploader/get-info-migrate-file/{file_id}?access_token={token}`
* **Dữ liệu trả về:** URL tạm thời để truy cập file (`tempUrl`).

### 2.4. API Lấy Chi tiết Bài thi theo ID bài làm (CourseScoringID)
* **Endpoint:** `POST https://elearningapi.iigvietnam.com/api-admin-old/api/Scoring/course-scoring/detail/questions?isEdit=false`
* **Payload:** `["<CourseScoringID>"]` (Mảng chứa danh sách ID bài làm).
* **Dữ liệu trả về:** Một danh sách gồm 1 object lớn có cấu trúc:
  ```json
  [
    {
      "courseScoringId": "7B72...",
      "mckTestResponse": [
        {
          "name": "Speaking",
          "questionnaires": [ ... ]
        },
        {
          "name": "Writing",
          "questionnaires": [ ... ]
        }
      ]
    }
  ]
  ```

### 2.5. API Lấy Chi tiết của từng Câu hỏi (Question Detail)
* **Endpoint:** `GET https://elearningapi.iigvietnam.com/api-admin-old/api/Scoring/scoring/question/detail?chooseId={chooseId}`
* **Dữ liệu trả về:** Một JSON object chứa chi tiết đề bài và câu trả lời học viên:
  * **`courseScoringInfo`**: Thông tin học viên và bài thi.
  * **`leftSections`**: Mảng chứa nội dung đề bài (đoạn văn prompt tại `textContent`, file âm thanh đề bài tại `audioFileId`).
  * **`questionInfo`**:
    * `recordingFileId`: ID file ghi âm câu trả lời của học viên (với Speaking).
    * `writingAnswer`: Nội dung văn bản trả lời của học viên (với Writing).

### 2.6. Cấu trúc Payload gửi sang Dify cho từng dạng bài (Dify Input Specs)
Dưới đây là các trường dữ liệu cần đóng gói gửi sang Dify ứng với từng dạng bài cụ thể trong đề thi:

#### A. Các phần thi Nói (Speaking Questions)

* **Speaking Q1 - Q2: Read a Text Aloud**
  * `group_score`: `"Read Text Aloud"`
  * `text_passage`: Nội dung đoạn văn đề bài (`prompt_text`).
  * `student_audio`: Link file ghi âm đã ký hạn (`url`).

* **Speaking Q3 - Q4: Describe a picture**
  * `group_score`: `"Describe a picture"`
  * `image`: Link ảnh đề bài (`url`).
  * `student_audio`: Link file ghi âm đã ký hạn (`url`).

* **Speaking Q5 - Q7: Respond to questions**
  * `group_score`: `"Respond to questions (Q5-7)"`
  * `text_passage`: Ngữ cảnh của tình huống (`prompt_text`).
  * `text_question`: Câu hỏi cụ thể (`question_text`).
  * `student_audio`: Link file ghi âm đã ký hạn (`url`).

* **Speaking Q8 - Q10: Respond to questions using information provided**
  * `group_score`: `"Respond to questions (Q8-10)"`
  * `image` / `audio_context` / `audio_question`: Link các tài nguyên ảnh/âm thanh đề bài (nếu có).
  * `student_audio`: Link file ghi âm đã ký hạn (`url`).

* **Speaking Q11: Express an opinion**
  * `group_score`: `"Express an opinion"`
  * `text_question`: Câu hỏi yêu cầu đưa ra ý kiến (`prompt_text`).
  * `student_audio`: Link file ghi âm đã ký hạn (`url`).

#### B. Các phần thi Viết (Writing Questions)

* **Writing Q1 - Q5: Write a Sentence Based on a Picture**
  * `group_score`: `"Write a Sentence Based on a Picture"`
  * `image`: Link ảnh đề bài (`url`).
  * `text_passage`: Từ khóa gợi ý (`keywords`).
  * `student_writing`: Văn bản câu trả lời của học viên (`student_writing`).

* **Writing Q6 - Q7: Respond to a Written Request / Email**
  * `group_score`: `"Respond to a Written Request / Email"`
  * `text_passage`: Nội dung email/chỉ dẫn đề bài (`prompt_text`).
  * `text_question`: Yêu cầu câu hỏi cụ thể (`question_text`).
  * `student_writing`: Văn bản email phản hồi của học viên (`student_writing`).

* **Writing Q8: Write an opinion essay**
  * `group_score`: `"Write an opinion essay"`
  * `text_question`: Câu hỏi đề bài viết luận (`prompt_text`).
  * `student_writing`: Văn bản bài viết luận của học viên (`student_writing`).

---

## 3. Bản đồ File Tham khảo trong Workspace (Workspace References)

Hệ thống mới sẽ kế thừa và tối ưu hóa logic từ các file mã nguồn hiện có trong thư mục `/Users/Nhan Nguyen/workspace/SW App Script/`:

| Tên File | Chức năng Tham khảo |
| :--- | :--- |
| `run_dify_workflow.py` | Chứa code mẫu giải mã JWT (`base64`), logic tự động login lấy token, và logic gọi Dify API. |
| `GET Scoring Course ID.yml` | Chứa sơ đồ luồng dữ liệu (Dify Workflow) của hệ thống cũ để lấy thông tin câu hỏi của bài làm. |
| `test_fetch_q1_q2.py` | Chứa code mẫu làm sạch mã HTML (`clean_html`) và gọi API lấy link file từ ID file đã tải lên (`get_real_file_url`). |
| `run_grading_speaking.py` | Chứa các logic gọi API chi tiết câu hỏi (`/Scoring/scoring/question/detail?chooseId=...`). |
| `run_grading_toeic.py` | Chứa logic chấm bài tự động cho phần thi TOEIC tổng thể. |
