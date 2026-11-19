# S05 · P2 · Bộ kiểm soát truy cập: thiết bị, phiên, heartbeat, đá phiên

## Mục tiêu
Đảm bảo **ở server** các giới hạn: hạn dùng, số thiết bị, số mở cùng lúc, kể cả khi 2 máy mở đồng thời.
Đây là task quan trọng nhất về bảo mật.

## Đọc trước
`../ARCHITECTURE.md` §3.3–3.5, §4; `../SPEC.md` §4.2–4.4, §5, §7. `src/config/redis.js`,
`src/modules/public-exam-events/attemptAnswerStore.js` (cách dùng redis + `configured()`).

## Làm
1. `stores/sessionStore.redis.js`:
   - ZSET `sl:share:{id}:sessions` (member = sessionId, score = ms heartbeat cuối);
     HASH `sl:session:{id}` (`shareId`, `deviceRef`, `deviceId`, `status`, `kickedBy`).
   - Lua script `acquire(shareId, deviceRef, maxConcurrent, now, ttl)`:
     1. dọn phiên chết;
     2. bỏ phiên cũ của cùng thiết bị;
     3. đếm; nếu đủ chỗ thì thêm phiên, ngược lại trả danh sách phiên sống.
   - `heartbeat`, `kick`, `end`, `endAllForShare`, `endAllForDevice`, `listLive`.
2. `stores/sessionStore.db.js`: fallback khi `!redis.configured()`, dùng `SELECT … FOR UPDATE` trên `sl_shares` và cột
   `last_heartbeat_at`. Cùng interface, cùng bộ test.
3. `stores/ticketStore`: Redis `SET sl:ticket:{t} … EX 60` + `GETDEL`; bản memory/DB fallback.
4. `services/accessEngine.js`: `open`, `takeover`, `heartbeat`, `end`, `kick` đúng thứ tự SPEC §4.2–4.4.
   - Ghi `sl_sessions` (cập nhật `last_heartbeat_at` tối đa mỗi 2 phút) và `sl_access_logs` (mọi lần từ chối có
     `reason`).
   - Cookie `sl_did`: đọc, hoặc cấp mới (`httpOnly`, `Secure` khi https, `SameSite=Lax`, `Path=/api/public/lectures`,
     400 ngày).
   - Nhãn thiết bị tạo từ UA (viết hàm parse nhỏ, không thêm thư viện nặng).
5. Route public `/session`, `/session/takeover`, `/heartbeat`, `/end`, `/event` + rate-limit SPEC §5
   (`rateLimitStore` Redis, fallback memory).
6. Lưu ý: `src/app.js` gọi `app.use(cors())` toàn cục **trước** mọi route, nên router public đang thừa hưởng CORS mở. Phải chặn
   CORS cho `/api/public/lectures/*` (ví dụ đặt middleware riêng trước `cors()` hoặc cấu hình `cors` theo path) và có test.
7. Cài `POST /sessions/:id/kick` (admin) và nối `shareService.revoke`, `removeDevice`, `blockDevice` để kết thúc phiên.

## Test
`tests/secure-lectures-access.test.js`, chạy cho **cả hai** store: memory-Redis giả và DB/pg-mem, hoặc đánh dấu skip
nếu không có DB:
- token sai, thu hồi, chưa tới hạn, hết hạn trả đúng mã;
- máy thứ 4 với `maxDevices=3` bị `DEVICE_LIMIT`; gỡ 1 máy thì máy 4 vào được;
- `maxConcurrent=1`: máy B mở khi A đang mở bị `CONCURRENT_LIMIT` kèm `liveSessions`;
  `takeover` thì A nhận `SESSION_KICKED` ở heartbeat;
- cùng máy mở 2 tab không bị coi là vượt (phiên cũ của máy bị thay);
- 10 lần `open` song song với `maxConcurrent=1` chỉ có 1 thành công;
- phiên không heartbeat quá 90 s được giải phóng;
- thu hồi khi đang mở thì heartbeat nhận `LINK_REVOKED`;
- rate-limit trả 429.

## Xong khi
Test đạt trên cả hai store; gọi tay bằng 2 trình duyệt (cookie khác nhau) đúng mọi kịch bản.
