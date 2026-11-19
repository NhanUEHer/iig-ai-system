# S04 · P1 · API link chia sẻ

## Mục tiêu
Tạo link an toàn (token chỉ trả 1 lần), sửa, gia hạn, thu hồi; quản lý thiết bị ở mức dữ liệu.

## Đọc trước
`../ARCHITECTURE.md` §3.2, §4; `../SPEC.md` §2 (`sl_shares`, `sl_devices`), §3 (shares, devices, sessions/kick), §4.1.

## Làm
1. `services/tokenService.js`: `generate()` (32 byte base64url), `hash(token)` (sha256 hex), `isWellFormed(token)`
   (đúng 43 ký tự base64url). So sánh bằng `crypto.timingSafeEqual` khi cần.
2. `services/shareService.js`:
   - `create`: kiểm tra theo SPEC §4.1; trả `{share, token, url}`; log `share_created`.
   - `update`: không cho đổi token; cảnh báo khi giảm `maxDevices` bằng `data.warnings`.
   - `revoke`: kết thúc mọi phiên mở bằng `sessionStore.endAllForShare` (S05 hoàn thiện, ở đây gọi interface).
   - `computeStatus(share, now)`: `revoked|expired|scheduled|active` + cờ `expiring`.
   - `list` kèm `deviceCount`, `liveSessionCount`.
   - **Không** trả `token_hash` ra API.
3. Thiết bị: `listDevices`, `removeDevice`, `blockDevice`, `unblockDevice`; log tương ứng.
4. Route admin theo SPEC §3. Ghi `actor_user_id` vào log. `POST /sessions/:id/kick` để stub gọi `accessEngine.kick`
   (S05 cài đặt).
5. `PUBLIC_BASE_URL`: lấy env, nếu không có thì dựng từ `req.protocol` + `req.get('host')`
   (có `trust proxy` sẵn hay chưa thì kiểm tra).

## Test
`tests/secure-lectures-shares.test.js`:
- token trả 1 lần, DB chỉ có hash; GET danh sách không chứa token hay hash;
- `expiresAt` quá khứ hoặc > 365 ngày bị từ chối; `maxConcurrent > maxDevices` bị từ chối;
- bài lưu trữ hoặc chưa có version trả `LECTURE_NOT_READY`;
- `computeStatus` đúng ở 4 trạng thái và cờ `expiring`;
- thu hồi gọi `endAllForShare`;
- người chỉ có `view` không tạo được link.

## Xong khi
Tạo link bằng API, nhận URL dạng `/v/<43 ký tự>`, danh sách thể hiện đúng trạng thái.
