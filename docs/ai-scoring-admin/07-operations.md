# Module 07 — Thao tác vận hành

## Mục tiêu

Cho phép phục hồi có kiểm soát mà không sửa DB/Redis thủ công và không làm mất lineage.

## Solution đề xuất

Mỗi thao tác là một lifecycle command tại AI Scoring, được bảo vệ bằng state policy, lock, idempotency, transaction/outbox và audit. UI chỉ hiển thị action do backend trả về và không có endpoint set trạng thái tùy ý.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| POST | `/api/ai-scoring/jobs/:jobId/retry` | Tạo immutable retry attempt cho job failed |
| POST | `/api/ai-scoring/jobs/:jobId/rescore` | Tạo scoring run mới từ canonical input |
| POST | `/api/ai-scoring/jobs/:jobId/reconcile` | Khôi phục aggregate từ durable state/event |
| POST | `/api/ai-scoring/jobs/:jobId/cancel` | Hủy job chưa vào terminal |
| POST | `/api/ai-scoring/jobs/:jobId/replay-webhook` | Replay delivery final |
| GET | `/api/ai-scoring/jobs/:jobId/available-actions` | Action được phép theo state |

### AI Scoring Admin API tương ứng

Cùng command dưới `/api/admin/v1/scoring-jobs/:jobId/actions/*`.

Mọi command body có `reason` và `idempotencyKey`.

## Business rules

- UI không tự suy luận action; lấy `available-actions` từ AI Service.
- Operator retry chỉ áp dụng job terminal failed và tạo immutable attempt mới có lineage tới job nguồn. Automatic stage retry bên trong một attempt là cơ chế riêng của worker.
- Rescore tạo run mới, giữ nguyên result cũ và yêu cầu lý do.
- Reconcile chỉ dựng lại state từ durable DB/outbox/events; không gọi lại model nếu evidence đã đủ.
- Cancel là best-effort, không đảo ngược external call đã gửi; terminal job không cancel.
- Replay webhook không chạy lại scoring.
- Command trùng idempotency key không tạo thao tác lặp.
- Không có chức năng chỉnh trực tiếp score trong Phase 1.

## Màn hình

Không cần trang riêng; action panel nằm trong job detail:

- Danh sách action khả dụng và giải thích tác động.
- Modal nhập lý do và xác nhận.
- Cảnh báo rescore sẽ tạo external model calls mới.
- Trạng thái command đang xử lý.
- Lịch sử operator actions và kết quả.

## Luồng nghiệp vụ

### Retry

1. FE lấy `available-actions`, không tự suy luận theo badge.
2. Operator nhập reason; BFF gửi idempotency key.
3. AI Scoring khóa job/source identity, xác minh terminal failed và chưa bị supersede.
4. Service tạo job/attempt mới với `retry_of_job_id`, outbox mới và audit trong một transaction.

### Cancel

1. AI Scoring khóa attempt và kiểm tra chưa terminal.
2. Mark run/work item chưa terminal sang trạng thái cancel/fail hợp lệ; giữ completed evidence.
3. Dead-letter/cancel work còn pending và bảo đảm event đã publish sẽ no-op idempotently.
4. Roll up section/job terminal và ghi audit.

### Rescore và reconcile

- Rescore tạo run/attempt mới từ canonical input và version đã chọn; không overwrite result.
- Reconcile chỉ đọc durable plan/question/group rồi tính lại aggregate; không gọi provider khi evidence đã đủ.

## Thiết kế database

- `iig_scoring_jobs.retry_of_job_id` lưu lineage retry.
- `iig_scoring_job_idempotency_keys` chống duplicate command.
- Run type/number trong `iig_ai_scoring_runs` phân biệt production/retry/rescore.
- Outbox/publication/inbox bảo đảm mutation và event delivery idempotent.
- `iig_processing_events` và `iig_ai_scoring_events` lưu audit nghiệp vụ; audit operator bổ sung actor/reason/request ID.

Nếu chưa có command/audit table đủ để theo dõi trạng thái action async, bổ sung bằng migration append-only thay vì dùng log file.

## Performance/NFR

- Command accept p95 <= 800 ms vì chỉ thực hiện validation + durable transaction/outbox.
- Không gọi model, media processor hoặc webhook đồng bộ trong operator request.
- Lock scope theo job/source identity, transaction ngắn và có statement/lock timeout.
- Burst command/race không được tạo duplicate attempt, outbox hoặc audit event.

## Task triển khai

- **AI Scoring:** available-actions policy, retry/cancel/rescore/reconcile command services và transaction tests.
- **IIG Admin BE:** command routes, idempotency, reason validation và actor propagation.
- **IIG Admin FE:** action panel, confirmation modal, impact text và command result.
- **Workers:** mọi handler kiểm tra terminal/current version để event cũ không hồi sinh job.

## Test cần có

- Action matrix theo từng lifecycle status và permission.
- Hai command cùng idempotency key chỉ tạo một mutation.
- Retry tạo immutable attempt và chặn job active/superseded.
- Cancel giữ completed evidence và không còn active queue work.
- Rescore không thay đổi result cũ.
- Reconcile sửa aggregate lệch nhưng không phát sinh model call.
- Race tests giữa worker completion và operator command.

## Acceptance criteria

- AC1: Job healthy/completed không hiển thị retry không hợp lệ.
- AC2: Operator retry tạo đúng một immutable attempt mới, không ghi đè hoặc duplicate final result của attempt nguồn.
- AC3: Rescore tạo run mới có lineage tới run/job nguồn.
- AC4: Hai request cùng idempotency key chỉ tạo một command.
- AC5: Mọi command ghi actor, reason, before/after và request ID.
- AC6: Người chỉ có quyền xem không gọi được command bằng API trực tiếp.

## Permission cần khai báo

- `ai_scoring.operations.retry`
- `ai_scoring.operations.rescore`
- `ai_scoring.operations.reconcile`
- `ai_scoring.operations.cancel`
- `ai_scoring.webhooks.replay`
