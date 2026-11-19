# A02 · P0 · Mã hoá key provider trong DB

## Mục tiêu
Key Gemini/DeepSeek lưu trong `aic_connections`, mã hoá 2 chiều AES-256-GCM; đổi key không cần sửa code.

## Đọc trước
`../SPEC.md` §2 (`aic_connections`), §6.

## Làm
1. `src/modules/ai-core/providers/secrets.js`:
   - `encrypt(plainKey) → { ciphertext, iv, tag, last4, keyVersion }` (iv 12 byte ngẫu nhiên, AES-256-GCM).
   - `decrypt(row) → plainKey` (dùng master key theo `row.key_version`).
   - Đọc master key: `AI_CORE_MASTER_KEY_V{n}` + `AI_CORE_MASTER_KEY_CURRENT`, mặc định
     `AI_CORE_MASTER_KEY` = version 1. Sai độ dài (≠32 byte) → `CONFIG_MISSING`.
   - `isConfigured()`.
   - Cache key đã giải mã theo `connectionId:updated_at`, TTL 5 phút.
2. `src/modules/ai-core/providers/connectionStore.js`: `create`, `update` (nhận `apiKey` mới → mã hoá lại),
   `get(id)` (không có key), `getWithKey(id)` (chỉ dùng nội bộ runtime), `list()`; mọi hàm trả DTO có
   `apiKeyLast4`, **không bao giờ** có ciphertext hay key.
3. `scripts/ai-core-rotate-master-key.js`: giải mã bằng version cũ, mã hoá bằng version CURRENT, chạy trong
   transaction, in số dòng đã xoay (không in key).
4. Đảm bảo không có log nào in key (grep test).

## Test
`tests/ai-core-secrets.test.js`: mã hoá/giải mã vòng tròn; sửa 1 byte ciphertext/tag → lỗi; sai master key → lỗi;
xoay version 1→2 giải mã đúng; DTO không chứa trường key; `last4` đúng.

## Xong khi
Test đạt; tạo kết nối qua `connectionStore.create` lưu được, đọc lại `getWithKey` ra đúng key.
