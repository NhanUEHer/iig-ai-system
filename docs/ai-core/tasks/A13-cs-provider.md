# A13 · P4 · Content Studio gọi AI Core, Từ điển chạy liền

## Mục tiêu
Bỏ mock: Content Studio gen bằng AI Core; Từ điển bóc từ rồi định nghĩa ngay, duyệt sau.

## Đọc trước
`src/modules/content-studio/generation/generationService.js`, `dictionary/` (service, worker),
`docs/content-studio/SPEC.md` §Dictionary; A12 mapping; `../SPEC.md` §3, §8.

## Làm
1. `generation/aiCoreProvider.js`: `generate(type, context)` → `aiCore.run(<agent key>, vars,
   {feature:'content-studio', refType:'cs_item', refId:itemId})` rồi map bằng A12. Đăng ký trong `PROVIDERS`;
   `CONTENT_STUDIO_PROVIDER=ai-core` là giá trị mặc định mới, `mock` vẫn giữ cho test/local.
2. Lỗi AI Core trong worker: lỗi không retryable (`COST_CEILING`, `QUOTA_EXCEEDED`, `INPUT_TOO_LARGE`,
   `CONFIG_MISSING`, `AUTH_FAILED`) → artifact `failed` ngay (không thử lại 3 lần), lưu `error` dạng
   `{code, message}`; lỗi retryable giữ cơ chế attempts hiện tại.
3. Từ điển chạy liền:
   - `enqueue` có dictionary → extract → **tự động** lưu danh sách và đẩy batch định nghĩa, không dừng ở
     `waiting_review`.
   - Gom câu thành batch ~8–12 chunk mỗi lượt (`cs.dict.define`), các batch chạy song song theo limiter.
   - Sau khi có kết quả, người dùng vẫn "Sửa danh sách từ": thêm chunk → chỉ gen chunk mới; xoá → xoá entry;
     sửa chunk → gen lại chunk đó. Không gen lại các chunk không đổi.
   - Cập nhật trạng thái tab Từ điển và UI tương ứng (bỏ bước bắt buộc "Lưu danh sách → Tạo từ điển"; nút "Sửa
     danh sách từ" vẫn còn).
4. Cập nhật `docs/content-studio/SPEC.md` mục Dictionary theo luồng mới.

## Test
Cập nhật `tests/content-studio-dictionary.test.js` + test mới với AI Core fake: chạy liền ra entries; thêm/xoá/sửa
chunk chỉ gen phần thay đổi; lỗi không retryable → failed ngay với code.

## Xong khi
Test đạt; local với provider `mock` vẫn chạy như cũ; với `ai-core` + key thật (người review chạy) bài Letter gen đủ
4 tab.
