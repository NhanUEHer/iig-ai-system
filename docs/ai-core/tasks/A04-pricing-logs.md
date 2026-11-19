# A04 · P1 · Pricing USD + ghi `aic_call_logs`

## Mục tiêu
Tính chi phí ước tính và thật theo USD, ghi log mọi lượt gọi với giá đã chụp.

## Đọc trước
`../SPEC.md` §2 (`aic_models`, `aic_call_logs`), §4, §9.

## Làm
1. `pricing/prices.js`: `getPrice(provider, model)` đọc `aic_models` (cache 60s, xoá cache khi lưu bảng giá).
   Model không có giá hoặc `disabled` → `CONFIG_MISSING`.
2. `pricing/cost.js` (hàm thuần): `estimateMax({inputTokens, maxOutputTokens, price})`,
   `actual({usage, price})`, `sumUsage([...])`. Kết quả `Number` USD, làm tròn 8 chữ số.
3. `usage/callLog.js`: `write(entry)` insert đủ cột §2; preview chỉ ghi khi `mode='test'` hoặc agent bật
   `log_payload` (cắt 20 KB); message lỗi cắt 500 ký tự. Không bao giờ throw ra ngoài (lỗi ghi log → console.error).
4. `usage/spend.js`: `monthSpent(agentId)` theo §4 (đầu tháng Asia/Ho_Chi_Minh), cache 30s, có `bump(agentId, cost)`
   để cộng ngay sau mỗi lượt.

## Test
`tests/ai-core-pricing.test.js`: công thức §4 với số cụ thể; cache input tính giá cache; nhiều lần retry/repair
cộng dồn; ranh giới tháng theo giờ VN (23:59 ngày cuối tháng UTC+7).

## Xong khi
Test đạt; ghi thử 1 log từ test DB (nếu có) đủ cột.
