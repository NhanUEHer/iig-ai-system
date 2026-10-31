# Module 03 — Quản lý API credential

## Mục tiêu

Sinh, rotate và thu hồi credential mà tenant dùng để gọi AI Scoring API.

## Solution đề xuất

Credential được sinh và xác thực hoàn toàn tại AI Scoring. Raw token chỉ đi qua response tạo/rotate một lần; BFF và FE không persist, còn database chỉ lưu hash/prefix/scopes và lifecycle metadata.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/tenants/:tenantId/credentials` | Liệt kê credential metadata |
| POST | `/api/ai-scoring/tenants/:tenantId/credentials` | Tạo credential và trả secret một lần |
| POST | `/api/ai-scoring/credentials/:credentialId/rotate` | Sinh secret mới |
| POST | `/api/ai-scoring/credentials/:credentialId/revoke` | Thu hồi credential |
| PATCH | `/api/ai-scoring/credentials/:credentialId` | Đổi tên, scope, expiry |

### AI Scoring Admin API tương ứng

Cùng resource dưới `/api/admin/v1/tenants/:tenantId/credentials` và `/api/admin/v1/credentials/:id/*`.

## Business rules

- Secret có entropy đủ mạnh, chỉ trả đúng một lần; DB chỉ lưu hash và prefix nhận diện.
- Credential luôn thuộc đúng một tenant.
- Scope credential không được vượt `allowedScopes` của tenant.
- Rotate tạo material mới; hỗ trợ khoảng overlap cấu hình được để client chuyển key an toàn.
- Revoke có hiệu lực ngay với request mới, không làm thất bại job đã được chấp nhận.
- Không đưa secret vào URL, log, audit payload hoặc analytics.
- Credential hết hạn/revoked trả 401/403 ổn định và không tiết lộ tenant tồn tại hay không.

## Màn hình

Credential nằm trong tab tenant:

- Bảng tên, prefix, scopes, trạng thái, createdAt, expiresAt, lastUsedAt.
- Modal tạo key: tên, scope, expiry.
- Màn hình secret một lần với cảnh báo và nút copy.
- Modal rotate/revoke yêu cầu xác nhận và lý do.
- Không có chức năng xem lại secret cũ.

## Luồng nghiệp vụ

### Tạo token

1. Admin chọn tenant, tên token, scopes và expiry.
2. AI Scoring sinh token bằng CSPRNG, chỉ lưu SHA-256 hash và prefix.
3. Raw token trả đúng một lần qua BFF; BFF không log/cache token.
4. FE hiển thị màn hình copy một lần rồi xóa token khỏi state khi đóng.

### Rotate/revoke

1. Admin nhập lý do và xác nhận.
2. Rotate tạo credential material mới; không thay hash trên record cũ.
3. Revoke đặt trạng thái và `revoked_at`, có hiệu lực với request mới.
4. Job đã accepted vẫn tiếp tục vì ownership đã gắn vào job/credential ID.

## Thiết kế database

Sử dụng `integration_api_credentials`:

- FK `tenant_id`, `name`, `token_prefix`, `token_hash`;
- `scopes[]`, `status`, `expires_at`, `last_used_at`, `revoked_at`;
- unique `token_hash`, index `(tenant_id, status)`.

`iig_scoring_jobs.credential_id` lưu credential đã tạo job để phục vụ lineage. Không bao giờ persist raw token.

## Performance/NFR

- List/create/revoke p95 <= 500 ms trong điều kiện DB bình thường.
- Hash token dùng SHA-256 lookup có unique index; không dùng plaintext scan.
- Cập nhật `last_used_at` không được tạo write hotspot trên mỗi request; throttle/batch nếu đo tải cho thấy cần thiết.
- Raw token response dùng `no-store` và không được cache ở BFF/browser persistence.

## Task triển khai

- **AI Scoring:** credential create/list/rotate/revoke service và scope validation.
- **Auth guard:** cập nhật `last_used_at` có kiểm soát và chặn expired/revoked/suspended tenant.
- **IIG Admin BE:** proxy response một lần, redaction bắt buộc và no-store headers.
- **IIG Admin FE:** modal tạo/rotate/revoke và one-time secret screen.

## Test cần có

- Token đúng scope gọi được; thiếu scope trả 403.
- Token revoked/expired hoặc tenant suspended bị từ chối.
- List/detail không trả `token_hash` hoặc raw token.
- Rotate tạo material khác, overlap đúng policy và không ảnh hưởng job đã nhận.
- Log/audit/error snapshot không chứa secret.
- Tenant A không đọc/tạo job của tenant B.

## Acceptance criteria

- AC1: Tạo key trả secret một lần và key gọi được endpoint đúng scope.
- AC2: GET list không bao giờ trả hash hoặc secret.
- AC3: Key revoked/hết hạn bị từ chối ngay.
- AC4: Rotate cho phép overlap theo cấu hình rồi vô hiệu key cũ đúng hạn.
- AC5: Key tenant A không đọc hoặc tạo job thuộc tenant B.
- AC6: Tạo, rotate, revoke đều có audit log nhưng không chứa secret.

## Permission cần khai báo

- `ai_scoring.credentials.view`
- `ai_scoring.credentials.manage`
