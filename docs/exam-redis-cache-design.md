# Thiết kế Redis cache cho dữ liệu đề thi đã Publish

> Trạng thái: Bản đề xuất để review, chưa triển khai.
>
> Phạm vi: Publish đề thi, cache dữ liệu đề thi và API phục vụ web thi thử.
>
> Không thuộc phạm vi: lưu câu trả lời của thí sinh, chấm điểm, bảng xếp hạng và lịch sử phiên bản đề.

## 1. Mục tiêu

Sau khi một đề thi được kiểm tra hợp lệ và Publish:

1. PostgreSQL lưu snapshot hiện hành làm nguồn dữ liệu bền vững.
2. Redis lưu dữ liệu đã tối ưu cho web thi.
3. Web thi lấy dữ liệu theo từng bước thay vì tải toàn bộ đề ngay từ đầu.
4. Publish lại sẽ thay toàn bộ cache hiện hành của đề, không giữ lịch sử version nghiệp vụ.
5. Không truy vấn lại cây bảng Question Bank trong mỗi request làm bài.

Luồng đọc mục tiêu:

~~~text
Web thi
  → API thi
    → kiểm tra attempt/quyền truy cập
      → đọc Redis
        → trả payload của bước hiện tại

Redis cache miss
  → đọc published_snapshot từ PostgreSQL
    → dựng lại cache
      → trả payload
~~~

## 2. Nguyên tắc thiết kế

### 2.1 PostgreSQL là nguồn dữ liệu chuẩn

Redis chỉ là lớp tăng tốc. Mất Redis hoặc Redis restart không được làm mất đề đã Publish.

PostgreSQL phải giữ:

- Snapshot đề hiện hành.
- Trạng thái Publish của đề.
- Cấu trúc Section, Part và câu hỏi tại thời điểm Publish.
- Dữ liệu cần chấm điểm.
- Thông tin attempt của thí sinh.

### 2.2 Không lưu binary media trong Redis

Redis chỉ lưu:

- Media ID.
- Loại media.
- MIME type.
- Tên file.
- Thời lượng audio.
- URL API media hoặc thông tin đủ để backend sinh signed URL.

File audio, hình ảnh và video tiếp tục nằm trong local storage hoặc R2.

### 2.3 Tách dữ liệu delivery và grading

Không để đáp án đúng hoặc dữ liệu chấm trong payload có thể trả cho thí sinh.

~~~text
delivery cache → API web thi được phép đọc
grading cache  → chỉ backend chấm điểm được phép đọc
~~~

### 2.4 Tách cache theo bước làm bài

Không trả toàn bộ câu hỏi và media khi thí sinh vừa mở đề. Dữ liệu được chia theo:

1. Thông tin đề.
2. Cấu trúc Section/Part.
3. Danh sách câu hỏi trong Part.
4. Chi tiết từng câu hỏi.

Frontend được phép preload câu kế tiếp để tránh gián đoạn audio.

### 2.5 Không có version nghiệp vụ

Người dùng không quản lý lịch sử version và không rollback đề.

Hệ thống vẫn cần một `generationId` kỹ thuật ngắn hạn để Publish atomically. Đây không phải version đề và không hiển thị trên UI.

## 3. Cấu trúc Redis key

### 3.1 Con trỏ cache hiện hành

~~~text
exam:published:v1:{examId}:current
~~~

Giá trị là `generationId` hiện hành, ví dụ:

~~~text
01K8R7M6M8J7E9T7P6M5Q4N3B2
~~~

`v1` là phiên bản schema cache, không phải version đề thi.

### 3.2 Nhóm key của một generation

~~~text
exam:published:v1:{examId}:{generationId}:manifest
exam:published:v1:{examId}:{generationId}:structure
exam:published:v1:{examId}:{generationId}:part:{partId}:questions
exam:published:v1:{examId}:{generationId}:question:{questionId}
exam:published:v1:{examId}:{generationId}:grading
~~~

Trong đó `questionId` ở API thi là ID câu hỏi con được giao cho thí sinh. Payload vẫn chứa `parentQuestionId` để giữ quan hệ với câu hỏi lớn.

### 3.3 Index phục vụ xóa cache

~~~text
exam:published:v1:{examId}:{generationId}:keys
~~~

Kiểu dữ liệu: Redis Set chứa toàn bộ key thuộc generation. Set này giúp xóa generation cũ mà không dùng lệnh `KEYS` hoặc wildcard scan trên production.

## 4. Contract dữ liệu

Tất cả payload sử dụng camelCase, thời gian dùng giây và thứ tự dùng số nguyên bắt đầu từ `0`.

### 4.1 Manifest — thông tin chung của đề

Key:

~~~text
exam:published:v1:{examId}:{generationId}:manifest
~~~

Ví dụ:

~~~json
{
  "schema": "exam-delivery-v1",
  "exam": {
    "id": "exam-id",
    "code": "EX-MANAGED-SW06",
    "title": "Đề Speaking & Writing — 6 câu",
    "examType": "SPEAKING_WRITING",
    "description": "...",
    "introductionHtml": "<p>...</p>",
    "totalSections": 2,
    "totalParts": 2,
    "totalQuestions": 6,
    "totalDurationSeconds": 2013
  },
  "publishedAt": "2026-10-01T10:00:00.000Z"
}
~~~

Manifest không chứa câu hỏi hoặc đáp án.

### 4.2 Structure — cấu trúc Section và Part

Key:

~~~text
exam:published:v1:{examId}:{generationId}:structure
~~~

Ví dụ:

~~~json
{
  "examId": "exam-id",
  "sections": [
    {
      "id": "speaking-section-id",
      "title": "Speaking",
      "examMode": "RECORD_NON_STOP",
      "sortOrder": 0,
      "questionCount": 3,
      "configuredDurationSeconds": 213,
      "parts": [
        {
          "id": "speaking-part-id",
          "title": "Speaking Part 1",
          "sortOrder": 0,
          "questionCount": 3,
          "instructionHtml": "<p>...</p>",
          "instructionAudio": {
            "mediaId": "media-id",
            "durationSeconds": 6.2,
            "mimeType": "audio/mpeg"
          },
          "breakDurationSeconds": 5,
          "configuredDurationSeconds": 0,
          "actualDurationSeconds": 213
        }
      ]
    },
    {
      "id": "writing-section-id",
      "title": "Writing",
      "examMode": "WRITING_NON_STOP",
      "sortOrder": 1,
      "questionCount": 3,
      "configuredDurationSeconds": 1800,
      "parts": [
        {
          "id": "writing-part-id",
          "title": "Writing Part 1",
          "sortOrder": 0,
          "questionCount": 3,
          "instructionHtml": "<p>...</p>",
          "instructionAudio": null,
          "breakDurationSeconds": 0,
          "configuredDurationSeconds": 1800,
          "actualDurationSeconds": 1800
        }
      ]
    }
  ]
}
~~~

### 4.3 Danh sách câu hỏi của Part

Key:

~~~text
exam:published:v1:{examId}:{generationId}:part:{partId}:questions
~~~

Payload nhẹ, chỉ dùng để điều hướng và preload:

~~~json
{
  "examId": "exam-id",
  "sectionId": "section-id",
  "partId": "part-id",
  "examMode": "RECORD_NON_STOP",
  "questions": [
    {
      "id": "sub-question-id-1",
      "parentQuestionId": "parent-question-id-1",
      "number": 1,
      "sortOrder": 0,
      "questionType": "RECORD",
      "contentAudioDurationSeconds": 4.2,
      "questionAudioDurationSeconds": 3.1,
      "preparationDurationSeconds": 10,
      "recordingDurationSeconds": 30
    }
  ]
}
~~~

Không chứa đáp án đúng, nội dung dài hoặc signed URL.

### 4.4 Chi tiết câu hỏi

Key:

~~~text
exam:published:v1:{examId}:{generationId}:question:{questionId}
~~~

Payload chung:

~~~json
{
  "id": "sub-question-id",
  "parentQuestionId": "parent-question-id",
  "sectionId": "section-id",
  "partId": "part-id",
  "number": 1,
  "sortOrder": 0,
  "questionType": "MCQ_SINGLE",
  "content": {
    "id": "content-id",
    "title": "...",
    "html": "<p>...</p>",
    "media": []
  },
  "promptHtml": "<p>...</p>",
  "questionMedia": [],
  "options": [
    { "id": "option-id", "key": "A", "text": "..." }
  ]
}
~~~

Media item:

~~~json
{
  "mediaId": "media-id",
  "type": "AUDIO",
  "mimeType": "audio/mpeg",
  "name": "question.mp3",
  "durationSeconds": 4.2,
  "accessPath": "/api/exam-attempts/{attemptId}/media/{mediaId}"
}
~~~

Không lưu signed URL dài hạn trong snapshot. API media kiểm tra attempt rồi redirect hoặc trả signed URL ngắn hạn.

### 4.5 Trường riêng theo dạng câu hỏi

Listening:

~~~json
{
  "questionType": "MCQ_SINGLE",
  "content": {
    "media": [{ "type": "AUDIO", "durationSeconds": 5.4 }]
  },
  "options": []
}
~~~

Reading:

~~~json
{
  "questionType": "MCQ_SINGLE",
  "content": {
    "html": "<article>...</article>",
    "media": []
  },
  "options": []
}
~~~

Speaking:

~~~json
{
  "questionType": "RECORD",
  "content": {
    "html": "<p>...</p>",
    "media": [{ "type": "AUDIO", "durationSeconds": 4.2 }]
  },
  "questionMedia": [{ "type": "AUDIO", "durationSeconds": 3.1 }],
  "preparationDurationSeconds": 10,
  "recordingDurationSeconds": 30
}
~~~

Writing:

~~~json
{
  "questionType": "WRITING",
  "content": { "html": "<p>...</p>", "media": [] },
  "promptHtml": "<p>...</p>",
  "minWordCount": 80,
  "maxWordCount": 300,
  "maxCharacterCount": 2000
}
~~~

### 4.6 Grading payload

Key:

~~~text
exam:published:v1:{examId}:{generationId}:grading
~~~

Chỉ service backend được đọc:

~~~json
{
  "examId": "exam-id",
  "questions": {
    "sub-question-id": {
      "parentQuestionId": "parent-question-id",
      "questionType": "MCQ_SINGLE",
      "partId": "part-id",
      "correctOptionKey": "B",
      "optionKeys": ["A", "B", "C", "D"],
      "points": 10
    }
  }
}
~~~

Speaking/Writing có thể chứa rubric ID hoặc grading-agent configuration khi nghiệp vụ chấm được chốt. Không đưa sample answer hoặc rubric bí mật vào delivery cache.

## 5. API phục vụ web thi

Các endpoint đều nhận `attemptId`, không cho client chỉ truyền `examId` để đọc tự do.

~~~text
GET /api/exam-attempts/:attemptId/manifest
GET /api/exam-attempts/:attemptId/structure
GET /api/exam-attempts/:attemptId/parts/:partId/questions
GET /api/exam-attempts/:attemptId/questions/:questionId
GET /api/exam-attempts/:attemptId/media/:mediaId
~~~

Backend phải kiểm tra:

- Attempt tồn tại và thuộc thí sinh hiện tại.
- Attempt đang ở trạng thái cho phép đọc.
- Chưa hết hạn.
- Part thuộc đề của attempt.
- Question thuộc Part và snapshot của attempt.
- Thứ tự truy cập phù hợp nếu chế độ thi không cho quay lại.

Response thành công giữ convention:

~~~json
{
  "success": true,
  "data": {}
}
~~~

## 6. Luồng Publish atomic

### 6.1 Các bước

1. Lock đề trong PostgreSQL.
2. Chạy validation đầy đủ.
3. Dựng published snapshot hoàn chỉnh từ DB.
4. Sinh `generationId` mới.
5. Dựng toàn bộ payload Redis trong memory.
6. Ghi tất cả key thuộc generation mới.
7. Ghi Set index `...:{generationId}:keys`.
8. Trong PostgreSQL transaction, thay `published_snapshot` và trạng thái đề.
9. Sau khi DB commit, atomically đổi key `current` sang generation mới.
10. Xóa generation cũ theo Set index.

### 6.2 Không để dữ liệu nửa cũ nửa mới

Web thi luôn đọc `current` trước, sau đó dùng đúng generation đó cho toàn bộ request.

Không được ghi đè lần lượt các key hiện hành mà không có generation, vì request có thể đọc manifest mới nhưng question cũ trong lúc Publish.

### 6.3 Redis lỗi khi Publish

Quy tắc đề xuất:

- PostgreSQL Publish thành công vẫn được xem là thành công.
- Nếu warm Redis lỗi, ghi log/metric và đánh dấu cần retry.
- Request đầu tiên có thể dựng lại cache từ `published_snapshot`.
- Không rollback PostgreSQL chỉ vì Redis tạm thời unavailable.

## 7. Luồng bắt đầu attempt

Khi thí sinh bắt đầu:

1. Xác định đề đang Publish.
2. Lưu snapshot hoặc tham chiếu generation hiện hành vào attempt.
3. Attempt đang làm phải tiếp tục dùng đúng dữ liệu đã nhận lúc bắt đầu.
4. Publish lại chỉ ảnh hưởng attempt tạo sau đó.

Khuyến nghị an toàn nhất:

- Tiếp tục lưu `question_snapshot` trong PostgreSQL của attempt.
- Redis tăng tốc delivery nhưng không thay thế snapshot của attempt.
- Attempt có thể lưu thêm `cache_generation_id` để đọc đúng generation trong suốt bài thi.

Không được để một attempt đang làm tự động chuyển sang generation mới.

## 8. Cache miss và self-healing

### Current key không tồn tại

1. Đọc published snapshot từ PostgreSQL.
2. Nếu đề chưa Publish: trả lỗi `EXAM_NOT_PUBLISHED`.
3. Acquire distributed lock theo `examId`.
4. Dựng lại generation.
5. Ghi Redis và cập nhật `current`.
6. Trả dữ liệu.

### Một key con bị thiếu

- Không dựng riêng key từ các bảng Question Bank đang thay đổi.
- Dựng lại toàn bộ generation từ published snapshot để đảm bảo nhất quán.

### Chống cache stampede

~~~text
exam:published:v1:{examId}:build-lock
~~~

Lock dùng `SET NX EX`, có token ownership và release bằng Lua compare-and-delete.

## 9. TTL và xóa cache

Đề đang Publish không nên phụ thuộc TTL ngắn.

Đề xuất:

- Dữ liệu generation: TTL 24 giờ và được refresh khi có truy cập, hoặc không TTL nếu dung lượng đã được kiểm soát.
- Build lock: 10–30 giây.
- Generation cũ: xóa ngay sau khi đổi `current`, có thể delay 5 phút để request đang chạy hoàn tất.
- Khi deactivate/xóa đề: xóa `current` và toàn bộ key của generation hiện hành.

Không dùng `FLUSHDB`, `KEYS exam:*` hoặc xóa wildcard trong runtime.

## 10. Preload phía frontend

Để tránh dừng trước khi phát audio:

- Khi vào Part, lấy danh sách câu hỏi.
- Lấy chi tiết câu hiện tại.
- Preload chi tiết và media của câu kế tiếp.
- Speaking chỉ bắt đầu countdown khi audio cần thiết đã sẵn sàng hoặc timeout nghiệp vụ đã được xử lý.
- Writing lấy toàn bộ nội dung câu khi vào Writing Part nếu chỉ có ít câu và payload nhỏ.

Preload không được bỏ qua kiểm tra attempt trên backend.

## 11. Bảo mật

- Không trả `correctOptionKey`, `isCorrect`, sample answer hoặc grading rubric bí mật qua delivery API.
- Không cho đọc question bằng `examId + questionId` công khai.
- Media endpoint phải xác minh media thuộc snapshot của attempt.
- Sanitize HTML trước khi lưu snapshot hoặc trước khi trả frontend.
- Redis đặt trong private network, bật authentication/TLS theo môi trường.
- Không ghi toàn bộ payload câu hỏi/đáp án vào application log.

## 12. Observability

Theo dõi tối thiểu:

- Cache hit/miss theo endpoint.
- Thời gian đọc Redis.
- Thời gian build generation.
- Kích thước manifest/structure/Part/question.
- Số lần fallback PostgreSQL.
- Số lỗi warm cache sau Publish.
- Số lần lock timeout/cache stampede bypass.

Log phải có:

~~~text
examId
generationId
attemptId nếu có
cacheKeyType
cacheResult HIT | MISS | REBUILD | BYPASS
durationMs
~~~

## 13. Giới hạn và kiểm soát dung lượng

- Một question payload nên dưới 100 KB khi không tính binary media.
- Structure không chứa nội dung câu hỏi dài.
- Danh sách Part questions chỉ chứa metadata điều hướng.
- HTML và options chỉ nằm trong question detail.
- Grading payload có thể là một JSON duy nhất vì backend thường cần chấm tổng hợp; nếu quá lớn mới tách theo question.

## 14. Thay đổi cần thực hiện so với code hiện tại

Code hiện tại cần được cập nhật trước khi dùng kiến trúc này:

1. Đổi cache lookup từ `versionId` sang `examId + generationId`.
2. Dựng payload theo Section thay vì flatten toàn bộ Part.
3. Không suy luận Listening/Reading từ tên Part.
4. Dùng `examMode` làm nguồn xác định hành vi.
5. Bổ sung Part instruction audio vào media query.
6. Bổ sung `breakDurationSeconds` cho Speaking.
7. Bổ sung `configuredDurationSeconds` cho Writing Part.
8. Bổ sung giới hạn từ/ký tự Writing.
9. Tách question detail khỏi Part question list.
10. Không cache signed URL dài hạn trong question snapshot.
11. Giữ grading payload tách biệt delivery payload.
12. Gắn attempt với generation/snapshot lúc bắt đầu.

## 15. Tiêu chí nghiệm thu

### Publish

- [ ] Publish tạo đầy đủ manifest, structure, Part index, question detail và grading cache.
- [ ] Publish lại không để request đọc trộn dữ liệu cũ/mới.
- [ ] Generation cũ được xóa an toàn.
- [ ] Redis lỗi không làm mất published snapshot trong PostgreSQL.

### LR

- [ ] Listening question trả content audio và thời lượng.
- [ ] Reading question không yêu cầu audio.
- [ ] Thứ tự Section, Part và câu hỏi chính xác.
- [ ] Delivery payload không có đáp án đúng.

### SW

- [ ] Speaking trả content audio, question audio, thời gian chuẩn bị và ghi âm.
- [ ] Speaking Part trả audio intro và thời gian nghỉ giữa câu.
- [ ] Writing Part trả thời gian làm bài.
- [ ] Writing question trả nội dung và giới hạn từ/ký tự.

### Attempt

- [ ] API từ chối Part/Question không thuộc attempt.
- [ ] Attempt đang làm không đổi đề khi quản trị viên Publish lại.
- [ ] Cache miss có thể khôi phục từ PostgreSQL snapshot.
- [ ] Media API không cho truy cập media ngoài snapshot.

## 16. Các quyết định cần review

1. Generation cũ xóa ngay hay giữ 5 phút để request đang chạy hoàn tất?
2. Generation payload dùng TTL 24 giờ hay không TTL?
3. Writing Part tải toàn bộ câu ngay khi vào Part hay vẫn tải từng câu?
4. Attempt lưu cả `question_snapshot` và `cache_generation_id`, hay chỉ lưu snapshot?
5. Media API trả stream trực tiếp hay redirect sang signed URL ngắn hạn?

