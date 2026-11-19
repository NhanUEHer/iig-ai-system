# S01 · P0 · Khung module, migration, quyền, mã lỗi

## Mục tiêu
Có module `secure-lectures` rỗng nhưng chạy được: đủ bảng, quyền, mã lỗi và 2 router (admin + public) đã gắn vào app.
Mọi task sau xây trên khung này.

## Đọc trước
`../README.md`, `../ARCHITECTURE.md` §1–2, §5, `../SPEC.md` §2, §7.
Mẫu: `src/database/migrations/149_content_studio_foundation.sql` (cách thêm quyền), `src/modules/ai-core/errors.js`,
cách gắn route trong `src/apps/admin/app.js` và `src/app.js`.

## Làm
1. Migration `160_secure_lectures.sql` (số tiếp theo nếu 160 đã bị dùng): 7 bảng `sl_*` đúng SPEC §2 với CHECK, FK,
   UNIQUE, index. Idempotent (`IF NOT EXISTS`). Thêm 3 quyền `secure_lectures.view|manage|share` cho role `admin`.
2. Khung thư mục:
   ```
   src/modules/secure-lectures/
     index.js            export services + errors
     errors.js           SecureLectureError { code, httpStatus, data }; bảng mã SPEC §7; toHttp(err)
     config.js           đọc env ARCHITECTURE §6, có giá trị mặc định
     repositories/       (rỗng, S03+)
     services/           (rỗng, S02+)
     stores/             sessionStore, ticketStore, rateLimitStore: interface + bản memory (Redis ở S05)
   src/routes/secureLectureRoutes.js         admin, GET /health → { ok:true }
   src/routes/secureLecturePublicRoutes.js   public, chưa có route
   ```
3. Gắn `/api/secure-lectures` (authenticate) và `/api/public/lectures` (KHÔNG authenticate, không `cors()` mở)
   vào cả `src/apps/admin/app.js` và `src/app.js`.
4. `.env.example`: thêm các biến `SECURE_LECTURES_*` kèm mặc định, có chú thích.

## Không làm
Không upload, không UI, không đụng bảng Content Studio.

## Test
`tests/secure-lectures-foundation.test.js`: map mã lỗi → HTTP đúng bảng; `toHttp` với lỗi lạ trả 500 `UNKNOWN` và
không lộ message gốc; `config` đọc mặc định đúng.

## Xong khi
`npm test` đạt; migration chạy trên DB trống và DB hiện có; `GET /api/secure-lectures/health` trả 200 khi có quyền
`secure_lectures.view`, 403 khi không.
