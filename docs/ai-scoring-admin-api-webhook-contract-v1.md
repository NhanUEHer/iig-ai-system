# F4 — AI Scoring API và webhook contract v1

## 1. Trạng thái contract

- Trạng thái: **APPROVED / FROZEN v1**.
- Independent review date: **2026-11-14**.
- Public prefix chuẩn: `/api/v1`.
- Admin service prefix: `/api/admin/v1`.
- Admin internal webhook prefix: `/api/internal/v1`.
- JSON success convention: `{ "success": true, "data": ... }`.
- JSON error convention được định nghĩa tại mục 8.

Mọi thay đổi breaking sau khi contract được duyệt phải dùng version mới hoặc compatibility window được ghi rõ.

## 2. Authentication và actor context

### 2.1 Public integration API

- `Authorization: Bearer <tenant-credential>`.
- Credential được hash ở rest, có tenant, scopes, trạng thái và rate limit.
- Scopes v1:
  - `scoring:create`
  - `scoring:read`
  - `scoring:retry`
- Mọi lookup phải lọc theo tenant; không được trả `404`/data của tenant khác dựa trên ID đoán được.

### 2.2 Admin service API

- `Authorization: Bearer <admin-service-credential>`.
- Credential riêng theo môi trường; không dùng user JWT hoặc public tenant credential.
- Admin BFF chuyển actor context đã xác thực:
  - `X-Request-Id`
  - `X-Admin-Actor-Id`
  - `X-Admin-Actor-Email`
  - `X-Admin-Permissions` — danh sách permission đã lọc, phân cách bằng dấu phẩy.
- Scoring phải tự kiểm tra permission cho từng endpoint; header frontend gửi trực tiếp không được tin cậy.
- Actor context và operation reason được ghi audit nhưng không log credential.
- Mỗi service credential có tenant scope rõ ràng: danh sách `tenant_id`/`tenant_code` được phép hoặc cờ `all_tenants` chỉ dành cho service được phê duyệt riêng.
- Actor cũng phải được Admin xác nhận có quyền trên tenant mục tiêu. Quyền thực tế là giao của service credential tenant scope, actor tenant authorization và endpoint permission.
- Tenant lấy từ path/query/body phải được đối chiếu với resource tenant trong Scoring DB; caller không được đổi tenant bằng forwarded header.
- Thiếu tenant authorization trả `403 AI_SCORING_TENANT_FORBIDDEN`; không tiết lộ resource của tenant khác.

## 3. Public Scoring API

| Method | Endpoint | Scope | Idempotency | Kết quả |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/scoring-jobs` | `scoring:create` | Bắt buộc | `202 Accepted` |
| GET | `/api/v1/scoring-jobs/:jobId` | `scoring:read` | Không | `200` |
| GET | `/api/v1/scoring-jobs/:jobId/result` | `scoring:read` | Không | `200`, hoặc `409 SCORING_RESULT_NOT_READY` |
| POST | `/api/v1/scoring-jobs/:jobId/retry` | `scoring:retry` | Bắt buộc | `202 Accepted` |

Alias `/api/integrations/iig/scoring-jobs` được giữ trong compatibility window, phát deprecation telemetry và không được mở rộng tính năng mới.

### Ví dụ tạo job đã sanitize

```http
POST /api/v1/scoring-jobs
Authorization: Bearer ***
Idempotency-Key: job-demo-20261114-001
Content-Type: application/json

{
  "keycode": "DEMO0001",
  "scoringId": "source-score-001",
  "source": {
    "type": "IIG_ADMIN",
    "reference": "opaque-source-reference"
  }
}
```

```json
{
  "success": true,
  "data": {
    "jobId": "00000000-0000-4000-8000-000000000001",
    "keycode": "DEMO0001",
    "scoringId": "source-score-001",
    "status": "ACCEPTED",
    "replayed": false,
    "statusUrl": "/api/v1/scoring-jobs/00000000-0000-4000-8000-000000000001",
    "acceptedAt": "2026-11-14T00:00:00.000Z"
  }
}
```

## 4. Admin Scoring API

### 4.1 Job read endpoints

- `GET /api/admin/v1/jobs/facets`
- `GET /api/admin/v1/jobs`
- `GET /api/admin/v1/jobs/export`
- `GET /api/admin/v1/jobs/:jobId`
- `GET /api/admin/v1/jobs/:jobId/result`
- `GET /api/admin/v1/jobs/:jobId/available-actions`
- `GET /api/admin/v1/jobs/:jobId/attempts`
- `GET /api/admin/v1/jobs/:jobId/plan`
- `GET /api/admin/v1/jobs/:jobId/questions`
- `GET /api/admin/v1/jobs/:jobId/questions/:questionId`
- `GET /api/admin/v1/jobs/:jobId/groups/:groupId`
- `GET /api/admin/v1/jobs/:jobId/timeline`
- `GET /api/admin/v1/jobs/:jobId/pipeline`
- `GET /api/admin/v1/jobs/:jobId/model-executions`

### 4.2 Job operation endpoints

- `POST /api/admin/v1/jobs/:jobId/retry`
- `POST /api/admin/v1/jobs/:jobId/cancel`
- `POST /api/admin/v1/jobs/:jobId/rescore`
- `POST /api/admin/v1/jobs/:jobId/reconcile`
- `POST /api/admin/v1/jobs/:jobId/pipeline/:stepId/retry`

Mọi operation bắt buộc có `Idempotency-Key` và `reason`. Operation bất đồng bộ trả `202` cùng operation/job identity để poll.

### 4.3 Tenant và credential

- `GET|POST /api/admin/v1/tenants`
- `GET|PATCH /api/admin/v1/tenants/:tenantId`
- `POST /api/admin/v1/tenants/:tenantId/activate`
- `POST /api/admin/v1/tenants/:tenantId/suspend`
- `GET /api/admin/v1/tenants/:tenantId/audit-events`
- `GET|POST /api/admin/v1/tenants/:tenantId/credentials`
- `PATCH /api/admin/v1/credentials/:credentialId`
- `POST /api/admin/v1/credentials/:credentialId/rotate`
- `POST /api/admin/v1/credentials/:credentialId/revoke`

Secret plaintext chỉ được trả một lần khi create/rotate. List/detail chỉ trả prefix, scopes, status và timestamps.

### 4.4 Webhook management và audit

- `GET|POST /api/admin/v1/tenants/:tenantId/webhooks`
- `PATCH /api/admin/v1/webhooks/:webhookId`
- `POST /api/admin/v1/webhooks/:webhookId/rotate-secret`
- `POST /api/admin/v1/webhooks/:webhookId/test`
- `GET /api/admin/v1/webhook-deliveries`
- `GET /api/admin/v1/webhook-deliveries/:deliveryId`
- `POST /api/admin/v1/webhook-deliveries/:deliveryId/replay`
- `GET /api/admin/v1/audit-events`
- `GET /api/admin/v1/audit-events/:eventId`

## 5. Permission mapping

Ít nhất các permissions sau phải được enforce phía Scoring:

- `ai_scoring.jobs.view`, `view_detail`, `export`, `view_model_lineage`
- `ai_scoring.operations.retry`, `cancel`, `rescore`, `reconcile`
- `ai_scoring.tenants.view`, `manage`
- `ai_scoring.credentials.view`, `manage`
- `ai_scoring.webhooks.view`, `manage`, `replay`
- `ai_scoring.audit.view`

Service credential hợp lệ nhưng actor thiếu permission phải nhận `403 AI_SCORING_PERMISSION_REQUIRED`.

## 6. Idempotency contract

- Header `Idempotency-Key` dài 8–128 ký tự và bắt buộc cho mọi mutation không tự idempotent: create/retry/cancel/rescore/reconcile/step-retry, tenant create/state change, credential create/update/rotate/revoke, webhook create/update/rotate/test/replay.
- Unique key nằm trong namespace `(tenant_id, actor/service identity, HTTP method, canonical route template, operation type)`. Cùng chuỗi key ở namespace khác không va chạm.
- Server lưu request hash, operation, tenant, actor và response identity trong cùng transaction với durable command/outbox.
- Cùng key và cùng canonical payload: trả identity trước đó với `replayed: true`.
- Cùng key nhưng khác payload/operation: `409 IDEMPOTENCY_KEY_CONFLICT`.
- Retry do network timeout phải dùng lại key cũ.
- Không tái sử dụng key của create job cho cancel/rescore/reconcile.
- Với create/rotate secret, plaintext chỉ được phát sinh và trả trong response thành công đầu tiên. Replay idempotent không được trả lại plaintext; trả metadata, `replayed: true` và `secretRecoverable: false`. Nếu client mất response đầu tiên, phải thực hiện rotate mới bằng idempotency key mới.

## 7. Pagination, filtering và concurrency

- List endpoint dùng cursor bền vững; `limit` mặc định 50, tối đa 200.
- Filter và sort field phải allowlist; không chuyển trực tiếp query text vào SQL.
- Mutation có thể nhận `expectedVersion` hoặc `If-Match`; version lệch trả `409 OPERATION_STATE_CONFLICT`.
- Timestamp dùng UTC ISO-8601.

## 8. Error envelope

```json
{
  "success": false,
  "error": "Human-readable sanitized message",
  "code": "STABLE_MACHINE_CODE",
  "requestId": "request-id",
  "details": {}
}
```

Quy tắc:

- `details` chỉ xuất hiện cho lỗi client an toàn; không chứa stack, SQL, credential, cookie, signed URL hoặc provider raw payload.
- `401`: thiếu/sai authentication.
- `403`: thiếu scope/permission hoặc cross-tenant.
- `404`: resource không tồn tại trong scope caller.
- `409`: state, idempotency hoặc result-not-ready conflict.
- `422`: payload hợp lệ JSON nhưng vi phạm business validation.
- `429`: rate limited, có `Retry-After`.
- `5xx`: message generic trên Production, luôn có `requestId`.

## 9. Signed webhook từ Scoring sang Admin

### 9.1 Receiver

`POST /api/internal/v1/scoring-events`

Admin phải capture **raw request bytes trước JSON parsing**. Không stringify lại object để verify chữ ký.

Headers:

- `Content-Type: application/json`
- `X-IIG-Event-Id`
- `X-IIG-Event-Type`
- `X-IIG-Webhook-Id` — định danh endpoint/subscription, không phải secret
- `X-IIG-Key-Id` — định danh signing key/version đang hoạt động
- `X-IIG-Timestamp` — Unix seconds
- `X-IIG-Signature: v2=<lowercase-hex>` cho canonical contract mới

Signature:

```text
signed_payload = "v2\n"
  + X-IIG-Webhook-Id + "\n"
  + X-IIG-Key-Id + "\n"
  + X-IIG-Timestamp + "\n"
  + X-IIG-Event-Id + "\n"
  + raw_body_bytes
signature = "v2=" + hex(HMAC-SHA256(webhook_secret, signed_payload))
```

Receiver lookup subscription bằng `X-IIG-Webhook-Id`, sau đó lookup đúng key bằng `X-IIG-Key-Id`; không thử tuần tự mọi secret. Webhook/key không tồn tại, bị disable/revoked hoặc không thuộc subscription trả `401 WEBHOOK_KEY_UNKNOWN`. So sánh signature constant-time.

Khi rotate, key cũ chuyển `RETIRING` và được verify trong overlap window có thời hạn; delivery mới chỉ ký bằng key mới. Hết overlap, key cũ thành `REVOKED` và không còn được chấp nhận. Audit phải ghi key ID, không ghi secret.

Test vector cố định, chỉ dùng cho contract test:

```text
secret = test_secret_only_not_for_runtime
X-IIG-Webhook-Id = wh_test_001
X-IIG-Key-Id = key_test_001
X-IIG-Timestamp = 1794614400
X-IIG-Event-Id = evt_test_001
raw_body = {"eventId":"evt_test_001","eventType":"scoring.completed"}
X-IIG-Signature = v2=ea1eb61ef6a3f0d1bdc1357215fa9375e8d3281b12adeaa05d71900481a71bcb
```

Không thêm newline sau `raw_body`. UTF-8 bytes phải được ký đúng như nhận trên wire.

### 9.1.1 Compatibility với Beta signature cũ

Beta baseline hiện ký `v1=HMAC-SHA256(secret, timestamp + "." + rawBody)` và chưa bind webhook/key/event ID vào signing input. Không được thay đổi nghĩa `v1` im lặng.

- Legacy v1 chỉ được nhận tại receiver riêng: `POST /api/internal/v1/scoring-events/legacy/:endpointId`.
- `endpointId` là opaque, có entropy đủ lớn và ánh xạ server-side tới đúng một endpoint allowlisted cùng đúng một legacy secret. Receiver không nhận tenant/key identity từ body để chọn secret.
- Receiver lookup `endpointId` trước, lấy đúng một secret rồi verify raw-body v1. Unknown/disabled endpoint trả `401 WEBHOOK_LEGACY_ENDPOINT_UNKNOWN` trước khi parse hoặc tin bất kỳ tenant/resource field nào trong body.
- Tuyệt đối không thử tuần tự nhiều secret, không fallback sang secret tenant khác và không chuyển request legacy sang canonical receiver khi verify thất bại.
- Canonical receiver `/api/internal/v1/scoring-events` chỉ nhận v2; không dual-verify v1 trên cùng path.
- Scoring sender mới phát `v2`; `v1` chỉ dành cho retry delivery đã tạo trước cutover.
- Metrics tách `v1`/`v2`; legacy receiver được xóa khi pending legacy deliveries bằng 0.
- Hard decommission deadline của contract là `2026-12-15T00:00:00Z`. Sau thời điểm này legacy path luôn trả `410 WEBHOOK_LEGACY_RECEIVER_DECOMMISSIONED`; gia hạn cần change approval, threat review và deadline mới được ghi trước khi deploy.

### 9.2 Envelope và event types

```json
{
  "schemaVersion": "webhook-scoring-result-v1",
  "eventId": "00000000-0000-4000-8000-000000000002",
  "eventType": "scoring.completed",
  "occurredAt": "2026-11-14T00:05:00.000Z",
  "tenantCode": "IIG",
  "data": {
    "jobId": "00000000-0000-4000-8000-000000000001",
    "scoringId": "source-score-001",
    "keycode": "DEMO0001",
    "scores": [],
    "details": []
  }
}
```

Event types v1:

- `scoring.completed`
- `scoring.failed`
- `scoring.cancelled`

Unknown event type có schema hợp lệ được lưu inbox với trạng thái unsupported và trả `202` để tránh retry storm; alert phải được phát.

### 9.3 Replay, duplicate và transaction

- Reject timestamp ngoài skew window mặc định ±5 phút: `409 WEBHOOK_TIMESTAMP_OUT_OF_RANGE`.
- `X-IIG-Event-Id` phải trùng `eventId` trong body.
- `X-IIG-Event-Type` phải trùng `eventType` trong body; webhook ID và key ID phải thuộc cùng subscription.
- Event mới: insert inbox và update projection trong cùng transaction, trả `200`.
- Duplicate cùng `eventId` và cùng body hash: no-op, trả `200`.
- Duplicate cùng `eventId` nhưng khác body hash: `409 WEBHOOK_EVENT_CONFLICT` và alert security.
- Signature sai: `401 WEBHOOK_SIGNATURE_INVALID`.
- Không log raw body nếu có PII; log event ID, type, tenant và body hash.

### 9.4 Delivery retry từ Scoring

- Thành công: mọi `2xx`.
- Retry: network error, timeout, `408`, `425`, `429`, `5xx`.
- Permanent: phần lớn `4xx` khác; chuyển dead-letter với error đã sanitize.
- Exponential backoff có jitter, bounded attempts; hiện baseline dùng tối đa cấu hình 8 lần.
- Replay thủ công tạo attempt mới nhưng giữ original event identity/body.

## 10. Reconciliation contract

Webhook là notification, không phải nguồn sự thật cuối cùng. Scoring API là source of truth.

Durable change feed là contract bắt buộc:

- `GET /api/admin/v1/jobs/changes?cursor=<cursor>&limit=<n>` trả ordered changes và `nextCursor` bền vững.
- Cursor là opaque, monotonic theo change ledger và không phụ thuộc offset/table vacuum.
- Scoring phải giữ change ledger đủ lâu hơn maximum Admin outage/recovery objective đã phê duyệt.
- Cursor hết hạn trả `410 CHANGE_CURSOR_EXPIRED` cùng recovery procedure được audit.

Targeted repair bổ sung, không thay thế change feed:

- `POST /api/admin/v1/jobs/lookup` nhận tối đa 200 `jobIds` để sửa các job cụ thể từ alert/operator.
- Endpoint batch không được dùng làm full scan định kỳ hoặc làm nguồn cursor.

Yêu cầu:

- idempotent, tenant-aware và permission checked;
- có `sourceUpdatedAt`/version để chống event out-of-order;
- cùng một change có stable `changeId` để deduplicate; commit cursor chỉ sau khi projection transaction thành công;
- sửa projection bị thiếu hoặc lệch nhưng không ghi ngược trạng thái vào Scoring DB;
- có metrics: scanned, repaired, missing, failed và lag.

## 11. Compatibility và deprecation

- Public alias legacy được giữ ít nhất qua Beta soak và một Production observation window.
- Response field hiện có không bị đổi nghĩa trong v1; field mới là additive.
- Admin FE tiếp tục gọi same-origin `/api/ai-scoring/*`; Admin BFF proxy sang `/api/admin/v1/*`.
- Legacy direct-DB Admin routes không được fallback im lặng khi Scoring API lỗi.
- Deprecation cần telemetry theo caller, deadline và rollback plan.
- Production chỉ cutover khi không còn direct Scoring DB read/write từ Admin runtime.

## 12. Acceptance tests

### Public API

- [ ] Create/detail/result/retry happy path.
- [ ] Missing, invalid, revoked credential.
- [ ] Missing scope và cross-tenant access.
- [ ] Idempotent replay và conflicting replay.
- [ ] Rate-limit response và `Retry-After`.

### Admin API

- [ ] Service credential positive/negative tests.
- [ ] Mỗi permission có allow và deny test.
- [ ] Service credential tenant scope, actor tenant authorization và giao của hai lớp quyền.
- [ ] Cross-tenant path/query/body/resource mismatch đều bị deny mà không rò rỉ existence.
- [ ] Actor context xuất hiện trong audit.
- [ ] Mutation retry không tạo command/run trùng.
- [ ] Job mutation family: retry/cancel/rescore/reconcile/step-retry có replay-same-payload và conflict-different-payload tests.
- [ ] Tenant mutation family: create/update/activate/suspend có idempotency namespace, replay và conflict tests.
- [ ] Credential mutation family: create/update/rotate/revoke có idempotency namespace, replay và conflict tests.
- [ ] Webhook mutation family: create/update/rotate-secret/test/replay-delivery có idempotency namespace, replay và conflict tests.
- [ ] Replay của credential create/rotate và webhook create/rotate-secret không bao giờ trả lại plaintext secret; response phải có `replayed: true`, `secretRecoverable: false`.
- [ ] List pagination ổn định khi có concurrent inserts.

### Webhook

- [ ] Raw-body HMAC v2 test vectors cố định bao gồm webhook ID, key ID, timestamp, event ID và exact bytes.
- [ ] Unknown/mismatched/disabled/revoked webhook ID hoặc key ID.
- [ ] Rotation overlap: key mới ký, key cũ verify trong window, key cũ bị reject sau expiry.
- [ ] Legacy v1 path ánh xạ opaque endpoint ID tới đúng một allowlisted secret và không tin body tenant trước verify.
- [ ] Unknown/disabled legacy endpoint bị reject mà không parse business payload.
- [ ] Instrumented negative test chứng minh mỗi legacy request chỉ thực hiện một secret lookup/verification, không sequential attempts hoặc cross-tenant fallback.
- [ ] Legacy metrics/deadline và `410` sau `2026-12-15T00:00:00Z`.
- [ ] Invalid signature, stale timestamp và header/body event mismatch.
- [ ] Duplicate same body là no-op.
- [ ] Duplicate different body bị conflict.
- [ ] Inbox + projection rollback cùng nhau khi transaction lỗi.
- [ ] Out-of-order event không ghi đè version mới hơn.
- [ ] Retry classification và dead-letter/replay.

### Reconciliation và vận hành

- [ ] Missed webhook được reconciliation sửa.
- [ ] Durable cursor resume sau restart không bỏ sót/nhân đôi projection.
- [ ] Cursor expiry chạy recovery procedure và phát audit/alert.
- [ ] Batch lookup chỉ targeted repair, không thay thế change-feed consumption.
- [ ] Restart Admin giữa inbox insert và projection update không làm mất event.
- [ ] Restart Scoring worker giữa delivery claim và acknowledgment không tạo side effect trùng.
- [ ] Logs, traces và evidence không chứa secret, PII, cookie hoặc signed URL.
- [ ] Contract tests chạy giữa Admin client và exact Scoring API implementation.

