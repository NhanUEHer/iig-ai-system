# A07 · P2 · Tổng hợp ngày, sức khoẻ, cảnh báo

## Mục tiêu
Có số liệu nhanh cho màn danh sách/nhật ký và cảnh báo khi agent sắp hết tiền hoặc chất lượng kém.

## Đọc trước
`../SPEC.md` §2 (`aic_usage_daily`), §9, §10.

## Làm
1. `usage/daily.js`: `rollup(fromDay, toDay)` upsert `aic_usage_daily` từ `aic_call_logs` (idempotent, tính lại
   cả ngày). Job chạy mỗi giờ (rollup hôm qua + hôm nay), khởi động cạnh worker Content Studio trong
   `src/apps/admin/server.js`; tắt được bằng env `AI_CORE_JOBS=off`.
2. `usage/health.js`: `agentHealth(agentId)` và `listHealth()` theo bảng §10 → `{ level: 'ok'|'warn', label, metrics }`.
   `forecastMonth(agentId)`.
3. `usage/alerts.js`: khi `monthSpent ≥ threshold%` hoặc ≥100% ngân sách → tạo cảnh báo 1 lần/ngưỡng/tháng
   (bảng nhỏ `aic_alerts` trong migration mới `154_ai_core_alerts.sql`: agent_id, kind, month, created_at, UNIQUE).
   Gửi qua hệ thống notification hiện có nếu có hàm dùng chung; nếu không, chỉ lưu để UI hiện.
4. Dọn preview quá 30 ngày (§9) trong cùng job.

## Test
`tests/ai-core-usage.test.js`: rollup đúng tổng và p95; chạy 2 lần không nhân đôi; nhãn sức khoẻ theo từng ngưỡng;
cảnh báo chỉ tạo 1 lần mỗi ngưỡng/tháng.

## Xong khi
Test đạt; sau khi chạy demo vài lượt, `listHealth()` trả số liệu đúng.
