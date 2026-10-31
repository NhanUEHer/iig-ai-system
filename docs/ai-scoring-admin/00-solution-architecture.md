# Solution Architecture — AI Scoring Management Phase 1

## 1. Mục tiêu solution

Xây dựng AI Scoring Management như một module trong IIG Admin nhưng giữ AI Scoring là microservice độc lập. Module quản trị phải cho phép cấu hình kết nối, quan sát và vận hành mà không đưa scoring business logic hoặc quyền truy cập database/Redis sang IIG Admin.

Solution phải đáp ứng:

- hỗ trợ bài chỉ Speaking, chỉ Writing hoặc cả hai;
- hiển thị đúng scoring plan/run/question/group của từng immutable attempt;
- tenant/token/webhook được quản lý qua Admin API;
- operator action đi qua lifecycle command, không sửa trạng thái trực tiếp;
- API và worker health được quan sát độc lập;
- đủ tải cho vận hành hàng ngày mà không ảnh hưởng scoring workers.

## 2. Kiến trúc đề xuất

```text
Browser
  -> IIG Admin FE
  -> IIG Admin BE/BFF
       - session/JWT hiện tại
       - permission guard
       - AI Scoring admin client
       - response/error normalization
  -> AI Scoring Admin API
       - service authentication
       - admin authorization
       - controllers mỏng
       - admin services/read repositories
       - lifecycle command services
  -> PostgreSQL (source of truth)
  -> Outbox -> Redis Streams -> Workers
  -> External AI providers / tenant webhooks
```

### Nguyên tắc ownership

| Thành phần | Sở hữu |
| --- | --- |
| IIG Admin FE | UI, filter state, route, permission-based UX |
| IIG Admin BE | User auth, permission, BFF orchestration, service credential |
| AI Scoring Admin API | Tenant, credential, webhook, job read model, commands, monitoring |
| AI Scoring core/workers | Scoring plan và toàn bộ lifecycle |
| AI Scoring PostgreSQL | Durable state, audit, outbox, result lineage |
| Redis Streams | Transport có thể dựng lại, không phải source of truth |

## 3. Luồng request quản trị

### Read request

1. User gọi `/api/ai-scoring/*` bằng session IIG Admin.
2. BFF xác thực user và permission.
3. BFF gọi `/api/admin/v1/*` bằng service credential riêng, kèm actor/correlation ID.
4. AI Scoring đọc durable state và trả DTO đã redact.
5. BFF không cache secret và không diễn giải lại scoring status.

### Mutation request

1. FE lấy `available-actions` và yêu cầu operator nhập reason.
2. BFF sinh/chuyển idempotency key và actor context.
3. AI Scoring validate state trong transaction, persist mutation + audit + outbox.
4. API trả command result nhanh; external call chạy async qua worker.
5. FE refresh/poll status với backoff đến khi command terminal.

## 4. Hiện trạng và gap cần xây

### Đã có trong AI Scoring

- Public integration API create/read/result/retry tại `src/integrations/iig-integration.controller.ts`.
- Tenant/credential auth tại `src/integrations/integration-auth.repository.ts` và guard tương ứng.
- Job lifecycle tại `src/core/modules/iig-ingestion/scoringJobService.js` và repository.
- Scoring plan/completion tại `scoringPlan.js`, `scoringCompletionRepository.js`.
- Webhook worker/repository/projector tại `src/core/modules/integration-webhooks/`.
- Health API và worker process riêng.
- Migrations 121–136 cho ingestion, scoring, tenant, webhook, event delivery và plan-driven completion.

### Cần xây cho Phase 1

- Admin authentication/authorization riêng; không tái sử dụng tenant bearer token.
- `/api/admin/v1/*` controllers, services và read repositories.
- Lifecycle commands còn thiếu: cancel, rescore, reconcile và available-actions.
- Operator audit có actor/reason/outcome đầy đủ.
- Read model/dashboard/system monitoring APIs.
- IIG Admin BFF client/routes/controllers/services.
- IIG Admin FE feature module và navigation.

## 5. Code map đề xuất

### AI Scoring microservice

```text
src/admin/
  admin.module.ts
  admin-auth.guard.ts
  admin-context.ts
  tenants/
  credentials/
  webhooks/
  scoring-jobs/
  operations/
  monitoring/
  audit/

src/core/modules/
  integration-admin/        # repository/service nghiệp vụ tenant/credential
  integration-webhooks/     # mở rộng code hiện có
  iig-ingestion/            # reuse job lifecycle/read logic
  iig-ai-scoring/           # reuse plan/completion/run logic

src/core/database/migrations/
  137_*.sql trở đi           # chỉ append-only
```

Không thêm admin route vào `iig-integration.controller.ts`; controller đó là public tenant API và dùng tenant scopes.

### IIG Admin backend/BFF

```text
src/clients/aiScoringAdminClient.js
src/services/aiScoringAdminService.js
src/controllers/aiScoringAdminController.js
src/routes/aiScoringAdminRoutes.js
src/modules/ai-scoring/      # repository cục bộ chỉ khi cần audit/cache portal
```

Mount route trong `src/app.js` bằng `authenticate` và `requirePermission`. Controller mỏng; client chịu timeout, service chịu mapping/orchestration.

### IIG Admin frontend

```text
frontend/src/features/ai-scoring/
  api/
  components/
  hooks/
  pages/
  utils/
  ai-scoring.css
```

Thêm route/guard trong `frontend/src/App.jsx` và navigation trong `frontend/src/components/layout/Sidebar.jsx`. Không dồn implementation vào `App.jsx`.

## 6. Mô hình dữ liệu chính

```text
integration_tenants
├── integration_api_credentials
├── integration_webhook_endpoints
│   └── integration_webhook_deliveries
│       └── integration_webhook_attempts
└── iig_scoring_jobs
    ├── iig_submissions
    │   ├── iig_question_attempts
    │   ├── iig_ai_scoring_plans
    │   ├── iig_ai_section_statuses
    │   └── iig_ai_scoring_runs
    │       ├── iig_ai_question_runs
    │       ├── iig_ai_group_results
    │       ├── iig_ai_model_executions
    │       └── iig_ai_scoring_events
    ├── iig_processing_events
    └── ingestion/scoring outbox -> publications -> consumer inbox
```

Admin read API join/projection từ các bảng này. Không tạo bản sao job/result trong IIG Admin database.

## 7. Performance và capacity baseline

Các số dưới đây là **mục tiêu thiết kế Phase 1 cần xác nhận bằng load test**, không phải số đo production hiện tại.

### Giả định tải

- 50 admin users đồng thời.
- 10 read requests/second sustained, burst 30 RPS trong 30 giây.
- 2 mutation requests/second; mutation không chờ external provider.
- 1 triệu scoring jobs, 20 triệu event/question/group rows trong vòng retention online.
- Page size mặc định 25, tối đa 100.
- Dashboard tối đa 90 ngày; job list mặc định 24 giờ hoặc filter bắt buộc khi dữ liệu lớn.

### SLO đề xuất

| API | p95 | p99 | Ghi chú |
| --- | ---: | ---: | --- |
| Tenant/credential/webhook list | 500 ms | 1 s | Không tính external webhook test |
| Job list/facets | 800 ms | 1.5 s | Page <= 100 |
| Job overview/plan | 1 s | 2 s | Không tải transcript/media mặc định |
| Timeline/question tab | 1.5 s | 3 s | Lazy load, giới hạn page |
| Dashboard | 1.5 s | 3 s | Có aggregate/cache ngắn hạn |
| Mutation accept | 800 ms | 1.5 s | Chỉ durable transaction/outbox |
| System health | 1 s | 2 s | Dependency timeout riêng |

Error rate mục tiêu của Admin API dưới 1% (không tính 4xx hợp lệ). Admin traffic không được làm tăng p95 scoring worker DB claim quá 10% so với baseline.

## 8. Performance solution

### Query và index

- Mọi list query tenant/time scoped và có deterministic sort `(accepted_at DESC, id DESC)`.
- Dùng keyset/cursor cho deep pagination; nếu UI giữ `page`, giới hạn offset và chuyển export/large scan sang async.
- Tránh `COUNT(*)` toàn bảng trên mỗi refresh; dùng estimated/filtered count hoặc aggregate table khi cần.
- Job detail dùng một số query bounded theo một job; không N+1 theo question/group.
- Timeline phân trang theo `(created_at, id)`.
- Chỉ thêm index sau `EXPLAIN (ANALYZE, BUFFERS)` trên dữ liệu đại diện; migration append-only.

Index ứng viên:

- `iig_scoring_jobs(tenant_id, accepted_at DESC, id DESC)`;
- `iig_scoring_jobs(tenant_id, source_scoring_id, accepted_at DESC)`;
- partial index cho active/failed jobs theo `updated_at`;
- event tables theo owner + `(created_at, id)`;
- webhook delivery theo endpoint/status/available_at.

### API/BFF

- BFF timeout read 5 giây, mutation 10 giây; không retry mutation nếu thiếu idempotency key.
- Connection pooling; không tạo DB/HTTP client mỗi request.
- Propagate deadline/request ID giữa hai service.
- Dashboard/health có thể cache 5–15 giây theo filter; job mutation/detail không cache stale.
- Response compression chỉ cho payload đủ lớn; không trả raw model output/media.

### Frontend

- Lazy-load tab questions/timeline/model lineage.
- Debounce search 300–500 ms và cancel request cũ.
- Poll active job 5 giây rồi backoff tối đa 30 giây; dừng khi terminal/tab hidden.
- Virtualize bảng lớn; không render toàn bộ timeline/questions ngoài page.
- Không gọi riêng API cho từng row.

### Cách ly scoring workload

- Admin read connection pool có quota riêng hoặc statement timeout để không chiếm hết DB connections.
- Query dashboard nặng chạy trên aggregate/read replica khi có quy mô; Phase 1 không bắt buộc replica.
- Monitoring Redis có timeout ngắn và trả `unknown`, không block toàn dashboard.
- Admin mutation chỉ ghi durable state/outbox; không gọi model/webhook đồng bộ.

## 9. Security và resilience

- Service credential của BFF tách biệt tenant token, rotate được và chỉ có admin scopes.
- Deny-by-default cho Admin API; actor headers chỉ tin sau service authentication.
- Secret one-time responses dùng `Cache-Control: no-store` và redaction xuyên suốt.
- Circuit breaker/backoff cho BFF khi AI Scoring unavailable.
- SSRF protection bắt buộc cho webhook test/delivery.
- Mọi command có idempotency và row/advisory lock phù hợp để chống race.

## 10. Kế hoạch triển khai

1. **Foundation:** admin auth, permissions, service client, correlation/audit contract.
2. **Connection management:** tenant, credential, webhook endpoint/test/delivery.
3. **Read operations:** job list, detail, plan, attempts, timeline.
4. **Commands:** retry, cancel, rescore, reconcile, available-actions.
5. **Monitoring:** dashboard, process/dependency health, queue/error/alert.
6. **Performance hardening:** indexes, query plan, caching, load/soak/race tests.
7. **Beta rollout:** permission matrix, migration, smoke test, load test, operational runbook.

## 11. Test strategy và release gates

### Functional

- Unit tests cho validator, status derivation, action policy và redaction.
- Repository integration tests trên PostgreSQL thật.
- Contract tests BFF ↔ AI Scoring Admin API.
- Frontend interaction/accessibility tests.
- E2E onboarding account -> token -> webhook -> scoring job -> final delivery.

### Performance

- Seed tối thiểu 1M jobs/20M child-event rows hoặc dataset có distribution tương đương.
- Load 10 RPS read trong 15 phút và burst 30 RPS/30 giây.
- Soak 2 giờ với dashboard polling + job list/detail mix.
- Kiểm tra p95/p99, DB CPU, buffer reads, connection pool, lock wait và worker claim latency.
- Test webhook retry storm và queue backlog trong khi admin vẫn đọc được trạng thái.

### Concurrency/race

- Worker hoàn tất cùng lúc operator cancel/reconcile.
- Hai operator retry/rescore cùng idempotency hoặc khác idempotency.
- Token revoke trong lúc request đang authenticate.
- Webhook endpoint disable/rotate secret khi delivery đang retry.

### Gate trước Beta

- Full test suite pass; migration forward-only chạy được trên snapshot Beta.
- Không có query plan sequential scan ngoài trường hợp đã duyệt.
- SLO nêu trên đạt trên dataset đại diện.
- Không có secret/PII trong logs, audit hoặc response list.
- Worker/scoring throughput không giảm quá ngưỡng 10% dưới admin load.
