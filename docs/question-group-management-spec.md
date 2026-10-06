# Đặc tả tính năng quản lý nhóm câu hỏi

## 1. Mục đích

Quản lý các nhóm phân loại cho ngân hàng câu hỏi. Mỗi câu hỏi lớn trong ngân hàng bắt buộc thuộc một nhóm câu hỏi.

```text
question_groups
    └── question_bank_questions
          └── question_bank_sub_questions
```

Nhóm câu hỏi chỉ có vai trò phân loại và kiểm soát khả năng sử dụng câu hỏi. Nhóm không chứa nội dung passage, đáp án, media hoặc quy tắc tính điểm.

## 2. Phạm vi chức năng

Tính năng bao gồm:

- Xem danh sách nhóm câu hỏi.
- Tìm kiếm nhóm theo tên.
- Lọc nhóm theo một hoặc nhiều trạng thái.
- Phân trang.
- Tạo nhóm mới.
- Chỉnh sửa tên, mô tả và trạng thái nhóm.
- Xóa nhóm chưa được liên kết với câu hỏi.
- Hiển thị số lượng câu hỏi thuộc từng nhóm.

Không bao gồm:

- Tự nhập mã nhóm.
- Hiển thị mã nhóm trên form tạo mới.
- Preview mã nhóm trước khi lưu.
- Quản lý question, sub-question hoặc media trong màn hình group.

## 3. Màn hình Admin

File hiện tại:

`frontend/src/features/question-bank/pages/QuestionGroupManagementPage.jsx`

### 3.1. Danh sách nhóm

Màn hình hiển thị:

- Tên nhóm.
- Mã nhóm, chỉ hiển thị tại danh sách hoặc màn hình chi tiết nếu cần.
- Số lượng câu hỏi.
- Ngày cập nhật.
- Trạng thái.
- Thao tác sửa/xóa nếu user có quyền quản lý.

Bộ lọc:

```text
search
statuses
page
limit
```

Chỉ sử dụng `statuses`, không sử dụng đồng thời `status` và `statuses`.

Quy ước:

```text
Không truyền statuses       → lấy tất cả trạng thái
statuses=ACTIVE             → lọc nhóm ACTIVE
statuses=ACTIVE,DRAFT       → lọc nhóm ACTIVE hoặc DRAFT
```

### 3.2. Form tạo nhóm

Form chỉ có:

```text
Tên nhóm câu hỏi       bắt buộc, tối đa 240 ký tự
Mô tả nhóm             không bắt buộc, tối đa 2.000 ký tự
Trạng thái ban đầu     ACTIVE / DRAFT / INACTIVE
```

Form không hiển thị trường mã nhóm.

Khi submit, frontend chỉ gửi dữ liệu nghiệp vụ:

```json
{
  "name": "TOEIC Reading Part 7",
  "description": "Các câu hỏi đọc hiểu đoạn văn",
  "status": "ACTIVE"
}
```

Backend tự sinh mã nhóm và lưu cùng transaction tạo group.

### 3.3. Form chỉnh sửa nhóm

Form chỉnh sửa:

```text
Tên nhóm
Mô tả nhóm
Trạng thái
```

Mã nhóm không được sửa và không cần hiển thị trong form chỉnh sửa. Nếu cần định danh trong màn hình danh sách, mã được hiển thị ở dạng readonly.

## 4. API

Base path:

```text
/api/question-bank
```

### 4.1. Lấy danh sách dùng cho dropdown

```http
GET /api/question-bank/groups
```

Mục đích: lấy các group `ACTIVE` để chọn khi tạo hoặc chuyển question lớn.

Query không cần thiết; backend mặc định chỉ lấy group ACTIVE.

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "GRP-01",
      "name": "TOEIC Reading Part 7",
      "description": "...",
      "status": "ACTIVE"
    }
  ]
}
```

### 4.2. Danh sách quản lý

```http
GET /api/question-bank/question-groups
```

Query:

```text
search      string, tìm theo name hoặc code
statuses    string, danh sách trạng thái phân cách bằng dấu phẩy
page        số trang, mặc định 1
limit       số dòng/trang, mặc định 10, tối đa 100
```

Ví dụ:

```http
GET /api/question-bank/question-groups?search=reading&statuses=ACTIVE,DRAFT&page=1&limit=10
```

Response:

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "GRP-01",
      "name": "TOEIC Reading Part 7",
      "description": "Các câu hỏi đọc hiểu đoạn văn",
      "status": "ACTIVE",
      "questionCount": 12,
      "createdAt": "2026-09-29T00:00:00.000Z",
      "updatedAt": "2026-09-29T00:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 1,
    "totalPages": 1
  }
}
```

Không tạo API preview mã nhóm.

### 4.3. Lấy chi tiết

```http
GET /api/question-bank/question-groups/:id
```

Trả về thông tin một group và số lượng question lớn đang liên kết.

### 4.4. Tạo group

```http
POST /api/question-bank/question-groups
```

Request:

```json
{
  "name": "TOEIC Listening Part 2",
  "description": "Câu hỏi hỏi đáp ngắn",
  "status": "ACTIVE"
}
```

Backend thực hiện:

1. Validate request.
2. Sinh mã group từ sequence.
3. Insert group.
4. Trả về group vừa tạo, bao gồm mã backend đã sinh.

Response trả về mã để frontend cập nhật danh sách, nhưng frontend không cần hiển thị mã trong form tạo.

### 4.5. Cập nhật group

```http
PUT /api/question-bank/question-groups/:id
```

Request chỉ cho phép:

```json
{
  "name": "TOEIC Listening Part 2 - Question Response",
  "description": "...",
  "status": "ACTIVE"
}
```

Không nhận `code` từ client.

### 4.6. Xóa group

```http
DELETE /api/question-bank/question-groups/:id
```

Chỉ xóa được group không có question liên kết.

## 5. Database

### 5.1. Bảng `question_groups`

```text
question_groups
├── id
├── code
├── title
├── description
├── status
├── created_by
├── updated_by
├── created_at
└── updated_at
```

Chi tiết:

| Field | Kiểu | Quy tắc |
|---|---|---|
| `id` | UUID | Primary key |
| `code` | VARCHAR(80) | Unique, backend tự sinh |
| `title` | VARCHAR(240) | Not null |
| `description` | TEXT | Nullable |
| `status` | VARCHAR(24) | `DRAFT`, `ACTIVE`, `INACTIVE` |
| `created_by` | UUID | Nullable, tham chiếu users |
| `updated_by` | UUID | Nullable, tham chiếu users |
| `created_at` | TIMESTAMPTZ | Tự sinh |
| `updated_at` | TIMESTAMPTZ | Tự cập nhật khi sửa |

Database hiện tại dùng `title`, còn API/frontend dùng `name`.

Data model API chuẩn hóa thành `name`:

```text
database.title → API.name
```

Không bắt buộc đổi tên cột database ngay; có thể giữ mapping này để giảm rủi ro migration.

### 5.2. Sequence mã nhóm

Mã nhóm được sinh từ:

```text
question_group_code_seq
```

Format hiện tại:

```text
GRP-01
GRP-02
GRP-03
```

Sequence chỉ được gọi khi tạo group thật. Không gọi sequence cho preview.

Mã nhóm chỉ dùng để định danh và tra cứu, không mang ý nghĩa thứ tự nghiệp vụ.

### 5.3. Quan hệ với question lớn

```sql
question_bank_questions.group_id
  REFERENCES question_groups(id)
  ON DELETE RESTRICT
```

Quan hệ:

```text
question_groups 1 ─── N question_bank_questions
```

Mỗi question lớn bắt buộc thuộc đúng một group.

## 6. Rule nghiệp vụ

### 6.1. Tạo mới

- `name` bắt buộc.
- `name` tối đa 240 ký tự.
- `description` tối đa 2.000 ký tự.
- `status` chỉ nhận `DRAFT`, `ACTIVE`, `INACTIVE`.
- `code` không nhận từ client.
- Backend tự sinh `code` khi insert.
- Group mới không bắt buộc phải là ACTIVE; cho phép tạo DRAFT.

### 6.2. Cập nhật

- Không được thay đổi `id`.
- Không được thay đổi `code`.
- Có thể sửa `name`, `description`, `status`.
- Khi chuyển group từ ACTIVE sang DRAFT/INACTIVE, phải kiểm tra question ACTIVE.

### 6.3. Không được ngừng hoạt động group còn question ACTIVE

Không cho phép:

```text
Group còn ít nhất một question ACTIVE
→ chuyển group sang DRAFT hoặc INACTIVE
```

Thông báo nghiệp vụ:

```text
Không thể ngừng hoạt động nhóm khi vẫn còn câu hỏi đang hoạt động.
```

### 6.4. Không được xóa group đang được sử dụng

Không cho phép xóa nếu group có bất kỳ question nào, kể cả question DRAFT hoặc INACTIVE.

```text
questionCount > 0 → không cho xóa
```

Lý do: giữ tính toàn vẹn dữ liệu và tránh làm hỏng lịch sử đề thi/version.

### 6.5. Chọn group khi tạo question

Question mới chỉ được chọn group ACTIVE nếu question được chuyển sang ACTIVE.

Question DRAFT có thể được tạo trong group DRAFT hoặc ACTIVE tùy rule của question flow; khi kích hoạt question phải kiểm tra group ACTIVE.

## 7. Data model đề xuất

### API model

```ts
type QuestionGroupStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE';

type QuestionGroup = {
  id: string;
  code: string;
  name: string;
  description: string;
  status: QuestionGroupStatus;
  questionCount: number;
  createdAt: string;
  updatedAt: string;
};
```

### Create input

```ts
type CreateQuestionGroupInput = {
  name: string;
  description?: string;
  status: QuestionGroupStatus;
};
```

### Update input

```ts
type UpdateQuestionGroupInput = {
  name?: string;
  description?: string;
  status?: QuestionGroupStatus;
};
```

Không đưa `code` vào hai input trên.

## 8. Permission

| Tác vụ | Permission |
|---|---|
| Xem danh sách/chi tiết | `question_bank.view` |
| Tạo group | `question_bank.taxonomy_manage` |
| Sửa group | `question_bank.taxonomy_manage` |
| Xóa group | `question_bank.taxonomy_manage` |

## 9. Backend modules

```text
src/routes/questionBankV3Routes.js
src/controllers/questionGroupController.js
src/modules/question-bank-v3/questionGroupService.js
src/modules/question-bank-v3/questionGroupRepository.js
```

Trách nhiệm:

- Route: khai báo endpoint và permission.
- Controller: nhận request, gọi service, trả response.
- Service: validate và xử lý rule nghiệp vụ.
- Repository: query database, mapping `title` ↔ `name` và sinh mã.

## 10. Các thay đổi cần thực hiện so với code hiện tại

- Xóa API:

```http
GET /api/question-bank/question-groups/next-code
```

- Xóa service `previewNextCode`.
- Xóa repository `peekNextCode`.
- Xóa frontend call `previewManagedQuestionGroupCode()`.
- Xóa trường mã khỏi form tạo group.
- Không dùng query parameter `status`; chỉ dùng `statuses`.
- Backend filter chỉ xử lý `statuses`.
- Giữ backend tự sinh code khi POST create.
- Giữ trả `code` trong response sau khi tạo để danh sách có thể cập nhật.
- Không cho client gửi `code` trong create/update.

## 11. Acceptance criteria

- Admin mở form tạo group không thấy trường mã.
- Tạo group thành công dù request không có `code`.
- Backend tự sinh mã unique theo format `GRP-XX`.
- API không còn endpoint preview mã.
- API list chỉ nhận `statuses`, không nhận `status`.
- Lọc `statuses=ACTIVE,DRAFT` trả đúng hai trạng thái.
- Không xóa được group có question.
- Không chuyển group sang INACTIVE/DRAFT khi còn question ACTIVE.
- Group ACTIVE xuất hiện trong dropdown chọn group của question.
- Group DRAFT/INACTIVE không xuất hiện trong dropdown chọn group ACTIVE.
- Response API dùng `name`, không lộ khác biệt `title` của database.
