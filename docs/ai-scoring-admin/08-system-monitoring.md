# Module 08 — Monitoring queue, worker và lỗi

## Mục tiêu

Quan sát pipeline event-driven và phát hiện backlog/lỗi mà không cho admin thao tác trực tiếp với Redis.

## Solution đề xuất

AI Scoring cung cấp health/queue/error abstraction tổng hợp từ process, dependency, durable outbox và Redis transport. UI nhận trạng thái chuẩn hóa, có thể partial/unknown, thay vì truy cập hạ tầng trực tiếp.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/system/health` | Health các dependency/service |
| GET | `/api/ai-scoring/system/stages` | Throughput/error/latency từng stage |
| GET | `/api/ai-scoring/system/consumer-groups` | Consumer, pending, lag, stale count |
| GET | `/api/ai-scoring/system/errors` | Error events đã chuẩn hóa |
| GET | `/api/ai-scoring/system/alerts` | Alert đang mở và lịch sử |
| POST | `/api/ai-scoring/system/alerts/:alertId/acknowledge` | Ghi nhận đã tiếp nhận alert |

### AI Scoring Admin API tương ứng

`/api/admin/v1/system/health`, `/stages`, `/consumer-groups`, `/errors`, `/alerts`.

## Business rules

- Stage chuẩn: source fetch, source sync, media, question/context STT, answer STT, feature, question scoring, group scoring, finalization, webhook.
- Health phân biệt `healthy`, `degraded`, `unavailable`, `unknown`.
- Lag/pending đọc qua service abstraction; không trả Redis command hoặc cho xóa consumer từ UI Phase 1.
- Alert threshold cấu hình tại AI Service; UI chỉ hiển thị/acknowledge.
- Lỗi phân loại `SOURCE`, `MEDIA`, `STT`, `MODEL`, `DATABASE`, `QUEUE`, `WEBHOOK`, `INTERNAL` và retryable/non-retryable.
- Acknowledge không đóng lỗi gốc hoặc đánh dấu job completed.
- Log hiển thị phải redact candidate text, secret và URL query string.

## Màn hình

Route `/ai-scoring/system`:

- Dependency health cards.
- Pipeline stage table: active, queued, success/error rate, latency.
- Consumer group table: consumers, pending, lag, stale.
- Error explorer có filter category/code/stage/time/job.
- Alert list với severity, first/last seen, affected jobs, acknowledge state.
- Link từ error/alert sang job detail.

## Luồng nghiệp vụ

1. FE gọi BFF theo polling interval có backoff và nút refresh thủ công.
2. BFF gọi AI Scoring Admin API; không gọi thẳng Redis/PostgreSQL.
3. AI Scoring tổng hợp process health, dependency health, stream/consumer lag và durable queue state.
4. Alert engine tạo/ cập nhật alert theo fingerprint; acknowledge chỉ ghi nhận operator đã xem.
5. Error/alert liên kết về job detail bằng job/run/event IDs khi có thể xác định.

## Thiết kế dữ liệu

- Health hiện thời có thể tính runtime, nhưng alert history/acknowledgement phải persist.
- Durable queue dựa trên ingestion/scoring outbox và event publication/inbox.
- Redis consumer state chỉ là transport signal; PostgreSQL vẫn là source of truth.
- Cần lưu revision/image identity và expected worker count trong health response.
- Nếu bổ sung bảng alert, cần fields: fingerprint, severity, status, first/last seen, affected count, acknowledged actor/time/note.

## Performance/NFR

- Health response p95 <= 1 giây; dependency probe có timeout riêng và trả partial result.
- Polling mặc định 10–30 giây, có jitter/backoff; không tạo thundering herd từ nhiều admin tabs.
- Queue metric có cache ngắn và giới hạn số consumer/error rows trả về.
- Monitoring query/pool không được làm chậm worker claim quá 10% so với baseline.

## Task triển khai

- **AI Scoring:** health aggregator, queue/consumer adapter, error explorer và alert persistence.
- **Worker runtime:** readiness marker, startup failure exit và revision metadata.
- **IIG Admin BE:** BFF system endpoints, permission và safe timeout.
- **IIG Admin FE:** health cards, stage/consumer table, alert/error explorer và job links.

## Test cần có

- API healthy nhưng worker chết phải hiển thị degraded/unavailable.
- PostgreSQL/Redis/provider timeout trả đúng dependency status.
- Pending/lag/stale consumer mapping đúng và không cho UI xóa/claim trực tiếp.
- Alert deduplication, severity transition và acknowledge audit.
- Secret, candidate text và signed URL bị redact.
- Frontend polling backoff khi service lỗi và phục hồi khi healthy.

## Acceptance criteria

- AC1: Pending/lag khớp số liệu service và cập nhật định kỳ.
- AC2: Dependency down hiển thị degraded/unavailable, không giả `healthy` vì API portal còn sống.
- AC3: Error có stage, code, retryability và affected job khi xác định được.
- AC4: Không có secret/raw candidate answer trong monitoring API.
- AC5: Acknowledge lưu actor/time/note nhưng không thay đổi processing state.
- AC6: UI không cung cấp Redis delete/claim trực tiếp.

## Permission cần khai báo

- `ai_scoring.system.view`
- `ai_scoring.alerts.acknowledge`
