# Module 04 — Webhook configuration và delivery

## Mục tiêu

Quản lý callback endpoint theo tenant, theo dõi delivery và gửi lại an toàn.

## Solution đề xuất

Webhook dùng durable delivery tables và worker riêng. Scoring completion chỉ tạo delivery trong transaction/outbox; việc ký, gửi, retry và dead-letter diễn ra bất đồng bộ, tách khỏi request chấm và Admin UI.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/tenants/:tenantId/webhooks` | Danh sách endpoint |
| POST | `/api/ai-scoring/tenants/:tenantId/webhooks` | Tạo endpoint + signing secret |
| PATCH | `/api/ai-scoring/webhooks/:webhookId` | Sửa URL/event/status |
| POST | `/api/ai-scoring/webhooks/:webhookId/rotate-secret` | Rotate HMAC secret |
| POST | `/api/ai-scoring/webhooks/:webhookId/test` | Gửi synthetic test event |
| GET | `/api/ai-scoring/webhook-deliveries` | Tra cứu delivery |
| GET | `/api/ai-scoring/webhook-deliveries/:deliveryId` | Chi tiết request/response an toàn |
| POST | `/api/ai-scoring/webhook-deliveries/:deliveryId/replay` | Gửi lại cùng event |

### AI Scoring Admin API tương ứng

`/api/admin/v1/tenants/:tenantId/webhooks`, `/api/admin/v1/webhook-deliveries`.

## Business rules

- Chỉ cho HTTPS; chặn localhost, private/link-local IP, redirect sang host cấm và DNS rebinding.
- Event Phase 1: `scoring.completed` và `scoring.failed`. Có thể bổ sung event tiến trình ở phase sau mà không đổi cơ chế ký/delivery.
- Payload ký HMAC trên raw body, kèm event ID và timestamp; secret chỉ hiển thị một lần.
- Delivery dùng event ID bất biến; receiver phải idempotent.
- Retry technical failure theo exponential backoff; 2xx là thành công, 4xx thường không retry ngoại trừ mã được cấu hình, 5xx/timeout retry.
- Replay tạo delivery mới nhưng giữ original event ID hoặc liên kết rõ với event gốc.
- Request/response body trong UI được truncate và redact secret/PII.

## Màn hình

### Webhook endpoints

- URL, status, subscribed events, secret prefix, lần giao gần nhất, success rate.
- Tạo/sửa, enable/disable, rotate secret, gửi test.

### Delivery log

- Filter tenant, endpoint, event type, status, job ID, thời gian.
- HTTP status, attempt, latency, next retry.
- Drawer chi tiết headers an toàn, payload, response rút gọn và lịch sử attempts.
- Nút replay theo quyền.

## Luồng nghiệp vụ

### Tạo và kiểm tra endpoint

1. Admin nhập tên, HTTPS URL và event types.
2. AI Scoring kiểm tra URL/SSRF, sinh signing secret và lưu ciphertext.
3. Secret trả một lần; FE cho phép copy rồi xóa khỏi state.
4. Action test tạo synthetic delivery riêng, không gắn vào scoring result thật.

### Delivery kết quả

1. Khi job terminal, scoring transaction tạo delivery/outbox bền vững cho endpoint active.
2. Worker claim delivery, ký raw body bằng HMAC kèm timestamp/event ID rồi gửi HTTP.
3. Mỗi lần gọi được ghi thành một attempt.
4. 2xx chuyển `DELIVERED`; timeout/5xx chuyển `RETRY`; hết budget chuyển `DEAD_LETTER`.
5. Replay tạo delivery attempt mới có lineage, không chạy lại scoring.

## Thiết kế database

- `integration_webhook_endpoints`: tenant, name, URL, event types, encrypted secret, status.
- `integration_webhook_deliveries`: endpoint/job/event, immutable payload, status, retry lease và lỗi cuối.
- `integration_webhook_attempts`: attempt number, timestamps, HTTP status, response excerpt và error.
- Existing unique keys bảo vệ duplicate endpoint name, event ID và delivery deduplication.
- Nếu rotate secret cần overlap, bổ sung version/validity table bằng migration; không ghi đè làm mất khả năng xác minh delivery đang retry.

## Performance/NFR

- Endpoint/delivery list p95 <= 800 ms với pagination bounded.
- Webhook test/delivery không giữ HTTP connection từ UI chờ retry; trả delivery ID và theo dõi async.
- Worker có concurrency/rate limit theo endpoint/tenant để tránh retry storm.
- Request timeout, response-size cap và retry budget phải cấu hình được; index claim queue theo status/available time.

## Task triển khai

- **AI Scoring:** endpoint CRUD, SSRF-safe validator, signing, delivery worker, retry/replay và admin queries.
- **IIG Admin BE:** BFF endpoint/delivery routes, secret redaction và permission.
- **IIG Admin FE:** endpoint list/form, one-time secret, test result và delivery drawer.
- **Security:** DNS rebinding tests, redirect validation và response-size limits.

## Test cần có

- URL hợp lệ/không hợp lệ, localhost/private IP, redirect sang host cấm và DNS rebinding.
- HMAC signature, timestamp tolerance và event ID ổn định.
- 2xx success; timeout/5xx retry; exhausted delivery dead-letter.
- Duplicate terminal event không tạo duplicate delivery.
- Test/replay không thay đổi scoring result.
- Secret/payload nhạy cảm được redact ở list, log và audit.

## Acceptance criteria

- AC1: Endpoint hợp lệ nhận test event có chữ ký xác minh được.
- AC2: URL nội bộ hoặc không HTTPS bị từ chối trước khi lưu/gửi.
- AC3: Timeout/5xx được retry đúng policy, không tạo event nghiệp vụ mới.
- AC4: Replay không thay đổi kết quả chấm và có audit log.
- AC5: Secret không xuất hiện trong list/detail/log.
- AC6: Delivery tenant A không hiển thị cho truy vấn tenant B.

## Permission cần khai báo

- `ai_scoring.webhooks.view`
- `ai_scoring.webhooks.manage`
- `ai_scoring.webhooks.replay`
