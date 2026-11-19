# S02 · P0 · Kho lưu trữ riêng tư + upload, phiên bản

## Mục tiêu
Lưu file HTML an toàn (không bao giờ public) và quản lý phiên bản bất biến.

## Đọc trước
`../ARCHITECTURE.md` §3.1, §6, §7; `../SPEC.md` §2 (`sl_lecture_versions`), §3 (các route versions), §7.
`src/services/storageService.js` (`uploadBuffer`, `downloadBuffer`, `deleteFile`, mode `local`).

## Làm
1. `stores/blobStore.js`: `put(key, buffer, contentType)`, `get(key)`, `remove(key)`.
   - Mode R2: dùng `storageService`, prefix `SECURE_LECTURES_STORAGE_PREFIX`, không bao giờ tạo signed URL.
   - Mode local: ghi vào `storage/secure-lectures/` ở gốc repo. Thư mục này **nằm ngoài** `public/` và được thêm vào
     `.gitignore`.
   - Bản memory cho test.
   - Cache đọc LRU theo sha256 (tối đa 100 MB).
2. `services/htmlInspector.js`:
   - Kiểm tra: đuôi `.html`/`.htm`, ≤ `MAX_UPLOAD_MB`, UTF-8 hợp lệ, có thẻ `<html` hoặc `<body`. Sai thì
     `FILE_INVALID` / `FILE_TOO_LARGE`.
   - Trả `meta` (`slideCountGuess`, `externalHosts` từ src/href http(s), `hasAudio`).
3. `services/versionService.js`:
   - `createVersion(lectureId, file, {note, makeCurrent, userId})`: số version tăng dần trong transaction có khoá dòng
     lecture; key `secure-lectures/{lectureId}/v{n}-{sha8}.html`; ghi log `version_uploaded`.
   - `setCurrent`, `list`, `read(versionId)`.
4. Upload multipart bằng `multer` memoryStorage, giới hạn kích thước ở multer (trả 413 sớm).

## Không làm
Không chèn guard hay watermark (S06). Không UI.

## Test
`tests/secure-lectures-versions.test.js` (blobStore memory):
- file sai đuôi, quá cỡ, không phải HTML đều bị từ chối;
- 2 upload liên tiếp ra v1, v2; sha256 đúng; đọc lại đúng byte;
- `makeCurrent=false` không đổi bản đang dùng;
- `meta.externalHosts` bắt được fonts.googleapis.com.

## Xong khi
Upload thật ở local ghi file vào `storage/secure-lectures/…` và không truy cập được qua bất kỳ URL tĩnh nào.
