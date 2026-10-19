# Đặc tả tính năng quản lý câu hỏi

> Trạng thái: Bản nháp để xác nhận nghiệp vụ trước khi triển khai lại.
>
> Phạm vi: Admin Question Bank. Tài liệu này kế tiếp `question-group-management-spec.md`.

## 1. Mục đích

Quản lý câu hỏi lớn, các khối nội dung dùng chung, câu hỏi con, đáp án và media phục vụ thi thử LR/SW.

```text
question_groups
    └── question_bank_questions            câu hỏi lớn
          ├── question_bank_contents       nội dung/passage/media dùng chung
          └── question_bank_sub_questions câu hỏi nhỏ
                └── question_bank_sub_question_options (chỉ MCQ)
```

Nguyên tắc đã chốt:

- Câu hỏi lớn bắt buộc thuộc một nhóm câu hỏi.
- Câu hỏi lớn có `id` UUID và `code` riêng do backend tự sinh.
- Dạng câu hỏi không được thay đổi sau khi tạo.
- Không sử dụng Tag trong tính năng quản lý câu hỏi.
- Câu hỏi con chỉ cần biết thuộc câu hỏi lớn nào; không lưu `content_id`.
- Không lưu `points` ở câu hỏi con.
- Tất cả trường sắp xếp dùng tên `sort_order`, không dùng `display_order`.
- Đáp án MCQ chỉ lưu nội dung đáp án, trạng thái đúng/sai và thứ tự; không phụ thuộc `option_key`.
- Nhãn A/B/C/D do nội dung nhập liệu quyết định, không tự sinh từ thứ tự.
- Content lưu trực tiếp ba khóa media: audio, image, video.
- Câu hỏi con có audio thì lưu trực tiếp một khóa audio trong bản ghi câu hỏi con.
- Một câu hỏi lớn có nhiều content.
- Chưa triển khai sample answer trong phạm vi lần làm lại này.
- Màn edit lưu toàn bộ dữ liệu theo tab, không lưu từng card riêng lẻ.

## 2. Phạm vi chức năng

### 2.1. Danh sách câu hỏi

- Xem danh sách câu hỏi lớn.
- Tìm kiếm.
- Lọc theo nhóm, dạng câu hỏi và nhiều trạng thái.
- Phân trang 10/20/50.
- Tạo mới.
- Mở màn hình chỉnh sửa.
- Xóa câu hỏi theo rule nghiệp vụ.
- Không chọn nhiều và không xóa hàng loạt.

### 2.2. Thông tin chung

- Tên câu hỏi.
- Nhóm câu hỏi.
- Dạng câu hỏi.
- Ghi chú nội bộ.
- Trạng thái.

### 2.3. Nội dung câu hỏi lớn

- Một câu hỏi lớn có thể có nhiều content.
- Content gồm tiêu đề, script, nội dung chính, bản dịch và media.
- Cho phép thêm, sửa, xóa, sắp xếp content.
- Tab Nội dung có một nút lưu chung để lưu toàn bộ content đang chỉnh sửa.

### 2.4. Câu hỏi con

- Một câu hỏi lớn có thể có nhiều câu hỏi con.
- Dạng câu hỏi con được xác định theo dạng của câu hỏi lớn.
- Cho phép thêm, sửa, xóa, sắp xếp câu hỏi con.
- Cấu trúc editor thay đổi theo MCQ, Record hoặc Writing.
- Tab Câu hỏi có một nút lưu chung để lưu toàn bộ câu hỏi con và đáp án đang chỉnh sửa.

## 3. Màn hình danh sách

Route frontend hiện tại:

```text
/question-bank
```

Component hiện tại:

```text
frontend/src/features/question-bank/pages/QuestionBankListPage.jsx
```

### 3.1. Cột dữ liệu đề xuất

```text
STT
Tên câu hỏi
Mã câu hỏi
Dạng câu hỏi
Nhóm câu hỏi
Số câu hỏi con
Ngày cập nhật
Trạng thái
Thao tác
```

STT tính theo phân trang:

```text
(page - 1) * limit + rowIndex + 1
```

### 3.2. Bộ lọc

API chỉ dùng dạng số nhiều cho bộ lọc đa lựa chọn:

```text
search
groupIds
questionTypes
statuses
page
limit
sortBy
sortDirection
```

Không duy trì đồng thời `status` và `statuses`, `groupId` và `groupIds`, `questionType` và `questionTypes` trong contract mới.

Không có filter Tag.

### 3.3. Thao tác dòng

- Menu ba chấm dùng component chung.
- Chỉnh sửa: mở trang edit.
- Xóa: luôn có thể bấm nếu user có quyền; backend trả lỗi nghiệp vụ nếu không được xóa.
- Không quyết định khả năng xóa chỉ bằng dữ liệu phía frontend.

## 4. Luồng tạo câu hỏi

Route frontend hiện tại:

```text
/question-bank/new
```

### 4.1. Form tạo mới

```text
Tên câu hỏi       bắt buộc, tối đa 240 ký tự
Nhóm câu hỏi      bắt buộc, chỉ chọn nhóm ACTIVE
Dạng câu hỏi      bắt buộc: MCQ_SINGLE / RECORD / WRITING
Ghi chú nội bộ    không bắt buộc
```

Quy tắc:

1. Tạo mới luôn ở trạng thái `DRAFT`.
2. Backend tạo câu hỏi lớn trước.
3. Sau khi tạo thành công, chuyển sang trang edit để nhập content và câu hỏi con.
4. Không cho tạo trực tiếp ở trạng thái `ACTIVE`.
5. Backend tự sinh `code` khi tạo câu hỏi.
6. `questionType` bất biến ngay sau khi bản ghi được tạo.

Request đề xuất:

```json
{
  "questionName": "TOEIC Listening Part 3 - Set 01",
  "groupId": "uuid",
  "questionType": "MCQ_SINGLE",
  "note": "Ghi chú nội bộ"
}
```

## 5. Luồng cập nhật thông tin chung

### 5.1. Trường được cập nhật

```text
questionName
groupId
note
status
```

Không cập nhật `questionType` nếu loại câu hỏi được xác nhận là bất biến.

`questionType` đã được chốt là bất biến. API cập nhật phải bỏ qua hoặc từ chối nếu client gửi field này.

### 5.3. Data model câu hỏi lớn mục tiêu

```text
question_bank_questions
├── id               UUID, primary key
├── code             unique, backend tự sinh
├── question_name
├── group_id
├── question_type    bất biến sau khi tạo
├── note
├── status
├── created_by
├── updated_by
├── created_at
└── updated_at
```

`code` là mã nghiệp vụ độc lập với UUID. Format cụ thể là chi tiết nội bộ của backend; client không tự tạo, không preview và không chỉnh sửa.

### 5.2. Trạng thái

```text
DRAFT       đang biên soạn
ACTIVE      được phép đưa vào đề thi
INACTIVE    dừng sử dụng, được phép chỉnh sửa
```

Rule hiện tại và đề xuất giữ lại:

- Không chỉnh sửa content/câu hỏi con khi câu hỏi lớn đang `ACTIVE`.
- Muốn chỉnh sửa phải chuyển về `INACTIVE`.
- Chỉ được chuyển sang `ACTIVE` khi nhóm đang `ACTIVE` và dữ liệu câu hỏi hợp lệ.
- Muốn chuyển sang `ACTIVE`, câu hỏi lớn phải có ít nhất một content và ít nhất một câu hỏi con hợp lệ.

## 6. Luồng quản lý content

### 6.1. Data model mục tiêu

```text
question_bank_contents
├── id
├── question_id
├── title
├── script_html
├── content_html
├── translation_html
├── audio_media_id
├── image_media_id
├── video_media_id
├── sort_order
├── created_at
└── updated_at
```

Media không được xác định bằng cách query `question_bank_media.content_id`. Content giữ trực tiếp ID của tối đa một audio, một image và một video.

### 6.2. Rule

- `title` bắt buộc.
- Mỗi loại media tối đa một file cho một content.
- Upload file mới cùng loại sẽ thay thế liên kết cũ.
- Xóa content xóa liên kết với câu hỏi lớn; chính sách xóa file vật lý cần thực hiện qua storage service.
- Sau khi thêm/xóa/sắp xếp phải chuẩn hóa `sort_order` liên tục từ `0`.
- Không cho thay đổi content khi câu hỏi lớn `ACTIVE`.
- Content là tùy chọn trong quá trình biên soạn `DRAFT`/`INACTIVE`, nhưng phải có ít nhất một content trước khi kích hoạt.
- Nút lưu của tab Nội dung lưu toàn bộ danh sách content trong một transaction.

### 6.3. API đề xuất

```http
GET    /api/question-bank/questions/:questionId/contents
POST   /api/question-bank/questions/:questionId/contents
PUT    /api/question-bank/questions/:questionId/contents/:contentId
DELETE /api/question-bank/questions/:questionId/contents/:contentId
PUT    /api/question-bank/questions/:questionId/contents/reorder
PUT    /api/question-bank/questions/:questionId/contents
```

Body reorder:

```json
{
  "orderedIds": ["content-id-1", "content-id-2"]
}
```

API lưu toàn bộ tab Nội dung:

```http
PUT /api/question-bank/questions/:questionId/contents
```

```json
{
  "items": [
    {
      "id": "uuid-hoặc-null-khi-tạo-mới",
      "title": "Part 1",
      "scriptHtml": "...",
      "contentHtml": "...",
      "translationHtml": "...",
      "sortOrder": 0
    }
  ]
}
```

Backend tạo mới, cập nhật, xóa các item đã bị loại khỏi payload và chuẩn hóa thứ tự trong cùng transaction. Các API CRUD đơn lẻ có thể giữ cho nội bộ nhưng frontend chính sử dụng API lưu toàn bộ.

Media:

```http
POST   /api/question-bank/contents/:contentId/media/:mediaType
DELETE /api/question-bank/contents/:contentId/media/:mediaType
GET    /api/question-bank/media/:mediaId/url
```

`mediaType` chỉ nhận `audio`, `image`, `video`. Upload thành công phải cập nhật trực tiếp trường media tương ứng của content.

## 7. Luồng quản lý câu hỏi con

### 7.1. Data model chung mục tiêu

```text
question_bank_sub_questions
├── id
├── question_id
├── question_text
├── instruction_html
├── hint_html
├── explanation_html
├── note
├── audio_media_id
├── preparation_duration_seconds
├── recording_duration_seconds
├── max_character_count
├── min_word_count
├── sort_order
├── created_at
└── updated_at
```

Không có:

```text
content_id
points
display_order
```

`question_type` không nhất thiết lặp lại ở câu hỏi con vì đã được xác định từ câu hỏi lớn. Nếu giữ để tối ưu snapshot/đọc dữ liệu thì backend phải đảm bảo luôn đồng bộ, không nhận tùy ý từ client.

### 7.2. Rule chung

- `question_text` bắt buộc.
- Câu hỏi con bắt buộc thuộc một câu hỏi lớn.
- Không cho sửa khi câu hỏi lớn `ACTIVE`.
- Sắp xếp bằng `sort_order`, liên tục từ `0`.
- Audio câu hỏi lưu bằng `audio_media_id` trực tiếp trên câu hỏi con.
- Không có Tag hoặc junction table Tag trong phạm vi mô hình mới.
- Nút lưu của tab Câu hỏi lưu toàn bộ câu hỏi con và đáp án trong một transaction.

### 7.3. API chung

```http
GET    /api/question-bank/questions/:questionId/sub-questions
POST   /api/question-bank/questions/:questionId/sub-questions
PUT    /api/question-bank/questions/:questionId/sub-questions/:subQuestionId
DELETE /api/question-bank/questions/:questionId/sub-questions/:subQuestionId
PUT    /api/question-bank/questions/:questionId/sub-questions/reorder
PUT    /api/question-bank/questions/:questionId/sub-questions
```

API lưu toàn bộ tab Câu hỏi:

```http
PUT /api/question-bank/questions/:questionId/sub-questions
```

Body chứa toàn bộ câu hỏi con theo đúng dạng của câu hỏi lớn. Backend tạo mới, cập nhật, xóa item bị loại khỏi payload, đồng bộ đáp án MCQ và chuẩn hóa `sort_order` trong cùng transaction.

Audio:

```http
POST   /api/question-bank/sub-questions/:subQuestionId/audio
DELETE /api/question-bank/sub-questions/:subQuestionId/audio
```

## 8. Câu hỏi MCQ

### 8.1. Data model đáp án mục tiêu

```text
question_bank_sub_question_options
├── id
├── sub_question_id
├── option_text
├── is_correct
├── sort_order
├── created_at
└── updated_at
```

Không cần `option_key`.

Ví dụ người nhập muốn hiển thị A/B/C/D thì nhập trực tiếp:

```text
A. Paris
B. London
C. Berlin
D. Rome
```

Frontend chỉ sắp xếp theo `sort_order`, không tự gắn nhãn.

### 8.2. Rule kích hoạt MCQ đề xuất

- Có ít nhất một câu hỏi con.
- Mỗi câu hỏi con có `question_text`.
- Mỗi câu hỏi con có ít nhất hai đáp án.
- Có đúng một đáp án `is_correct = true`.
- Mọi đáp án có `option_text`.

## 9. Câu hỏi Record

Trường riêng:

```text
audio_media_id
preparation_duration_seconds
recording_duration_seconds
instruction_html
note
```

Rule kích hoạt đề xuất:

- Có ít nhất một câu hỏi con.
- Có `question_text`.
- `preparation_duration_seconds >= 0`.
- `recording_duration_seconds > 0`.
- Audio là tùy chọn, kể cả khi kích hoạt.

## 10. Câu hỏi Writing

Trường riêng:

```text
audio_media_id
max_character_count
min_word_count
instruction_html
note
```

Rule kích hoạt đề xuất:

- Có ít nhất một câu hỏi con.
- Có `question_text`.
- `max_character_count > 0`.
- `min_word_count >= 0`.
- Audio là tùy chọn.

## 11. API câu hỏi lớn

Base path:

```text
/api/question-bank
```

### 11.1. Danh sách

```http
GET /api/question-bank/questions
```

Response mỗi dòng:

```json
{
  "id": "uuid",
  "code": "QB-000001",
  "questionName": "...",
  "groupId": "uuid",
  "groupName": "...",
  "questionType": "MCQ_SINGLE",
  "contentCount": 1,
  "subQuestionCount": 10,
  "status": "DRAFT",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### 11.2. Chi tiết

```http
GET /api/question-bank/questions/:id
```

Đề xuất trả thông tin câu hỏi lớn; content và câu hỏi con tiếp tục tải qua API riêng để màn edit không có response quá lớn.

### 11.3. Tạo

```http
POST /api/question-bank/questions
```

Backend bắt buộc lưu `DRAFT` bất kể client gửi trạng thái gì.

Trong cùng transaction, backend sinh và lưu `code` duy nhất. Client không gửi và không được phép sửa `code`.

### 11.4. Cập nhật

```http
PUT /api/question-bank/questions/:id
```

Chỉ nhận các field được cho phép; không nhận field content/sub-question trong API này.

### 11.5. Xóa

```http
DELETE /api/question-bank/questions/:id
```

Rule đề xuất:

- Không xóa câu hỏi `ACTIVE`.
- Không xóa câu hỏi đã được liên kết vào đề thi/version.
- Backend trả `409 Conflict` kèm mã lỗi nghiệp vụ.

### 11.6. Rule kích hoạt chung

Backend chỉ cho chuyển sang `ACTIVE` khi đồng thời thỏa mãn:

1. Nhóm câu hỏi đang `ACTIVE`.
2. Có ít nhất một content hợp lệ.
3. Có ít nhất một câu hỏi con hợp lệ.
4. Toàn bộ câu hỏi con đáp ứng rule của loại `MCQ_SINGLE`, `RECORD` hoặc `WRITING`.

Không yêu cầu content trong lúc lưu bản nháp hoặc khi câu hỏi ở trạng thái `INACTIVE`.

## 12. Quyền

```text
question_bank.view          xem danh sách/chi tiết/media
question_bank.manage        tạo, sửa, xóa câu hỏi/content/câu hỏi con
question_bank.media_manage  upload, thay thế, xóa media
```

Quản lý group taxonomy là quyền riêng theo tài liệu group. Không có nghiệp vụ Tag.

## 13. Khác biệt giữa source hiện tại và mô hình mục tiêu

| Hạng mục | Source hiện tại | Mục tiêu |
|---|---|---|
| Filter | Nhận cả số ít và số nhiều | Chỉ contract số nhiều, không có Tag |
| Mã câu hỏi | Cắt 8 ký tự UUID trên frontend | Có `id` UUID và `code` do backend tự sinh |
| Content media | Bảng media chứa `content_id` | Content giữ 3 media ID |
| Sub-question content | Có `content_id` | Bỏ |
| Điểm | Có `points` | Bỏ |
| Thứ tự | `display_order` | `sort_order` |
| MCQ option | Có `option_key` | Bỏ |
| Audio câu hỏi con | Bảng media chứa `sub_question_id` | Sub-question giữ `audio_media_id` |
| Loại câu hỏi lớn | Có thể nhận field trong validator | Bất biến sau khi tạo |
| Loại câu hỏi con | Lặp `question_type` | Cân nhắc bỏ, không nhận từ client |
| Xóa trên frontend | Có chỗ ẩn theo trạng thái | Nút bấm được, backend quyết định |
| Tag | Gắn Tag với câu hỏi con | Bỏ hoàn toàn |
| Bulk action | Chọn nhiều và xóa hàng loạt | Bỏ checkbox và bulk delete |

## 14. Các điểm cần xác nhận trước khi chốt document

Các quyết định đã chốt:

1. Câu hỏi có `id` UUID và `code` do backend tự sinh.
2. `questionType` không được thay đổi sau khi tạo.
3. Không sử dụng Tag.
4. Không chọn nhiều và không xóa hàng loạt.
5. Một câu hỏi lớn có nhiều content.
6. Audio của câu hỏi Record là tùy chọn.
7. MCQ có tối thiểu hai đáp án.
8. Chưa triển khai sample answer.
9. Lưu toàn bộ theo tab: một nút cho tab Nội dung và một nút cho tab Câu hỏi.
10. Kích hoạt yêu cầu tối thiểu một content và một câu hỏi con hợp lệ.

## 15. Thứ tự triển khai sau khi chốt

```text
1. Danh sách câu hỏi
2. Tạo mới + thông tin chung
3. Content + media
4. Câu hỏi con chung
5. MCQ + đáp án
6. Record
7. Writing
8. Rule kích hoạt/xóa
9. Migration dữ liệu cũ + test
```

## 16. Phân chia trách nhiệm agent

### 16.1. Kiro — Backend và database

Kiro chịu trách nhiệm toàn bộ phần server-side:

- Migration database theo data model mục tiêu.
- Thêm `question_bank_questions.code` và cơ chế backend tự sinh mã duy nhất.
- Bỏ/di trú `content_id`, `points`, `option_key`, Tag và các trường `display_order` cũ.
- Thêm các cột media trực tiếp cho content và câu hỏi con.
- Repository, service, validator, controller và routes.
- API danh sách, CRUD câu hỏi lớn, lưu toàn bộ content và lưu toàn bộ câu hỏi con.
- Transaction cho hai API lưu toàn bộ theo tab.
- Rule khóa chỉnh sửa, kích hoạt và xóa.
- Upload/thay thế/xóa media và cleanup storage.
- Backend unit/integration tests.
- Tài liệu migration/compatibility nếu dữ liệu cũ cần chuyển đổi.

Phạm vi file chính:

```text
src/database/migrations/*
src/modules/question-bank-v3/*
src/controllers/question*V3Controller.js
src/routes/questionBankV3Routes.js
tests/question-bank-v3*.test.js
```

Kiro không sửa frontend, component UI hoặc CSS.

### 16.2. Codex — Frontend Admin

Codex chịu trách nhiệm toàn bộ phần client-side sau khi API contract được Kiro hoàn thiện:

- Danh sách câu hỏi theo design system.
- Bỏ Tag, checkbox và bulk delete.
- Hiển thị `code` do backend trả về, không cắt UUID làm mã.
- Form tạo mới và thông tin chung.
- Khóa thay đổi `questionType` sau khi tạo.
- Tab Nội dung: nhiều content, ba media trực tiếp và một nút lưu toàn bộ.
- Tab Câu hỏi: MCQ/Record/Writing và một nút lưu toàn bộ.
- Component dùng chung, trạng thái loading/error/empty và dialog xác nhận.
- Tích hợp API, mapping request/response và hiển thị lỗi nghiệp vụ từ backend.
- Frontend tests, lint, build và kiểm tra giao diện.

Phạm vi file chính:

```text
frontend/src/features/question-bank/*
frontend/src/services/questionBankService.js
frontend/src/components/ui/* (chỉ khi cần mở rộng component dùng chung)
tests/frontend-*.test.js
```

Codex không tự thay đổi migration, database schema hoặc backend contract đã chốt. Nếu phát hiện contract thiếu, Codex cập nhật document và giao lại Kiro xử lý.

### 16.3. Thứ tự phối hợp

```text
1. Chốt document và API contract
2. Kiro triển khai database + backend + tests
3. Review backend contract
4. Codex triển khai frontend theo contract
5. Chạy test tích hợp FE ↔ BE
6. Review nghiệp vụ và giao diện cuối
```

Hai agent không sửa cùng một nhóm file trong cùng thời điểm để tránh conflict.
