# A06 · P2 · Guard pipeline

## Mục tiêu
Mọi lượt gọi bị kiểm soát token, chi phí, ngân sách, đồng thời; có retry và model dự phòng.

## Đọc trước
`../SPEC.md` §3 bước 3–7, §4, §8. Runner từ A05.

## Làm
1. `guards/inputGuard.js`: `countTokens` của adapter; > `max_input_tokens` → `INPUT_TOO_LARGE` (message ghi số đếm/giới hạn).
2. `guards/costGuard.js`: `estimateMax` > `max_cost_per_call_usd` → `COST_CEILING`.
3. `guards/budgetGuard.js`: `monthSpent + estimate > monthly_budget_usd` → `QUOTA_EXCEEDED` (bỏ qua `mode='test'`).
4. `guards/limiter.js`: semaphore trong tiến trình theo `agent` (max_concurrency) và theo `connection` (mặc định 8,
   env `AI_CORE_PROVIDER_CONCURRENCY`); chờ quá 30s → `TIMEOUT`.
5. `guards/retry.js`: retry lỗi retryable tối đa `max_retries`, back-off 1s·2s·4s + jitter ±20%; tôn trọng
   `Retry-After` nếu có (tối đa 10s).
6. Fallback: hết retry ở model chính và version có fallback → chạy lại input-guard + cost-guard bằng giá model
   dự phòng, gọi dự phòng (cũng có retry). `used_fallback=true`.
7. Lắp vào runner theo đúng thứ tự §3; khi bị chặn ghi log `status='blocked'`, `cost_usd=0`.

## Test
`tests/ai-core-guards.test.js` (adapter fake, đồng hồ giả cho back-off): vượt input; vượt trần; hết ngân sách;
test mode bỏ qua ngân sách; 429 hai lần rồi thành công (attempts=3, chi phí cộng đúng); chính lỗi hết → fallback
thành công; fallback vượt trần → `COST_CEILING`; limiter giới hạn đúng số lượt song song.

## Xong khi
Test đạt; log của từng kịch bản có `status`, `error_code`, `attempts`, `used_fallback` đúng.
