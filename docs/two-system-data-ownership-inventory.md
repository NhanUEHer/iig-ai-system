# F3 — Data ownership inventory cho kiến trúc hai hệ thống

## 1. Trạng thái và phạm vi

- Trạng thái: **APPROVED**.
- Independent review date: **2026-11-14**.
- Admin baseline đã audit: `2af08544de55702faed4249017ce717d833092c1`.
- AI Scoring baseline đã audit: `3b1991f37780b9dfa620b09024620886d90a4dc0`.
- Phạm vi: ownership PostgreSQL, migration ledger, Redis, projection và các coupling giữa IIG Admin/Exam với AI Scoring.
- Không bao gồm: row count, dung lượng bảng hoặc checksum migration đang lưu trong Beta/Production DB. Các evidence này đang chờ truy vấn read-only theo môi trường.

## 2. Quyết định kiến trúc

Hai hệ thống có database, Redis và migration ledger độc lập:

1. **IIG Admin + Exam** sở hữu người dùng, phân quyền, ngân hàng câu hỏi, cấu hình kỳ thi, thí sinh, attempt và dữ liệu hiển thị quản trị.
2. **AI Scoring** sở hữu job ingestion, immutable snapshot đầu vào, media, transcription, scoring run, model execution, kết quả, retry, event delivery và integration credential.
3. Admin không đọc hoặc ghi trực tiếp bảng Scoring. Admin chỉ giữ `scoring_job_id` và projection tối thiểu để hiển thị.
4. Scoring không có foreign key sang bảng Admin. ID nguồn được giữ dưới dạng lineage value.
5. Trao đổi giữa hai hệ thống chỉ qua versioned API và signed webhook.

## 3. Migration ledger

### 3.1 Phát hiện từ exact Beta baselines

Không được ghép hai lịch sử migration theo số thứ tự. Các số migration trùng nhau nhưng có nội dung khác:

| Số | Admin baseline | Scoring baseline | Kết luận |
| --- | --- | --- | --- |
| 121 | Có cả Exam migration và `iig_scoring_ingestion_foundation` | `iig_scoring_ingestion_foundation` | File Scoring cùng checksum; namespace Admin đã collision |
| 122 | Có cả Exam migration và `iig_question_transcriptions` | `iig_question_transcriptions` | File Scoring khác checksum |
| 123 | `iig_ai_scoring_foundation` | `iig_ai_scoring_foundation` | Khác checksum |
| 124 | `iig_ai_evidence_execution_stages` | Cùng tên | Cùng checksum |
| 125 | `iig_speaking_completion` | Cùng tên | Cùng checksum |
| 126 | `ai_scoring_tenant_management` | `iig_context_transcriptions` | Cùng số, khác hoàn toàn ý nghĩa |
| 127 | Exam timing migration | `iig_ai_section_completion` | Cùng số, khác hoàn toàn ý nghĩa |
| 128 | Có credential migration và Exam compatibility migration | `iig_scoring_job_attempts` | Collision ngay trong Admin và khác Scoring |
| 129–137 | Admin operation/webhook migrations | Scoring recovery, auth, event và ownership migrations | Không tương thích theo số |
| 138–148 | Admin-side Scoring feature migrations | Không có trong baseline Scoring | Không được replay sang Scoring DB |

Checksum đáng chú ý dưới đây là SHA-256 tính trực tiếp từ file tại hai exact baseline, không phải suy luận rằng hai migration có hành vi tương đương:

- `121_iig_scoring_ingestion_foundation.sql`: giống nhau.
- `122_iig_question_transcriptions.sql`: khác nhau.
- `123_iig_ai_scoring_foundation.sql`: khác nhau.
- `124_iig_ai_evidence_execution_stages.sql`: giống nhau.
- `125_iig_speaking_completion.sql`: giống nhau.
- Admin `140_iig_question_resolution_contract.sql` và Scoring `131_iig_question_resolution_contract.sql` có cùng checksum tại hai baseline đã audit.
- Admin `143_iig_scoring_job_attempts.sql` và Scoring `128_iig_scoring_job_attempts.sql` có cùng checksum tại hai baseline đã audit.
- Admin `144_iig_plan_driven_completion.sql` và Scoring `136_iig_plan_driven_completion.sql` có cùng checksum tại hai baseline đã audit.

Hai file khác checksum luôn được xem là hai migration khác nhau, kể cả khi tên hoặc behavior quan sát được giống nhau. Không dùng behavioral equivalence để hợp thức hóa checksum mismatch.

### 3.2 Ledger chuẩn

| Hệ thống | Migration root | Ledger owner | Quy tắc |
| --- | --- | --- | --- |
| Admin + Exam | `src/database/migrations/` trong Admin repository | Admin migration owner | Chỉ chứa schema do Admin sở hữu; append-only |
| AI Scoring | `src/core/database/migrations/` trong Scoring repository | Scoring migration owner | Canonical baseline hiện tại là 121–137; append-only |

Sau khi contract được áp dụng:

- Không thêm migration Scoring mới vào Admin repository.
- Không sửa hoặc renumber migration đã áp dụng.
- Mọi compatibility fix phải là migration append-only mới trong đúng repository.
- Migration checksum phải được so với ledger thật ở Beta và Production trước cutover.
- Rollback sử dụng forward-compatible schema và previous image; không chạy down migration phá dữ liệu.

## 4. Table ownership matrix

| Data domain | Owner | Bảng/nhóm bảng đại diện | Consumer ngoài owner | Cách truy cập hợp lệ |
| --- | --- | --- | --- | --- |
| User, role, permission | Admin | `users`, roles, permissions | Scoring cần actor context | Header actor đã xác thực qua Admin BFF |
| Exam authoring và question bank | Admin | exam/question/group/config tables | Scoring cần snapshot để chấm | Payload tạo job hoặc source API versioned |
| Candidate và exam attempt | Admin | candidate, registration, attempt, answer | Scoring cần submission input | Payload/snapshot API; không FK xuyên DB |
| Scoring job và idempotency | Scoring | `iig_scoring_jobs`, `iig_scoring_job_idempotency_keys` | Admin hiển thị trạng thái | Scoring API + projection |
| Scoring input snapshot | Scoring | `iig_exam_*`, `iig_question_attempts`, source lineage | Không consumer trực tiếp | Scoring API result/detail có kiểm soát |
| Media và transcription | Scoring | `iig_media_assets`, transcription tables | Admin hiển thị chi tiết được phép | Signed/read API response; không direct storage path |
| Run, stage và model execution | Scoring | `iig_ai_scoring_runs`, question/group runs, model executions | Admin operations/audit | Admin Scoring API |
| Score và feedback | Scoring | question/group result records | Admin/Exam cần kết quả | Result API và terminal webhook |
| Retry, outbox, inbox và processing event | Scoring | `iig_*_outbox`, inbox, processing/scoring events | Admin audit/reconcile | Admin Scoring API |
| Integration tenant/credential | Scoring | `integration_tenants`, `integration_api_credentials` | Admin quản trị | Admin Scoring API; secret chỉ trả một lần khi tạo/rotate |
| Webhook endpoint/delivery/attempt | Scoring | `integration_webhook_*` | Admin quản trị/replay | Admin Scoring API |
| Admin webhook inbox | Admin | bảng mới `scoring_webhook_inbox` | Không | Nội bộ Admin transaction |
| Admin scoring projection | Admin | bảng mới `scoring_job_projection` | Admin FE, Exam result | Admin repository nội bộ |
| Admin audit | Admin | Admin audit tables | Admin operators | Admin API |
| Redis streams/cache | Scoring hoặc Admin riêng biệt | Prefix và instance riêng | Không dùng chéo | Chỉ process cùng hệ thống |

## 5. Data classification, minimization và lifecycle

| Data class | Ví dụ | Mức độ | Quy tắc tối thiểu | Retention/deletion |
| --- | --- | --- | --- | --- |
| Source snapshot | đề bài, cấu trúc câu hỏi, source lineage | Internal/confidential | Chỉ lưu trường cần tái lập lần chấm; không copy dữ liệu Admin không dùng cho scoring | Retention theo audit/regrade policy; xóa hoặc anonymize khi hết hạn và không còn legal hold |
| Candidate media | audio học viên, ảnh câu trả lời | PII/confidential | Object storage private, encryption at rest, signed URL ngắn hạn, không ghi URL vào log | TTL theo scoring/review policy; xóa object và metadata liên quan bằng deletion workflow có audit |
| Transcript | STT câu trả lời | PII/confidential | Chỉ service/permission cần thiết được đọc; không đưa nguyên văn vào telemetry | Không giữ lâu hơn media/appeal requirement; deletion phải cascade logic sang search/cache |
| Feedback và model output | điểm, nhận xét, lỗi, evidence span | Education record/confidential | Trả tối thiểu theo permission; raw provider payload không mặc định trả Admin | Retention theo result/audit policy; raw execution có TTL ngắn hơn normalized result nếu có thể |
| Webhook inbox | event envelope và projection input | Có thể chứa PII | Lưu payload tối thiểu; ưu tiên reference/summary, body hash; encrypt nếu giữ raw payload | Processed payload có TTL; giữ event ID/hash/status lâu hơn để deduplicate; deletion không phá dedup window |
| Credential/secret | API key, webhook secret | Restricted secret | Hash hoặc encrypt; plaintext chỉ trả một lần; cấm log/evidence | Revoke/rotate ngay; ciphertext cũ xóa sau overlap window và audit requirement |

Trước Production phải chốt số ngày cụ thể cho từng lớp dữ liệu với Product/Security/Legal. Cho đến khi được phê duyệt, không dùng `forever` làm retention mặc định. Deletion phải bao phủ PostgreSQL, object storage, cache, derived index và backup theo khả năng kỹ thuật đã công bố.

## 6. Projection tối thiểu trên Admin

`scoring_job_projection` chỉ nên chứa:

- `scoring_job_id` — khóa ngoại logic, không phải PostgreSQL FK xuyên DB.
- `tenant_code`, `keycode`, `source_scoring_id`.
- trạng thái tổng hợp: `status`, `ingestion_status`, `ai_scoring_status`.
- progress và summary đã sanitize.
- `last_event_id`, `source_updated_at`, `projected_at`.
- terminal result summary cần cho danh sách; detail đầy đủ đọc từ Scoring API khi cần.

`scoring_webhook_inbox` cần có:

- `event_id` unique, `event_type`, `schema_version`.
- hash của raw body, timestamp nguồn, thời điểm nhận.
- trạng thái xử lý, số lần xử lý và lỗi đã sanitize.
- payload JSON cần thiết cho replay nội bộ; retention policy phải được chốt trước Production.

Inbox insert và projection update phải nằm trong cùng transaction. Duplicate `event_id` là no-op thành công.

## 7. Cross-context coupling hiện tại

### P0 — phải loại trước cutover

- Admin baseline vẫn có toàn bộ Scoring schema và repositories query trực tiếp `iig_*`/`integration_*`.
- Admin-side AI Scoring app hiện thực `/api/admin/v1`, nhưng implementation này nằm trong Admin repository thay vì standalone Scoring repository.
- Standalone Scoring baseline chưa có `/api/admin/v1`; chỉ có public integration API.
- Chưa có Admin inbound webhook inbox và projection độc lập.

### P1 — cần thay bằng contract rõ ràng

- Scoring source worker đang gọi Admin proxy bằng session cookie.
- Scoring còn gọi một số legacy IIG endpoints để lấy source/question/media.
- Migration Scoring 137 đã bỏ foreign key legacy tới `ai_agents` nhưng vẫn giữ `agent_id` làm lineage; đây là pattern đúng cho các liên kết còn lại.

## 8. Kế hoạch chuyển đổi

1. Xác minh migration ledger/checksum thật trên Beta và Production bằng query read-only.
2. Chọn Scoring repository làm canonical owner của schema Scoring.
3. Port `/api/admin/v1` từ Admin prototype sang Scoring repository, giữ response compatibility.
4. Tạo Admin inbox/projection bằng migration Admin append-only.
5. Chuyển Admin FE/BFF sang API; bật telemetry phát hiện direct DB access.
6. Chạy reconciliation để backfill projection từ Scoring API.
7. Tắt legacy Scoring routes/workers và chặn write vào Scoring tables trong Admin DB.
8. Giữ legacy tables read-only trong observation window.
9. Drop/archive chỉ bằng change request destructive riêng sau khi xác nhận không còn reader/writer.

## 9. Validation checklist

### Migration ledger evidence đã xác minh

- [x] Admin Beta ledger đạt migration `148`.
- [x] Admin Production ledger đạt migration `147`.
- [x] AI Scoring Beta ledger đạt migration `137`.
- [x] AI Scoring Production ledger đạt migration `135`.

Drift hiện tại cần được xử lý bằng rollout append-only có kiểm soát:

- Admin Production thiếu migration `148` so với Admin Beta.
- AI Scoring Production thiếu migrations `136–137` so với AI Scoring Beta.
- Không suy luận rằng cùng số migration giữa Admin và Scoring là cùng nội dung; mỗi ledger vẫn độc lập theo mục 3.

Ledger evidence được xem là hoàn tất cho F3. Việc promote các migration còn thiếu thuộc release plan riêng, không được chạy chỉ dựa trên tài liệu này.

### Evidence vận hành deferred đến pre-production

Các evidence dưới đây cần hoàn thành trước Production readiness nhưng không chặn Phase 1 code implementation:

- [ ] Row count và latest-write timestamp của legacy Scoring tables trên Admin DB.
- [ ] Foreign-key inventory giữa Scoring-owned tables và Admin-owned tables.
- [ ] Query/log evidence xác định mọi direct reader/writer còn tồn tại.
- [ ] Redis key/stream prefix inventory và retention.
- [ ] Retention period, legal hold và deletion owner cho snapshot/media/transcript/feedback/inbox.

### Gate kỹ thuật

- [ ] Empty-database migration test pass riêng cho Admin và Scoring.
- [ ] Sanitized Beta-schema migration test pass.
- [ ] Previous image chạy được với schema mới trong rollback window.
- [ ] Admin runtime không có SQL tới Scoring-owned tables.
- [ ] Scoring schema không có FK tới Admin-owned tables.
- [ ] Duplicate webhook không tạo projection duplicate.
- [ ] Reconciliation sửa được missed/out-of-order event.
- [ ] Logs/evidence không chứa credential, PII, cookie hoặc signed URL.
- [ ] Deletion test chứng minh xóa khỏi DB/object/cache/index mà không phá audit/dedup requirement.

