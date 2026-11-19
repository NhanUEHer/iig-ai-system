# S06 · P2 · Trang trình chiếu + phát nội dung + lớp bảo vệ

## Mục tiêu
Giáo viên bấm link là trình chiếu được ngay; nội dung chỉ đi qua ticket 1 lần; có watermark và lớp chặn thao tác.

## Đọc trước
`../SPEC.md` §4.4–4.6, §5, §7, §8; `../designs/SL5-ViewerStates.html`, `../designs/SL6-ViewerPresenting.html`.
Router FE trong `frontend/src/App.jsx` (cách khai báo route ngoài layout đăng nhập).

## Làm
1. Backend `services/contentService.js` + `GET /api/public/lectures/content/:ticket`:
   - Tiêu thụ ticket, kiểm tra cookie `sl_did` khớp.
   - Đọc blob, chèn meta, guard script và watermark theo SPEC §4.5–4.6. Guard và watermark viết thành file
     `assets/guard.js` và `assets/watermark.js` trong module, đọc 1 lần khi khởi động, chèn inline.
   - Gắn đủ header bảo mật. Ghi log `open_ok`.
2. Bảo đảm `apiAccessLogger` và log request **che token**: path `/v/*` và body `token` thành `***`.
3. Frontend route public `/v/:token` (không sidebar, không đăng nhập), `frontend/src/features/secure-lectures/viewer/`:
   - Trạng thái: đang kiểm tra → trình chiếu | các màn lỗi SPEC §7 đúng thiết kế SL5.
   - Màn `CONCURRENT_LIMIT`: liệt kê phiên đang mở (nhãn máy, giờ), nút "Đá thiết bị kia, mở ở đây" (gọi takeover)
     và "Thoát" (đóng, hiện "Bạn đã thoát").
   - Trình chiếu (SL6): thanh trên (tên bài, người nhận, hạn, trạng thái kết nối, Toàn màn hình), iframe
     `sandbox="allow-scripts allow-same-origin allow-fullscreen"`, `allow="fullscreen; autoplay"`, `src` = URL content
     từ ticket.
   - Heartbeat mỗi `heartbeatSec`. Mất mạng thì hiện "Đang kết nối lại", tối đa 3 lần rồi báo lỗi.
     Nhận 409/410/403 thì gỡ iframe ngay và hiện màn tương ứng.
   - `sendBeacon('/end')` khi `pagehide`.
   - Áp dụng guard ở cả trang cha (chặn phím, chuột phải, in).
   - Gửi `noindex` và `Referrer-Policy: no-referrer` (meta).
4. Xem trước cho admin `GET /api/secure-lectures/lectures/:id/versions/:vid/preview`: dùng cùng `contentService`,
   watermark "XEM TRƯỚC · {tên admin}", không tạo thiết bị hay phiên.

## Test
- `tests/secure-lectures-content.test.js`: ticket dùng lần 2 trả 404; cookie sai trả 404; HTML trả về chứa guard và
  watermark đúng vị trí (có/không có `<head>`); đủ header (`no-store`, CSP `frame-ancestors 'self'`, `connect-src 'none'`);
  tắt `guard_enabled` thì không chèn guard.
- Thủ công (ghi vào PR): mở file `index.html` mẫu, audio phát khi sang slide, phím mũi tên hoạt động, F12/Ctrl+U/
  Ctrl+S/Ctrl+P/chuột phải bị chặn, in ra trang trắng, watermark hiện.

## Xong khi
Link tạo ở S04 mở được trên Chrome, Edge, Safari; đúng mọi màn SL5; trình chiếu toàn màn hình mượt.
