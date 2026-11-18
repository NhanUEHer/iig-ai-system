# A08 · P3 · Admin API: kết nối, bảng giá, nhật ký, chi phí

## Mục tiêu
Backend cho màn C4 và C5.

## Đọc trước
`../SPEC.md` §7 (connections, models, logs, usage), §6, §9. Store từ A02, log từ A04, usage từ A07.

## Làm
1. `routes/connections.js`: GET/POST/PATCH/check theo §7. Validate: provider hợp lệ, tên duy nhất, `apiKey`
   8–512 ký tự, `baseUrl` https. Response không bao giờ có key. `check` gọi `adapter.check`, lưu `last_check_*`.
2. `routes/models.js`: GET; PUT nhận danh sách `{provider, model, priceIn, priceCachedIn, priceOut, contextWindow,
   status}` — giá ≥ 0, ghi `effective_from=now()` khi giá đổi, xoá cache giá.
3. `routes/logs.js`: GET danh sách (lọc §7, keyset theo `(created_at,id)`, pageSize ≤ 100), GET chi tiết
   (preview chỉ với `ai_core.manage`), export CSV (tối đa 50.000 dòng, không có preview).
4. `routes/usage.js`: `{ month: {spent, budgetTotal, forecast}, days: [{day, cost, calls}], tokens: {...} }`
   cho 7/30 ngày, lọc theo agent.
5. Ghi audit (bảng audit hiện có nếu có) cho tạo/sửa kết nối và bảng giá: ai, lúc nào, trường nào (không ghi key).
6. Service FE `frontend/src/features/ai-core/services/aiCoreApi.js` cho các route này.

## Test
`tests/ai-core-admin-connections.test.js` (supertest hoặc kiểu test route hiện có): quyền view/manage;
DTO không lộ key; đổi key cập nhật last4; PUT bảng giá validate; logs phân trang ổn định; export đúng cột.

## Xong khi
Test đạt; gọi thử bằng curl có cookie đăng nhập local.
