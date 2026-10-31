# Module 02 — Quản lý tenant

## Mục tiêu

Quản lý account của hệ thống tích hợp để cấp token và cấu hình webhook; không xây dashboard vận hành riêng theo từng tenant và không xây lại hệ thống role của IIG Admin.

## Solution đề xuất

Tenant được quản lý tập trung trong AI Scoring qua Admin API. IIG Admin cung cấp form/list và truyền actor context; mọi validation, status transition và isolation được enforce tại microservice.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/tenants` | Danh sách tenant |
| POST | `/api/ai-scoring/tenants` | Tạo tenant |
| GET | `/api/ai-scoring/tenants/:tenantId` | Chi tiết tenant |
| PATCH | `/api/ai-scoring/tenants/:tenantId` | Sửa metadata/cấu hình |
| POST | `/api/ai-scoring/tenants/:tenantId/activate` | Kích hoạt |
| POST | `/api/ai-scoring/tenants/:tenantId/suspend` | Tạm khóa |

### AI Scoring Admin API tương ứng

Cùng resource dưới `/api/admin/v1/tenants`.

## Dữ liệu chính

`code`, `name`, `status`, `environment`, `contactName`, `contactEmail`, `allowedScopes`, `rateLimit`, `metadata`, timestamps.

## Business rules

- `code` viết hoa, duy nhất, không đổi sau khi tạo.
- Tenant được xác định từ credential khi client gọi chấm; client không được tự truyền `tenantId` để đổi phạm vi.
- Suspend chặn request mới nhưng không hủy job đang chạy và không xóa lịch sử.
- Không xóa cứng tenant đã có job; Phase 1 chỉ hỗ trợ suspend.
- Giới hạn concurrency/rate limit phải được enforce tại AI Scoring Service, không chỉ tại UI.
- Thay đổi cấu hình phải có audit log trước/sau.

## Màn hình

### Danh sách tenant

- Search theo code/tên.
- Filter trạng thái.
- Cột code, tên, môi trường, trạng thái và số credential active.
- Hành động mở chi tiết, activate/suspend theo quyền.

### Chi tiết tenant

- Thông tin chung và liên hệ.
- Rate limit và scope được phép.
- Tab API keys.
- Tab webhook.
- Audit history liên quan tenant.

## Luồng nghiệp vụ

### Tạo account

1. Admin nhập code, tên, environment và rate limit.
2. BFF kiểm tra permission và gửi command tới AI Scoring Admin API.
3. AI Scoring validate uniqueness/rule, insert tenant trong transaction và ghi audit.
4. FE nhận metadata tenant; token chưa được tự sinh cho đến khi admin thực hiện chức năng tạo credential.

### Khóa/mở account

1. Admin nhập lý do và xác nhận.
2. AI Scoring đổi `ACTIVE <-> SUSPENDED` và ghi audit.
3. Tenant suspended không tạo request mới; job đã nhận tiếp tục theo lifecycle và lịch sử vẫn đọc được.

## Thiết kế database

Sử dụng bảng hiện có `integration_tenants`:

- `id`, `code`, `name`, `environment`, `status`;
- `rate_limit_per_minute`, `created_at`, `updated_at`;
- unique `code`; status chỉ `ACTIVE`, `SUSPENDED`, `DISABLED`.

Thông tin liên hệ/metadata chỉ bổ sung bằng migration append-only khi UI thực sự cần. Không lưu bản sao tenant trong DB IIG Admin.

## Performance/NFR

- List tenant p95 <= 500 ms, page mặc định 25 và tối đa 100.
- Số credential/webhook hiển thị bằng aggregate query, không N+1 từng tenant.
- Create/update/suspend transaction ngắn; không gọi webhook hay external provider trong request.
- Search code/name phải dùng index/phù hợp với quy mô, không wildcard scan không giới hạn.

## Task triển khai

- **AI Scoring:** tenant repository/service, validation, admin controller và audit hook.
- **IIG Admin BE:** BFF CRUD/activate/suspend, permission và correlation ID.
- **IIG Admin FE:** list, create/edit form, detail tabs credential/webhook và confirm suspend.
- **Database:** bổ sung metadata/contact bằng migration nếu được duyệt.

## Test cần có

- Tạo thành công, trùng code, code sai format và environment không hợp lệ.
- Suspend chặn create job mới nhưng không hủy job đang chạy.
- Activate khôi phục quyền gọi API.
- Tenant isolation và không hard-delete tenant có dữ liệu.
- Permission test view/manage; audit không chứa secret.

## Acceptance criteria

- AC1: Tạo tenant với code hợp lệ sinh đúng một tenant ở AI Service.
- AC2: Code trùng trả 409 ổn định, không tạo bản ghi phụ.
- AC3: Tenant suspended không thể tạo job mới nhưng xem job cũ được.
- AC4: Cập nhật không cho đổi `code` hoặc vượt giới hạn hệ thống.
- AC5: Danh sách phân trang/lọc chính xác và không chứa secret.
- AC6: Mọi mutation lưu actor, lý do và before/after trong audit.

## Permission cần khai báo

- `ai_scoring.tenants.view`
- `ai_scoring.tenants.manage`
