# Đặc tả tính năng Quản lý đề thi

> Trạng thái: Bản mô tả nghiệp vụ đã cập nhật theo các rule được chốt.
>
> Phạm vi: Danh sách, tìm kiếm/lọc, thêm mới và cập nhật đề thi.
>
> Chưa thuộc phạm vi: Web thi, thang điểm, xem trước, nhân bản, lịch sử phiên bản và các chức năng vận hành khác.

## 1. Mục tiêu

Quản trị viên có thể tạo và biên soạn đề thi theo cấu trúc:

~~~text
Đề thi
└── Phần thi (Section)
    └── Part
        └── Câu hỏi lớn
            └── Câu hỏi con và đáp án
~~~

Phần thi và Part là hai cấp khác nhau:

- Phần thi đại diện cho kỹ năng và cách vận hành: Listening, Reading, Speaking hoặc Writing.
- Part là nhóm câu hỏi nằm trong một Phần thi.

## 2. Phạm vi chức năng

Tính năng chỉ gồm:

1. Danh sách đề thi.
2. Tìm kiếm và lọc đề thi.
3. Thêm mới đề thi.
4. Cập nhật thông tin đề.
5. Quản lý Phần thi.
6. Quản lý Part.
7. Chọn và sắp xếp câu hỏi.
8. Tính động thời gian thực.
9. Validate và publish đề.

Không triển khai:

- Xem trước đề.
- Nhân bản đề.
- Lịch sử phiên bản.
- Rollback phiên bản.
- Module thang điểm.
- Chi tiết hành vi trên web thi.

## 3. Use case 01 — Xem danh sách đề thi

### Mục tiêu

Xem các đề đã tạo và mở màn cập nhật.

### Dữ liệu hiển thị

~~~text
STT
Mã đề
Tên đề
Kiểu đề
Số Phần thi
Tổng số câu hỏi
Trạng thái
Ngày cập nhật
Thao tác
~~~

### Thao tác

- Mở đề để cập nhật.
- Chuyển trang.
- Chọn số dòng mỗi trang.

Không có thao tác xem trước, nhân bản hoặc xóa đề trong phạm vi hiện tại.

## 4. Use case 02 — Tìm kiếm và lọc đề thi

### Tìm kiếm

Tìm theo:

- Tên đề thi.
- Mã đề thi.

Tìm kiếm không phân biệt chữ hoa/thường và trim khoảng trắng đầu/cuối.

### Bộ lọc

- Trạng thái: Bản nháp, Hoạt động, Ngừng hoạt động.
- Kiểu đề thi: 6 kiểu đã chốt.

Cho phép kết hợp tìm kiếm và bộ lọc. Khi thay đổi điều kiện, quay về trang 1.

## 5. Use case 03 — Thêm mới đề thi

### Thông tin nhập

| Trường | Bắt buộc | Quy tắc |
|---|---:|---|
| Tên đề thi | Có | Tối đa 240 ký tự |
| Trạng thái | Có | Cố định Bản nháp |
| Kiểu đề thi | Có | Một trong 6 kiểu |
| Mô tả đề thi | Không | Tối đa 500 ký tự |
| Giới thiệu đề thi | Có | Rich text, tối đa 5000 ký tự |

Không nhập mã đề, thời gian tổng hoặc thang điểm tại đây.

### Sáu kiểu đề

| Mã | Nhãn |
|---|---|
| `LISTENING_READING` | Đề Listening & Reading |
| `READING` | Đề Reading |
| `LISTENING` | Đề Listening |
| `SPEAKING_WRITING` | Đề Speaking & Writing |
| `SPEAKING` | Đề Speaking |
| `WRITING` | Đề Writing |

### Luồng

1. Người dùng nhập thông tin.
2. Nhấn **Tạo đề thi**.
3. Backend sinh ID và mã đề.
4. Đề được lưu ở trạng thái Bản nháp.
5. Chuyển sang màn cập nhật.

## 6. Use case 04 — Cập nhật thông tin đề

Cho phép sửa:

~~~text
Tên đề thi
Trạng thái
Kiểu đề thi
Mô tả đề thi
Giới thiệu đề thi
~~~

Trạng thái:

~~~text
DRAFT       Bản nháp
ACTIVE      Hoạt động
INACTIVE    Ngừng hoạt động
~~~

Rule:

- Đề Hoạt động bị khóa chỉnh sửa.
- Muốn sửa phải chuyển sang Ngừng hoạt động.
- Không chuyển trực tiếp sang Hoạt động bằng form; phải dùng Publish.
- Khi đổi kiểu đề, các Phần thi hiện tại phải còn tương thích.
- Không tự động xóa hoặc đổi kiểu Phần thi.

## 7. Use case 05 — Xem cấu trúc đề

Tab Nội dung chi tiết hiển thị:

1. Danh sách Phần thi.
2. Danh sách Part của Phần thi được chọn.
3. Nội dung Part được chọn.
4. Danh sách câu hỏi của Part được chọn.

Một đề được phép có số lượng Phần thi tùy ý. Không giới hạn một Phần thi cho mỗi kỹ năng và không cấm hai Phần thi có cùng Kiểu thi.

## 8. Use case 06 — Tạo Phần thi

### Thông tin nhập

| Trường | Bắt buộc | Quy tắc |
|---|---:|---|
| Tên Phần thi | Có | Tối đa 150 ký tự |
| Kiểu thi | Có | Lọc theo Kiểu đề thi |
| Số câu hỏi | Có | Số câu hỏi con mục tiêu, số nguyên dương |
| Thời gian | Có | Thời gian cấu hình, lớn hơn 0 |
| Thang điểm | Không | Tạm thời để trống |

Thời gian hiển thị bằng component `HH:mm:ss`, nhưng API/DB lưu theo giây.

Database mở sẵn `score_scale_id` nullable để dùng sau.

### Bốn Kiểu thi

| Mã | Nhãn | Kỹ năng |
|---|---|---|
| `FREESTYLE` | Freestyle | Reading |
| `NON_STOP` | Non stop | Listening |
| `RECORD_NON_STOP` | Record non stop | Speaking |
| `WRITING_NON_STOP` | Writing non stop | Writing |

### Rule dropdown Kiểu thi

| Kiểu đề | Kiểu thi được chọn |
|---|---|
| Listening | Non stop |
| Reading | Freestyle |
| Listening & Reading | Non stop, Freestyle |
| Speaking | Record non stop |
| Writing | Writing non stop |
| Speaking & Writing | Record non stop, Writing non stop |

Rule phải được kiểm tra ở cả frontend và backend.

### Kết quả

- Phần thi được thêm vào cuối danh sách.
- Tự động chọn Phần thi vừa tạo.
- Có thể tiếp tục tạo Part.

## 9. Use case 07 — Cập nhật Phần thi

Cho phép cập nhật:

~~~text
Tên
Kiểu thi
Số câu hỏi
Thời gian cấu hình
scoreScaleId
~~~

Bản nháp luôn được phép lưu, kể cả khi:

- Số câu thực tế nhỏ hơn số cấu hình.
- Số câu thực tế lớn hơn số cấu hình.
- Thời gian thực khác thời gian cấu hình.

Không tự động thêm hoặc gỡ câu hỏi để khớp số lượng. Các sai lệch chỉ được validate khi Publish.

## 10. Use case 08 — Xóa Phần thi

Khi xóa Phần thi:

- Xóa Phần thi khỏi đề.
- Xóa toàn bộ Part thuộc Phần thi khỏi đề.
- Xóa toàn bộ quan hệ câu hỏi trong các Part đó khỏi đề.
- Không xóa câu hỏi gốc khỏi Ngân hàng câu hỏi.
- Không xóa trực tiếp file media vật lý đang được hệ thống quản lý.
- Thực hiện trong một transaction.
- UI yêu cầu xác nhận trước khi xóa.

## 11. Use case 09 — Sắp xếp Phần thi

- Kéo thả Phần thi.
- Gửi toàn bộ danh sách ID theo thứ tự mới.
- Backend kiểm tra không thiếu, không thừa, không trùng.
- Chuẩn hóa `sortOrder` liên tục từ 0.

## 12. Use case 10 — Tạo Part

Một Phần thi có nhiều Part. Part kế thừa Kiểu thi từ Phần thi.

Modal tạo chỉ có:

~~~text
Tên Part *
~~~

Rule:

- Bắt buộc.
- Tối đa 150 ký tự.
- Trim trước khi lưu.

Backend:

- Sinh ID.
- Gắn vào Phần thi đang chọn.
- Đặt cuối danh sách.
- Khởi tạo nội dung rỗng.

Sau khi tạo, tự chọn Part mới.

## 13. Use case 11 — Cập nhật Nội dung Part

### Các trường

| Trường | Bắt buộc khi lưu nháp | Quy tắc |
|---|---:|---|
| Hướng dẫn | Không | Rich text, tối đa 5000 ký tự HTML |
| Audio hướng dẫn | Không | MP3, tối đa 5 MB |
| Thời gian nghỉ giữa câu hỏi | Không | Mặc định 0 giây |

Không có trường nào trong ba trường trên là bắt buộc trước Publish.

### Audio hướng dẫn

- Upload để nhận `mediaId`.
- Hiển thị tên file, dung lượng, player và nút gỡ.
- Nhấn **Lưu** để gắn audio vào Part.
- Gỡ audio gửi `null`.
- Không lưu URL trực tiếp.
- Sau reload vẫn hiển thị audio đã lưu.

### Thời gian nghỉ

- UI hiển thị `HH:mm:ss`.
- API/DB lưu số giây.
- Không được âm.
- Giá trị 0 nghĩa là không nghỉ.

Nút **Lưu** cập nhật đồng thời toàn bộ Nội dung Part.

## 14. Use case 12 — Xóa Part

Khi xóa Part:

- Xóa Part khỏi Phần thi.
- Xóa toàn bộ quan hệ câu hỏi của Part khỏi đề.
- Không xóa câu hỏi gốc khỏi Ngân hàng câu hỏi.
- Không xóa trực tiếp file media vật lý.
- Thực hiện trong một transaction.
- UI yêu cầu xác nhận.

## 15. Use case 13 — Sắp xếp Part

- Kéo thả trong cùng một Phần thi.
- Chưa hỗ trợ kéo sang Phần thi khác.
- Backend kiểm tra Part thuộc đúng Phần thi.
- Chuẩn hóa `sortOrder` từ 0.

## 16. Use case 14 — Mở danh sách câu hỏi khả dụng

Backend xác định rule từ Kiểu thi của Phần thi chứa Part. Frontend không được truyền Kiểu thi tùy ý.

### Non stop — Listening

Chỉ hiển thị câu hỏi:

- Dạng `MCQ_SINGLE`.
- Trạng thái `ACTIVE`.
- Có đúng 1 content.
- Content có đúng 1 audio sẵn sàng.
- Có ít nhất 1 câu hỏi con.

### Freestyle — Reading

Chỉ hiển thị câu hỏi:

- Dạng `MCQ_SINGLE`.
- Trạng thái `ACTIVE`.
- Có ít nhất 1 content.
- Có ít nhất 1 câu hỏi con.
- Không bắt buộc audio.

### Record non stop — Speaking

Chỉ hiển thị câu hỏi:

- Dạng `RECORD`.
- Trạng thái `ACTIVE`.
- Có đúng 1 content.
- Content có audio sẵn sàng.
- Có ít nhất 1 câu hỏi con.
- Audio câu hỏi con là tùy chọn.

### Writing non stop — Writing

Chỉ hiển thị câu hỏi:

- Dạng `WRITING`.
- Trạng thái `ACTIVE`.
- Có ít nhất 1 content.
- Có ít nhất 1 câu hỏi con.
- Không bắt buộc audio.

## 17. Use case 15 — Thêm câu hỏi vào Part

1. Người dùng chọn một hoặc nhiều câu hỏi.
2. API kiểm tra lại rule khả dụng.
3. API kiểm tra câu hỏi chưa tồn tại trong đề.
4. Thêm toàn bộ batch vào cuối Part.
5. Trả cấu trúc và số liệu mới.

Trong trạng thái bản nháp, vẫn cho phép tổng số câu hỏi con vượt số lượng đã cấu hình của Phần thi. Chỉ cảnh báo trên UI; không chặn lưu.

Một câu hỏi lớn chỉ xuất hiện một lần trong toàn đề.

## 18. Use case 16 — Gỡ và sắp xếp câu hỏi

### Gỡ câu hỏi

- Chỉ xóa quan hệ với Part.
- Không xóa câu hỏi trong Ngân hàng câu hỏi.
- Cập nhật lại số câu thực tế và thời gian tính động.

### Sắp xếp

- Kéo thả trong cùng Part.
- Chưa hỗ trợ kéo trực tiếp sang Part khác.
- Chuẩn hóa thứ tự từ 0.

## 19. Use case 17 — Tính thời gian câu hỏi

Thời gian tính toán không lưu trong database.

Backend tính động từ dữ liệu nguồn mỗi lần đọc/validate để mọi thay đổi về audio hoặc thời gian Record được phản ánh ngay.

Chỉ áp dụng cho Listening và Speaking.

### Listening MCQ

~~~text
questionActualDurationSeconds
= thời lượng audio content
~~~

### Speaking Record

~~~text
questionActualDurationSeconds
= contentAudioDurationSeconds
+ SUM(
    subQuestionAudioDurationSeconds
    + preparationDurationSeconds
    + recordingDurationSeconds
  )
~~~

Rule:

- Audio content chỉ cộng một lần.
- Audio câu hỏi con không có thì tính 0.
- Thời lượng audio lấy từ metadata backend.
- Không tin duration do frontend gửi.

Reading và Writing không tính thời gian thực của câu hỏi.

## 20. Use case 18 — Tính thời gian Part

Chỉ áp dụng cho Part thuộc Listening và Speaking.

~~~text
N = số câu hỏi lớn trong Part
breakCount = MAX(N - 1, 0)

partActualDurationSeconds
= instructionAudioDurationSeconds
+ SUM(questionActualDurationSeconds)
+ breakCount * breakDurationSeconds
~~~

Rule:

- Audio hướng dẫn Part được cộng một lần.
- Nếu không có audio hướng dẫn, thời lượng bằng 0.
- Thời gian nghỉ tính giữa câu hỏi lớn, không tính giữa câu hỏi con.
- Không có khoảng nghỉ sau câu hỏi cuối.
- Part có 0 hoặc 1 câu hỏi không phát sinh thời gian nghỉ.
- Không lưu `partActualDurationSeconds` trong DB.

Reading và Writing không tính thời gian thực của Part.

## 21. Use case 19 — Tính thời gian Phần thi và đề thi

### Thời gian cấu hình

`configuredDurationSeconds` là thời gian người dùng nhập để hiển thị đẹp và làm mốc so sánh.

### Thời gian thực

Đối với Listening/Speaking:

~~~text
sectionActualDurationSeconds
= SUM(partActualDurationSeconds)
~~~

Đối với toàn đề:

~~~text
examConfiguredDurationSeconds
= SUM(section.configuredDurationSeconds)
~~~

Thời gian thực chỉ tổng hợp từ các Phần thi có hỗ trợ tính động:

~~~text
examActualDurationSeconds
= SUM(sectionActualDurationSeconds có giá trị)
~~~

Các giá trị actual đều tính động, không lưu DB.

### So sánh

API trả:

~~~text
configuredDurationSeconds
actualDurationSeconds
durationDifferenceSeconds
~~~

UI hiển thị cấu hình/thực tế để người dùng so sánh. Chênh lệch thời gian hiện chỉ là thông tin/cảnh báo, không chặn lưu hoặc Publish.

## 22. Use case 20 — Validate trước Publish

Chỉ tại thời điểm Publish mới áp dụng validation hoàn chỉnh.

### Thông tin đề

- Có tên, kiểu đề và giới thiệu.
- Kiểu đề hợp lệ.

### Phần thi

- Có ít nhất một Phần thi.
- Kiểu thi hợp lệ và tương thích với kiểu đề.
- Số câu cấu hình lớn hơn 0.
- Thời gian cấu hình lớn hơn 0.
- Tổng số câu hỏi con thực tế của tất cả Part bằng chính xác số câu cấu hình.
- Có ít nhất một Part.
- Chênh lệch thời gian chỉ trả cảnh báo, không chặn Publish.

### Part

- Có tên.
- Có ít nhất một câu hỏi.
- Thời gian nghỉ không âm.
- Hướng dẫn và audio hướng dẫn không bắt buộc.
- Audio đã gắn phải hợp lệ và sẵn sàng.

### Câu hỏi

- Đang `ACTIVE`.
- Không trùng trong đề.
- Đúng dạng và đúng rule content/audio theo Kiểu thi.
- MCQ có tối thiểu 2 đáp án và đúng 1 đáp án đúng.
- Record có thông số chuẩn bị/thu âm hợp lệ.
- Writing có giới hạn ký tự/số từ hợp lệ.

Nếu có lỗi, không Publish và trả danh sách lỗi gắn với đúng Phần thi, Part hoặc câu hỏi.

## 23. Use case 21 — Publish đề

1. Chạy validation.
2. Nếu lỗi, giữ nguyên trạng thái và hiển thị lỗi.
3. Nếu hợp lệ, tạo snapshot hiện hành.
4. Thay thế snapshot publish trước đó.
5. Chuyển đề sang `ACTIVE`.

Không quản lý lịch sử version, không rollback và không giữ nhiều snapshot publish.

Nếu câu hỏi nguồn thay đổi sau đó:

- Snapshot hiện hành không tự thay đổi.
- Người dùng vào cập nhật đề và Publish lại.
- Publish lại chạy validation mới và thay snapshot hiện hành.

## 24. Yêu cầu giao diện

- Màn tạo và cập nhật dùng component thống nhất.
- Nút Hủy có viền xám rõ; action nằm bên phải.
- Nội dung cuộn được đến hết.
- Phần thi và Part đang chọn có trạng thái rõ.
- Drag handle thống nhất.
- Upload phân biệt “đã tải” và “đã lưu”.
- Hiển thị số câu cấu hình/thực tế.
- Listening/Speaking hiển thị thời gian cấu hình/thực tế/chênh lệch.
- Các cảnh báo bản nháp không chặn thao tác lưu.

## 25. Tiêu chí nghiệm thu

### Danh sách

- [ ] Tìm kiếm theo tên/mã.
- [ ] Lọc theo trạng thái/kiểu đề.
- [ ] Phân trang và mở màn cập nhật.

### Thông tin đề

- [ ] Chỉ có 5 trường đã chốt.
- [ ] Có đúng 6 kiểu đề.
- [ ] Lưu được kiểu đề.

### Phần thi và Part

- [ ] Tạo nhiều Phần thi cùng kiểu nếu cần.
- [ ] Dropdown Kiểu thi lọc đúng.
- [ ] Bản nháp lưu được dù số câu chưa khớp.
- [ ] Tạo Part chỉ nhập tên.
- [ ] Lưu được hướng dẫn, audio và thời gian nghỉ.
- [ ] Xóa Phần thi/Part xóa toàn bộ quan hệ con khỏi đề.
- [ ] Sắp xếp được Phần thi và Part.

### Câu hỏi

- [ ] Bộ chọn áp dụng đúng rule theo Kiểu thi.
- [ ] Một câu hỏi không bị gắn trùng trong đề.
- [ ] Bản nháp cho phép vượt số câu cấu hình.
- [ ] Publish yêu cầu số câu thực tế bằng số cấu hình.

### Thời gian

- [ ] Listening tính từ audio content.
- [ ] Speaking cộng audio content, audio câu hỏi con, chuẩn bị và thu âm.
- [ ] Part cộng audio hướng dẫn và `(N - 1) × thời gian nghỉ`.
- [ ] N là số câu hỏi lớn.
- [ ] Actual duration không lưu DB.
- [ ] Thay đổi dữ liệu nguồn làm kết quả tính thay đổi ngay.
- [ ] Chênh lệch thời gian chỉ cảnh báo.

### Publish

- [ ] Validation trả lỗi đúng vị trí.
- [ ] Publish thay snapshot hiện hành.
- [ ] Không tạo lịch sử version.
- [ ] Câu hỏi nguồn thay đổi không tự làm đổi snapshot đã publish.

---

# Phụ lục kỹ thuật

## A. Dữ liệu lưu trữ

### exams

~~~text
id
exam_code
title
status
exam_type
description
introduction
published_snapshot
created_by
updated_by
created_at
updated_at
~~~

### exam_sections

~~~text
id
exam_id
title
exam_mode
question_count
configured_duration_seconds
score_scale_id NULL
sort_order
created_at
updated_at
~~~

### exam_parts

~~~text
id
section_id
title
instruction_html NULL
instruction_audio_media_id NULL
break_duration_seconds DEFAULT 0
sort_order
created_at
updated_at
~~~

### exam_part_questions

~~~text
id
exam_id
part_id
question_id
sort_order
created_at
UNIQUE (exam_id, question_id)
~~~

Không lưu:

~~~text
questionActualDurationSeconds
partActualDurationSeconds
sectionActualDurationSeconds
examActualDurationSeconds
durationDifferenceSeconds
~~~

## B. API chính

~~~http
GET    /api/v3/exams
POST   /api/v3/exams
GET    /api/v3/exams/:examId
PUT    /api/v3/exams/:examId

POST   /api/v3/exams/:examId/sections
PUT    /api/v3/exams/:examId/sections/:sectionId
DELETE /api/v3/exams/:examId/sections/:sectionId
PUT    /api/v3/exams/:examId/sections/reorder

POST   /api/v3/exams/:examId/sections/:sectionId/parts
PUT    /api/v3/exams/:examId/sections/:sectionId/parts/:partId
DELETE /api/v3/exams/:examId/sections/:sectionId/parts/:partId
PUT    /api/v3/exams/:examId/sections/:sectionId/parts/reorder

GET    /api/v3/exams/:examId/parts/:partId/available-questions
POST   /api/v3/exams/:examId/sections/:sectionId/parts/:partId/questions
DELETE /api/v3/exams/:examId/sections/:sectionId/parts/:partId/questions/:questionId
PUT    /api/v3/exams/:examId/sections/:sectionId/parts/:partId/questions/reorder

GET    /api/v3/exams/:examId/validation
POST   /api/v3/exams/:examId/publish
~~~

## C. Nguyên tắc triển khai

- Backend là nguồn tính số câu và thời gian.
- Actual duration luôn tính động.
- Bản nháp ưu tiên cho phép lưu.
- Publish mới áp dụng validation đầy đủ.
- Xóa cấu trúc dùng transaction.
- Publish thay snapshot hiện hành.
- Web thi và thang điểm được đặc tả sau.

