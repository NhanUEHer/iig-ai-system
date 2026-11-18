# A01 · P0 · Khung module, migration, quyền, mã lỗi

## Mục tiêu
Có module `src/modules/ai-core` rỗng nhưng chạy được, đủ bảng dữ liệu, quyền và bộ mã lỗi để các task sau xây lên.

## Đọc trước
`../README.md`, `../SPEC.md` §1, §2, §7 (quyền), §8. Mẫu migration quyền: `src/database/migrations/149_*.sql`.
Mẫu cấu trúc module: `src/modules/content-studio/`.

## Làm
1. Migration `153_ai_core_foundation.sql` tạo đủ 6 bảng §2 (`aic_connections`, `aic_models`, `aic_agents`,
   `aic_agent_versions`, `aic_call_logs`, `aic_usage_daily`) với CHECK, FK, UNIQUE, index như SPEC.
   - Ràng buộc: mỗi agent tối đa 1 version `draft` và 1 `published` (partial unique index).
   - Thêm quyền `ai_core.view`, `ai_core.manage`, `ai_core.run` cho role `admin` (cùng cách 149).
   - Seed `aic_models` cho 4 model (`gemini-2.5-flash`, `gemini-2.5-pro`, `deepseek-chat`, `deepseek-reasoner`)
     với giá = 0 và `status='disabled'`; admin nhập giá thật ở C5. **Không** seed key hay kết nối.
2. Khung thư mục:
   ```
   src/modules/ai-core/
     index.js          export { run, AiCoreError, ERROR_CODES } (run: ném CONFIG_MISSING tạm thời)
     errors.js         class AiCoreError extends Error { code, httpStatus, retryable, callId }
     routes/index.js   router /api/ai-core (chưa route nào ngoài GET /health → { ok, configured })
     agents/ runtime/ guards/ providers/ pricing/ usage/   (mỗi thư mục 1 file README ngắn hoặc index rỗng)
   ```
3. `errors.js`: bảng mã §8 (code → httpStatus, retryable). Hàm `toHttp(err)` trả `{status, body:{error:{code,message}}}`.
4. Gắn router vào app admin (cạnh route content-studio), dùng middleware auth + permission hiện có.
5. `.env.example`: thêm `AI_CORE_MASTER_KEY=` (ghi chú: 32 byte base64, sinh bằng
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`). Không thêm key provider.

## Không làm
Không gọi provider, không UI, không đụng bảng `ai_agents` cũ.

## Test
`tests/ai-core-foundation.test.js`: mã lỗi map đúng HTTP/retryable; `toHttp` cho lỗi lạ trả 500 `UNKNOWN`.
Migration: chạy được trên DB trống và DB hiện có (idempotent `IF NOT EXISTS`).

## Xong khi
`npm test` đạt; migration chạy; `GET /api/ai-core/health` trả `{ ok: true, configured: <có master key> }` khi đăng nhập
có `ai_core.view`.
