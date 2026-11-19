# Bài giảng bảo mật — Kiến trúc hệ thống

Đọc kèm [README.md](README.md) và [SPEC.md](SPEC.md).

## 1. Bối cảnh trong hệ thống hiện có

| Thành phần sẵn có | Dùng thế nào |
| --- | --- |
| Admin API Express (`src/apps/admin/app.js`, bản cũ `src/app.js`) | Gắn 2 router mới: admin (`/api/secure-lectures`, cần JWT) và public (`/api/public/lectures`) |
| `middleware/authenticate.js` (`authenticate`, `requirePermission`) | Bảo vệ toàn bộ route admin |
| PostgreSQL + migration (`src/database/migrations`) | Bảng `sl_*` |
| Redis (`src/config/redis.js`) | Phiên đang mở, heartbeat, khoá ngắn hạn, rate-limit |
| `services/storageService.js` (R2/S3, mode `local`) | Lưu file HTML trong prefix riêng tư `secure-lectures/` |
| Frontend React + Vite (`frontend/src`), design-system-v2 `--iig3-*` | Màn admin `/secure-lectures`, màn giáo viên `/v/:token` (không layout, không đăng nhập) |

Module **tách riêng hoàn toàn** với Content Studio và `learning-materials`: không dùng chung bảng hay quyền.
Chỉ dùng chung hàm thuần về cây thư mục ở FE (tách `folderTree.js` sang `frontend/src/utils/folderTree.js`).

## 2. Sơ đồ tổng thể

```text
┌──────────────── Admin (đã đăng nhập) ────────────────┐      ┌──────── Giáo viên (chỉ có link) ────────┐
│ FE /secure-lectures  (SL1–SL4)                       │      │ FE /v/:token  (SL5, SL6)                  │
└───────────────┬──────────────────────────────────────┘      └───────────────┬───────────────────────────┘
                │ JWT + secure_lectures.*                                     │ token + device cookie
                ▼                                                             ▼
┌─ L1 Admin API  /api/secure-lectures ─┐            ┌─ L1 Public API  /api/public/lectures ──────────────┐
│ folders · lectures · versions ·      │            │ session (mở) · heartbeat · takeover · end ·         │
│ shares · devices · sessions · logs   │            │ content/:ticket (trả HTML 1 lần)                    │
└───────────────┬──────────────────────┘            └───────────────┬────────────────────────────────────┘
                ▼                                                   ▼
┌─ L2 Service ──────────────────────────────────────────────────────────────────────────────────────────┐
│ folderService · lectureService · versionService · shareService · accessEngine · contentService        │
│ auditLog                                                                                               │
└───────┬───────────────────────────────┬──────────────────────────────┬───────────────────────────────┘
        ▼                               ▼                              ▼
┌─ L3 PostgreSQL (sl_*) ─┐   ┌─ L3 Redis ─────────────────────┐   ┌─ L3 Object storage ─────────────────┐
│ nguồn sự thật: thư mục,│   │ phiên đang mở (TTL), ticket    │   │ R2 bucket, prefix secure-lectures/, │
│ bài, phiên bản, link,  │   │ nội dung 1 lần, rate-limit,    │   │ KHÔNG public, chỉ server đọc         │
│ thiết bị, phiên, log   │   │ khoá chống đua                 │   │                                     │
└────────────────────────┘   └────────────────────────────────┘   └─────────────────────────────────────┘
```

Nguyên tắc tầng: route chỉ kiểm tra đầu vào và quyền; mọi quy tắc nằm ở service; chỉ service chạm DB, Redis, storage.
Các store đều đi qua interface (`sessionStore`, `ticketStore`, `blobStore`) để test bằng bản in-memory và để đổi
backend khi scale.

## 3. Luồng chính

### 3.1 Upload
```text
Admin chọn file → POST /api/secure-lectures/lectures/:id/versions (multipart, ≤ 20 MB)
  → kiểm tra: đuôi .html, mime text/html, UTF-8, có <html|<body, kích thước
  → tính sha256 → blobStore.put("secure-lectures/{lectureId}/v{n}-{sha8}.html")
  → INSERT sl_lecture_versions, cập nhật current_version_id (nếu chọn "dùng ngay")
  → ghi sl_access_logs(event='version_uploaded')
```
File lưu **nguyên bản**. Script bảo vệ được chèn **lúc phát**, nên đổi lớp bảo vệ không cần upload lại.

### 3.2 Tạo link
```text
POST /shares → sinh token 32 byte (base64url, 43 ký tự) → lưu sha256(token) → trả token MỘT LẦN
URL = {PUBLIC_BASE_URL}/v/{token}
```

### 3.3 Giáo viên mở link
```text
1. GET /v/{token}  (FE, trang tĩnh, không đăng nhập)
2. FE: POST /api/public/lectures/session { token, deviceHint }
       cookie sl_did (httpOnly, SameSite=Lax, Secure, 400 ngày) giữ device_id
3. accessEngine.open():
     tìm share theo sha256(token) ── không thấy ─→ 404 LINK_INVALID
     revoked? ─→ 410 LINK_REVOKED      ngoài [valid_from, expires_at]? ─→ 410 LINK_EXPIRED / 403 LINK_NOT_STARTED
     thiết bị đã đăng ký? ─ chưa → còn chỗ? ─ không → 403 DEVICE_LIMIT
                                          └ có → INSERT sl_devices
     thiết bị bị chặn? ─→ 403 DEVICE_BLOCKED
     số phiên sống (Redis) ≥ max_concurrent? ─→ 409 CONCURRENT_LIMIT + danh sách phiên đang mở
     tạo phiên: Redis + sl_sessions → trả { sessionId, ticket, heartbeatSec, lecture, recipient }
4. FE gắn iframe src=/api/public/lectures/content/{ticket}
     ticket dùng 1 lần, sống 60 s, gắn với sessionId + deviceId
     → server đọc blob → chèn guard script + watermark → trả HTML (no-store, CSP)
5. FE heartbeat 30 s: POST /heartbeat { sessionId } → 200 | 409 SESSION_KICKED | 410 LINK_*
```

### 3.4 Đá phiên
```text
409 CONCURRENT_LIMIT → giáo viên bấm "Đá thiết bị kia" → POST /session/takeover { token, kickSessionId }
  → đánh dấu phiên cũ kicked (Redis + DB) → mở phiên mới (lặp bước 3)
Máy bị đá: heartbeat kế tiếp nhận 409 SESSION_KICKED → FE gỡ iframe, hiện màn SL5 "Bị đá".
Độ trễ tối đa = chu kỳ heartbeat (30 s). P5 có thể dùng SSE để đá tức thì.
```

### 3.5 Phiên sống và hết hạn
- Redis key `sl:share:{shareId}:sessions` (ZSET, score = lần heartbeat cuối). Phiên sống = score ≥ now − 90 s.
- Kiểm tra và tạo phiên chạy trong **một Lua script** (hoặc `WATCH/MULTI`) để 2 máy mở cùng lúc không cùng lọt.
- Khi Redis không có: fallback đọc `sl_sessions` (cột `last_heartbeat_at`) bằng `SELECT … FOR UPDATE` trên dòng share.
  Chậm hơn nhưng vẫn đúng, nên dev/local không bắt buộc Redis.
- Đóng tab: FE gửi `navigator.sendBeacon('/end')`. Không gửi được thì phiên tự chết sau 90 s.

## 4. Mô hình bảo mật

| Mối đe doạ | Biện pháp | Ghi chú |
| --- | --- | --- |
| Đoán hoặc dò token | Token 256 bit; rate-limit theo IP cho `/session` (10/phút) và theo token (30/phút); lỗi không phân biệt "sai" và "không tồn tại" | |
| Lộ token trong DB | Chỉ lưu sha256; token hiện 1 lần lúc tạo | Lộ DB cũng không mở được link |
| Lộ token qua Referer/log | Trang `/v/` đặt `Referrer-Policy: no-referrer`; logger che phần sau `/v/` | Kiểm tra `apiAccessLogger` |
| Link file trực tiếp | Không URL nào trỏ thẳng vào storage; ticket 1 lần, 60 s, gắn phiên | |
| Cache, lưu trang | `Cache-Control: no-store, private`; `X-Content-Type-Options: nosniff` | |
| Nhúng trang vào site khác | `Content-Security-Policy: frame-ancestors 'self'` cho content; `X-Frame-Options: DENY` cho `/v/` | |
| HTML độc hại do người upload | iframe `sandbox="allow-scripts allow-same-origin allow-fullscreen"`, phát từ **đường dẫn** `/api/public/lectures/content/…`, không đặt cookie admin trên path này; CSP của content cấm `connect-src` ra ngoài trừ font | Chỉ người có quyền `manage` mới upload được |
| Chia sẻ link cho người khác | Giới hạn thiết bị; watermark người nhận; log IP và UA | |
| Xem mã, tải, in | Guard script: chặn chuột phải, F12, Ctrl+Shift+I/J/C, Ctrl+U/S/P, kéo thả, chọn chữ; `@media print` ẩn; phát hiện DevTools → làm mờ | Chỉ là lớp gây khó |
| Chụp, quay màn hình | Không chặn được; watermark tên + thời điểm, xoay chéo, mờ | Răn đe và truy vết |

Cookie `sl_did` chỉ chứa UUID ngẫu nhiên. Nó **không** phải xác thực: token vẫn là chìa khoá. `device_id` dùng để đếm
thiết bị. Kèm `fingerprint` nhẹ (UA, nền tảng, múi giờ, màn hình, hash) chỉ để admin nhận diện máy và để gợi ý
"có vẻ là máy cũ" trong log, **không** dùng để tự gộp thiết bị (tránh khoá nhầm).

## 5. Dữ liệu

Chi tiết cột ở SPEC §2. Quan hệ:
```text
sl_folders (cây, parent_id) 1─n sl_lectures 1─n sl_lecture_versions
                                     │
                                     └─1─n sl_shares 1─n sl_devices 1─n sl_sessions
                                                  └─────────1─n sl_access_logs
```
- Xoá thư mục: bài bên trong chuyển về "Chưa phân loại" (`folder_id = NULL`), thư mục con bị xoá theo (CASCADE).
- Xoá bài giảng là **xoá mềm** (`archived_at`): mọi link ngừng hoạt động ngay; blob bị dọn sau 30 ngày (S09).
- Log là append-only; giữ 180 ngày (cấu hình được).

## 6. Cấu hình (env)

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `SECURE_LECTURES_PUBLIC_BASE_URL` | lấy từ request | Gốc URL để dựng link `/v/…` |
| `SECURE_LECTURES_STORAGE_PREFIX` | `secure-lectures` | Prefix trong bucket |
| `SECURE_LECTURES_MAX_UPLOAD_MB` | `20` | |
| `SECURE_LECTURES_HEARTBEAT_SEC` | `30` | |
| `SECURE_LECTURES_SESSION_TTL_SEC` | `90` | Phiên chết nếu không heartbeat |
| `SECURE_LECTURES_TICKET_TTL_SEC` | `60` | |
| `SECURE_LECTURES_LOG_RETENTION_DAYS` | `180` | |

Storage dùng chung cấu hình R2 hiện có (`MEDIA_STORAGE_MODE`, `R2_*`). Ở mode `local`, file nằm ngoài thư mục `public/`
(ví dụ `storage/secure-lectures/`) để không bị `express.static` phát ra.

## 7. Hiệu năng

- File ≤ 20 MB, thường dưới 1 MB. Phát nội dung = 1 lần đọc blob mỗi lượt mở; cache blob trong bộ nhớ theo sha256
  (LRU 100 MB) vì phiên bản là bất biến.
- Heartbeat: 1 request/30 s/thiết bị. 1 000 thiết bị đồng thời ≈ 33 req/s, chủ yếu đi Redis, ghi DB gộp
  (cập nhật `last_heartbeat_at` tối đa mỗi 2 phút).
- Truy vấn danh sách dùng index `(folder_id, updated_at)`, `(lecture_id)`, `token_hash UNIQUE`.

## 8. Hướng mở rộng (P5+)

| Nhu cầu | Cách mở rộng | Điểm đã chuẩn bị sẵn |
| --- | --- | --- |
| Domain riêng (`lecture.iig…`) | Đổi `SECURE_LECTURES_PUBLIC_BASE_URL`, tách FE `/v/` thành app nhỏ; cookie và CSP theo domain mới | Public API đã tách router; không phụ thuộc cookie admin |
| Nhiều instance API | Toàn bộ trạng thái phiên ở Redis; ticket ở Redis; không trạng thái trong RAM ngoài cache blob | Interface `sessionStore` / `ticketStore` |
| Đá phiên tức thì | Thêm SSE `/events` hoặc Redis pub/sub | Sự kiện `kicked` đã có trong store |
| PDF, video, gói nhiều file (zip) | Thêm `content_type` cho version; renderer theo loại (pdf.js, HLS mã hoá) | Cột `content_type`, `contentService` theo strategy |
| OTP email hoặc đăng nhập giáo viên | Thêm `auth_mode` cho share (`token` \| `token_otp`) và bước xác minh trước `open()` | `accessEngine.open()` là pipeline nhiều bước |
| Gán link cho tài khoản giáo viên trong hệ thống | `recipient_user_id` trên share | Cột đã có, để NULL |
| Báo cáo sử dụng | Tổng hợp từ `sl_access_logs` và `sl_sessions` (thời lượng trình chiếu) | Log có `duration_sec` khi phiên kết thúc |
| Lưu trữ lớn hoặc CDN | Phát blob qua signed URL của CDN có hạn 60 s thay vì proxy | `contentService` cô lập cách phát |
| Watermark mạnh hơn | Chèn mã ẩn theo người nhận vào DOM | Guard script chèn lúc phát |

## 9. Quan sát và vận hành

- Mọi sự kiện vào `sl_access_logs`: `open_ok`, `open_denied` (kèm `reason`), `takeover`, `kicked`, `end`, `expired`,
  `device_registered`, `device_removed`, `share_created`, `share_revoked`, `share_updated`, `version_uploaded`.
- Màn admin hiển thị số liệu từ log và phiên (S09).
- Job dọn dẹp chạy mỗi giờ: đóng phiên chết trong DB, xoá ticket thừa, xoá log quá hạn, xoá blob của bài đã lưu trữ
  quá 30 ngày.
