# S10 · P4 · Kiểm thử E2E, checklist bảo mật, release

## Mục tiêu
Xác nhận toàn module chạy đúng từ đầu đến cuối và an toàn trước khi lên Beta/Production.

## Đọc trước
Toàn bộ docs module; `docs/PRODUCTION_RELEASE_CHECKLIST.md`, `docs/CI_CD.md`.

## Làm
1. Kịch bản E2E (Playwright nếu repo đã có, nếu không thì `node --test` + supertest + 2 cookie jar):
   1. admin tạo thư mục → upload → tạo link (3 thiết bị, 1 cùng lúc);
   2. máy A mở → máy B mở bị `CONCURRENT_LIMIT` → B đá A → A nhận `SESSION_KICKED`;
   3. máy C, D: D bị `DEVICE_LIMIT` → admin gỡ C → D vào được;
   4. admin thu hồi → phiên đang mở nhận `LINK_REVOKED`;
   5. link hết hạn (giả lập thời gian) → `LINK_EXPIRED`;
   6. ticket dùng lại → 404.
2. Checklist bảo mật (ghi kết quả vào `docs/secure-lectures/SECURITY_CHECKLIST.md`):
   - không URL công khai tới file;
   - token không có trong log hay DB;
   - header bảo mật đúng;
   - CORS public không mở;
   - người chỉ có `view` không ghi được;
   - upload HTML chứa `fetch` ra ngoài thì bị CSP chặn;
   - iframe không đọc được cookie admin;
   - rate-limit hoạt động.
3. Thêm biến env vào tài liệu deploy và `.env.example`; kiểm tra migration chạy trong pipeline; cập nhật `README.md`
   module (trạng thái "đã triển khai", ngày).
4. Hướng dẫn ngắn cho admin: `docs/secure-lectures/HUONG_DAN_SU_DUNG.md` (upload, tạo link, xử lý giáo viên báo
   "đủ thiết bị").

## Xong khi
E2E đạt trong CI; checklist ký đủ; deploy Beta và chạy thử với 1 giáo viên thật.
