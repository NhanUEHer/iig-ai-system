# Module 09 — Permission declaration và audit

## Mục tiêu

Khai báo permission cần cho AI Scoring Management và đặc tả audit. Role đã tồn tại và không được thiết kế lại trong phạm vi này.

## Solution đề xuất

Áp dụng authorization hai lớp: IIG Admin kiểm tra permission của user, AI Scoring kiểm tra service identity/admin scope. Actor/correlation context được truyền xuyên service và mọi mutation sinh audit append-only đã redact.

## Permission cần khai báo

### Quan sát

- `ai_scoring.dashboard.view`
- `ai_scoring.jobs.view`
- `ai_scoring.jobs.view_detail`
- `ai_scoring.jobs.view_model_lineage`
- `ai_scoring.system.view`

### Quản trị cấu hình

- `ai_scoring.tenants.view`
- `ai_scoring.tenants.manage`
- `ai_scoring.credentials.view`
- `ai_scoring.credentials.manage`
- `ai_scoring.webhooks.view`
- `ai_scoring.webhooks.manage`

### Vận hành

- `ai_scoring.operations.retry`
- `ai_scoring.operations.rescore`
- `ai_scoring.operations.reconcile`
- `ai_scoring.operations.cancel`
- `ai_scoring.webhooks.replay`
- `ai_scoring.alerts.acknowledge`

### Xuất dữ liệu

- `ai_scoring.jobs.export`

Việc gán các permission trên vào role nào thuộc cấu hình role hiện hữu, không nằm trong đặc tả này.

## API audit

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/audit-events` | Tra cứu audit theo actor/resource/action/time |
| GET | `/api/ai-scoring/audit-events/:eventId` | Chi tiết thay đổi đã redact |

AI Scoring Admin API tương ứng: `/api/admin/v1/audit-events`.

## Business rules

- IIG Admin BE kiểm tra permission ở mọi API; ẩn menu chỉ là UX, không phải bảo mật.
- Audit append-only, không có API sửa/xóa.
- Mutation lưu actor IIG Admin, action, resource type/id, tenant, reason, request ID, before/after đã redact, timestamp và outcome.
- Không lưu API secret, webhook secret, access token, password hoặc candidate content đầy đủ trong audit.
- Read-only list/detail không cần audit từng lượt mặc định; export và xem model lineage nhạy cảm nên có access event nếu chính sách yêu cầu.
- AI Service ghi service-side audit; IIG Admin có thể lưu correlation ID để nối hai phía.

## Màn hình

Audit có thể là tab trong module thay vì trang cấp cao:

- Filter actor, action, resource, tenant, outcome, thời gian.
- Bảng timestamp, actor, action, target, outcome, request ID.
- Drawer before/after đã redact và correlation IDs.
- Không có edit/delete.

## Luồng nghiệp vụ

1. User đăng nhập IIG Admin bằng cơ chế hiện tại.
2. FE dùng permission chỉ để ẩn/hiện UI; BFF luôn kiểm tra lại permission.
3. BFF truyền actor ID, reason, request/correlation ID sang AI Scoring Admin API.
4. AI Scoring kiểm tra service identity/admin scope rồi thực hiện mutation.
5. Audit append-only được ghi cùng transaction hoặc qua outbox đáng tin cậy; thất bại audit không được âm thầm bỏ qua mutation nhạy cảm.

## Thiết kế database

- Tái sử dụng role/user/permission tables hiện có của IIG Admin cho quyền portal.
- AI Scoring cần audit store thuộc microservice, tối thiểu gồm actor, action, resource, tenant, reason, request ID, before/after redacted, outcome và timestamp.
- `iig_processing_events` phù hợp cho lifecycle event nhưng không thay thế đầy đủ operator audit nếu thiếu actor/outcome.
- Audit append-only; không FK cascade làm mất audit khi resource bị vô hiệu hóa.

## Performance/NFR

- Permission check tại BFF không query DB lặp lại cho từng component/request; dùng effective permissions của session với invalidation phù hợp.
- Audit write nằm trong transaction hoặc durable outbox, nhưng payload before/after phải bounded và redacted.
- Audit list dùng time range + pagination/index theo actor/resource/action/time.
- Không hy sinh audit để đạt latency; mutation phải fail rõ nếu invariant audit bắt buộc không thể đảm bảo.

## Task triển khai

- **IIG Admin:** khai báo permission, gán vào role hiện hữu, middleware/guard và menu/action guards.
- **BFF client:** service credential riêng, actor/correlation headers và deny-by-default.
- **AI Scoring:** admin service authentication, admin scopes và audit repository.
- **Frontend:** permission-denied state và audit list/detail đã redact.

## Test cần có

- Permission matrix cho viewer, operator và integration manager.
- Gọi API trực tiếp khi thiếu quyền vẫn 403 dù UI đã ẩn nút.
- Service credential tenant không gọi được Admin API.
- Mọi mutation thành công/thất bại sinh audit đúng actor/outcome.
- Audit không chứa token, webhook secret, password hoặc raw candidate payload.
- Audit không sửa/xóa được và correlation ID nối được hai service.

## Acceptance criteria

- AC1: Mọi API bị từ chối đúng 403 khi thiếu permission tương ứng.
- AC2: UI không hiển thị action thiếu quyền nhưng backend vẫn kiểm tra độc lập.
- AC3: Tạo/sửa/suspend/rotate/revoke/retry/rescore/reconcile/replay đều sinh audit event.
- AC4: Audit không chứa secret hoặc candidate payload đầy đủ.
- AC5: Audit event không sửa/xóa được qua API ứng dụng.
- AC6: Có thể truy từ thao tác portal sang request AI Service bằng correlation/request ID.
