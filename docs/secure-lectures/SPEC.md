# Bài giảng bảo mật — Đặc tả

Đọc kèm [README.md](README.md) và [ARCHITECTURE.md](ARCHITECTURE.md). Các task S01–S10 tham chiếu mục trong file này.

## 1. Khái niệm

| Khái niệm | Ý nghĩa |
| --- | --- |
| **Thư mục** | Nút trong cây nhiều cấp (ví dụ Khoá › Unit). Chỉ để tổ chức, không ảnh hưởng quyền. |
| **Bài giảng (lecture)** | Một học liệu trình chiếu. Thuộc 0–1 thư mục. Có nhiều phiên bản, 1 bản đang dùng. |
| **Phiên bản (version)** | Một file HTML đã upload. Bất biến, đánh số tăng dần v1, v2… |
| **Link chia sẻ (share)** | Quyền mở một bài giảng cho một người nhận, kèm token, thời hạn và giới hạn. |
| **Thiết bị (device)** | Một trình duyệt đã từng mở link, nhận diện bằng cookie `sl_did`. Thuộc về một share. |
| **Phiên (session)** | Một lần mở đang hoạt động trên một thiết bị, sống nhờ heartbeat. |

Giới hạn thiết bị và giới hạn phiên tính **theo từng link**, không theo bài giảng.

## 2. Dữ liệu (migration S01 — `160_secure_lectures.sql`)

Thời gian `TIMESTAMPTZ`, khoá `UUID DEFAULT gen_random_uuid()`, mọi bảng có `created_at`, `updated_at`.

### `sl_folders`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| parent_id | UUID NULL FK → sl_folders ON DELETE CASCADE | CHECK `parent_id <> id` |
| name | TEXT NOT NULL | 1–120 ký tự; UNIQUE(parent_id, lower(name)) (dùng `COALESCE(parent_id, '00000000-…')`) |
| sort_order | INT DEFAULT 0 | |
| created_by, updated_by | INT FK users | |

Độ sâu tối đa 5 cấp (kiểm tra ở service). Không được chuyển thư mục vào chính nó hay con cháu của nó.

### `sl_lectures`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| folder_id | UUID NULL FK → sl_folders ON DELETE SET NULL | NULL = Chưa phân loại |
| title | TEXT NOT NULL | 1–200 |
| description | TEXT NULL | |
| current_version_id | UUID NULL FK → sl_lecture_versions | |
| archived_at | TIMESTAMPTZ NULL | xoá mềm |
| created_by, updated_by | | |

Index `(folder_id, updated_at DESC) WHERE archived_at IS NULL`; trigram/ILIKE trên `title` cho tìm kiếm.

### `sl_lecture_versions`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| lecture_id | UUID FK ON DELETE CASCADE | |
| version_no | INT | UNIQUE(lecture_id, version_no) |
| storage_key | TEXT NOT NULL | `secure-lectures/{lectureId}/v{n}-{sha8}.html` |
| original_filename | TEXT | |
| content_type | TEXT DEFAULT 'text/html' | mở rộng P5 |
| size_bytes | INT | |
| sha256 | TEXT | hex |
| note | TEXT NULL | |
| meta | JSONB | `{ slideCountGuess, externalHosts:[], hasAudio }` (gợi ý, không bắt buộc) |
| uploaded_by | INT | |

### `sl_shares`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| lecture_id | UUID FK ON DELETE CASCADE | |
| pinned_version_id | UUID NULL FK | NULL = luôn dùng bản đang dùng của bài |
| token_hash | TEXT UNIQUE NOT NULL | sha256 hex của token |
| token_hint | TEXT | 4 ký tự cuối, để admin nhận ra link |
| recipient_name | TEXT NOT NULL | hiện trên watermark |
| recipient_email | TEXT NULL | chỉ ghi chú, không gửi mail |
| recipient_user_id | INT NULL | dành cho P5 |
| valid_from | TIMESTAMPTZ DEFAULT now() | |
| expires_at | TIMESTAMPTZ NOT NULL | CHECK `expires_at > valid_from` |
| max_devices | INT NOT NULL DEFAULT 3 | 1–20 |
| max_concurrent | INT NOT NULL DEFAULT 1 | 1–`max_devices` |
| watermark_enabled | BOOL DEFAULT true | |
| guard_enabled | BOOL DEFAULT true | chặn phím, chuột phải, in, DevTools |
| note | TEXT NULL | |
| revoked_at, revoked_by, revoke_reason | NULL | |
| created_by, updated_by | | |

Trạng thái suy ra, không lưu: `revoked` → `expired` (now > expires_at) → `scheduled` (now < valid_from) → `active`.
Bổ sung cờ hiển thị `expiring` khi còn ≤ 3 ngày.

### `sl_devices`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| share_id | UUID FK ON DELETE CASCADE | |
| device_id | UUID | từ cookie `sl_did`; UNIQUE(share_id, device_id) |
| fingerprint | TEXT | hash ngắn, chỉ để nhận diện |
| label | TEXT | ví dụ "Chrome 131 · macOS", tạo từ UA |
| user_agent | TEXT | |
| first_ip, last_ip | INET | |
| first_seen_at, last_seen_at | | |
| removed_at, removed_by | NULL | gỡ = không còn tính vào giới hạn; mở lại sẽ đăng ký như máy mới |
| blocked_at, blocked_by | NULL | chặn hẳn: máy này không mở được link này nữa |

Số thiết bị đang tính = số dòng `removed_at IS NULL`, kể cả máy bị chặn.

### `sl_sessions`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| share_id, device_ref | FK | `device_ref` → sl_devices.id |
| version_id | UUID | bản được phát |
| started_at, last_heartbeat_at, ended_at | | |
| end_reason | TEXT NULL | `closed` \| `timeout` \| `kicked` \| `revoked` \| `expired` \| `device_removed` |
| kicked_by_session_id | UUID NULL | |
| ip, user_agent | | |

### `sl_access_logs`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | BIGSERIAL PK | |
| at | TIMESTAMPTZ DEFAULT now() | index `(share_id, at DESC)`, `(lecture_id, at DESC)` |
| lecture_id, share_id, device_ref, session_id | NULL | |
| actor_user_id | INT NULL | admin thực hiện (nếu có) |
| event | TEXT | danh sách ARCHITECTURE §9 |
| reason | TEXT NULL | mã lỗi khi bị từ chối |
| ip, user_agent | | |
| meta | JSONB | |

### Quyền (thêm cho role `admin`, cùng cách migration 149)
| Quyền | Cho phép |
| --- | --- |
| `secure_lectures.view` | Xem thư mục, bài, phiên bản, link (không thấy token), thiết bị, log |
| `secure_lectures.manage` | Tạo/sửa/xoá thư mục, upload, đổi bản đang dùng, lưu trữ bài |
| `secure_lectures.share` | Tạo/sửa/gia hạn/thu hồi link; gỡ/chặn thiết bị; đá phiên |

## 3. API admin — `/api/secure-lectures` (JWT)

Định dạng chung: thành công `{ success: true, data }`, lỗi `{ success: false, error: { code, message } }`.
Danh sách có `?limit` (≤ 100, mặc định 50) và `?cursor`.

| Method & path | Quyền | Mô tả |
| --- | --- | --- |
| GET `/folders` | view | Toàn bộ cây phẳng `[{id,parentId,name,sortOrder,lectureCount}]` + `unfiledCount` |
| POST `/folders` | manage | `{name,parentId?}` |
| PATCH `/folders/:id` | manage | `{name?,parentId?,sortOrder?}`; chặn vòng lặp, độ sâu |
| DELETE `/folders/:id` | manage | Bài bên trong (cả cây con) về Chưa phân loại |
| GET `/overview` | view | Số liệu 4 thẻ SL1 (§6) |
| GET `/lectures?folderId=&q=&status=&sort=` | view | `folderId=unfiled` \| `all` \| uuid; `includeSubfolders=true` mặc định; `status` ∈ `shared,expiring,unshared,attention` |
| POST `/lectures` | manage | multipart: `file`, `title`, `folderId?`, `note?` → tạo bài + v1 |
| GET `/lectures/:id` | view | Chi tiết + số liệu 4 thẻ SL2 |
| PATCH `/lectures/:id` | manage | `{title?,description?,folderId?}` |
| POST `/lectures/move` | manage | `{lectureIds:[],folderId|null}` (kéo thả nhiều bài) |
| DELETE `/lectures/:id` | manage | Lưu trữ (xoá mềm), mọi link ngừng ngay |
| GET `/lectures/:id/versions` | view | |
| POST `/lectures/:id/versions` | manage | multipart `file`, `note?`, `makeCurrent=true` |
| POST `/lectures/:id/versions/:versionId/current` | manage | Đổi bản đang dùng |
| GET `/lectures/:id/versions/:versionId/preview` | view | Trả HTML để admin xem trước (có guard, watermark "XEM TRƯỚC", không tính thiết bị) |
| GET `/lectures/:id/shares` | view | Kèm `status`, `deviceCount`, `liveSessionCount` |
| POST `/lectures/:id/shares` | share | §4.1 → trả `{share, token, url}` (token chỉ trả lần này) |
| PATCH `/shares/:id` | share | Sửa người nhận, hạn, giới hạn, cờ, bản cố định |
| POST `/shares/:id/revoke` | share | `{reason?}`; kết thúc mọi phiên đang mở |
| GET `/shares/:id/devices` | view | Kèm phiên đang mở của từng máy |
| POST `/shares/:id/devices/:deviceRef/remove` | share | Gỡ, kết thúc phiên của máy |
| POST `/shares/:id/devices/:deviceRef/block` \| `/unblock` | share | |
| POST `/sessions/:id/kick` | share | Admin đá phiên |
| GET `/logs?lectureId=&shareId=&event=&from=&to=` | view | Nhật ký |

## 4. Quy tắc nghiệp vụ

### 4.1 Tạo và sửa link
- Bắt buộc: `recipientName`, `expiresAt`. Mặc định `maxDevices=3`, `maxConcurrent=1`, watermark và guard bật.
- `expiresAt` phải ở tương lai, tối đa 365 ngày kể từ `validFrom`.
- Bài đã lưu trữ hoặc chưa có phiên bản thì không tạo được link (`LECTURE_NOT_READY`).
- Token: `crypto.randomBytes(32).toString('base64url')`; lưu `sha256(token)`; `token_hint` = 4 ký tự cuối.
- URL: `${PUBLIC_BASE_URL}/v/${token}`. Không có API nào trả lại token lần thứ hai.
- Giảm `maxDevices` xuống dưới số thiết bị hiện có: không tự gỡ máy, chỉ chặn máy mới cho tới khi admin gỡ bớt.
  UI cảnh báo trước khi lưu.
- Giảm `maxConcurrent`: các phiên vượt giới hạn vẫn chạy tới lần mở sau; không đá tự động.
- Thu hồi: không hoàn tác (muốn dùng lại thì tạo link mới). Mọi phiên kết thúc với lý do `revoked`.

### 4.2 Mở link — `accessEngine.open(token, deviceId, ctx)`
Thứ tự kiểm tra (dừng ở lỗi đầu tiên, luôn ghi log `open_denied` kèm `reason`):
1. Token đúng định dạng và tìm thấy share → không thì `LINK_INVALID` (404).
2. Bài chưa lưu trữ và có bản để phát → không thì `LINK_INVALID`.
3. `revoked_at` → `LINK_REVOKED` (410).
4. now < `valid_from` → `LINK_NOT_STARTED` (403), trả `validFrom`.
5. now > `expires_at` → `LINK_EXPIRED` (410), trả `expiresAt`.
6. Thiết bị: nếu chưa có `sl_did` thì server cấp UUID mới qua `Set-Cookie`.
   - Đã đăng ký và `blocked_at` → `DEVICE_BLOCKED` (403).
   - Đã đăng ký và chưa gỡ → OK, cập nhật `last_seen`.
   - Chưa đăng ký: số thiết bị đang tính < `max_devices` thì đăng ký mới (log `device_registered`),
     ngược lại `DEVICE_LIMIT` (403).
7. Phiên: đếm phiên sống của share, **không tính phiên của chính thiết bị này** (mở lại trên cùng máy thì thay phiên cũ
   của máy đó, không coi là vượt).
   - Nếu < `max_concurrent` thì tạo phiên.
   - Ngược lại `CONCURRENT_LIMIT` (409), trả `liveSessions:[{sessionId, deviceLabel, startedAt}]` để FE hiện màn chọn.
8. Tạo phiên + ticket, trả `{sessionId, ticket, heartbeatSec, ttlSec, lecture:{title}, recipientName, expiresAt}`.

Bước 6–8 chạy nguyên tử theo share (Lua script Redis, hoặc khoá dòng DB khi không có Redis).

### 4.3 Đá phiên — `takeover(token, deviceId, kickSessionId)`
- Lặp lại kiểm tra 1–6. `kickSessionId` phải là phiên sống của cùng share, khác thiết bị.
- Kết thúc phiên đó (`end_reason='kicked'`, `kicked_by_session_id`), log `takeover` và `kicked`, rồi tạo phiên mới.
- Nếu `max_concurrent > 1`, chỉ đá đúng 1 phiên được chọn.

### 4.4 Heartbeat và kết thúc
- `POST /heartbeat {sessionId}` mỗi `heartbeatSec` (30). Server kiểm tra lại share (thu hồi, hết hạn) và thiết bị (gỡ, chặn).
  - OK → `200 {expiresAt}`.
  - Phiên bị đá → `409 SESSION_KICKED`.
  - Share hết hạn hoặc bị thu hồi → `410 LINK_EXPIRED` / `LINK_REVOKED`.
  - Thiết bị bị gỡ hoặc chặn → `403 DEVICE_REMOVED` / `DEVICE_BLOCKED`.
  - Phiên không tồn tại hoặc quá TTL → `404 SESSION_GONE` (FE tự gọi `open` lại 1 lần).
- `POST /end {sessionId}` (qua sendBeacon) → `end_reason='closed'`.
- Hết hạn khi đang trình chiếu: heartbeat kế tiếp trả 410, FE gỡ nội dung và hiện màn hết hạn.

### 4.5 Phát nội dung — `GET /api/public/lectures/content/:ticket`
- Ticket: 32 byte ngẫu nhiên, lưu Redis `sl:ticket:{t}` → `{sessionId, versionId, deviceId}`, TTL 60 s, **xoá khi dùng**.
  Cookie `sl_did` của request phải khớp `deviceId`.
- Không hợp lệ → 404 trang trắng (không lộ lý do).
- Hợp lệ → đọc blob, chèn trước `</head>` (hoặc đầu `<body>` nếu không có head):
  1. `<meta name="robots" content="noindex,nofollow">`
  2. guard script (khi `guard_enabled`), §4.6
  3. lớp watermark (khi `watermark_enabled`): `"{recipientName} · {dd/MM HH:mm}"`, lặp xoay −24°, opacity ~0.07,
     `pointer-events:none`, z-index cao nhất. MutationObserver gắn lại nếu bị xoá.
- Header: `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store, private, max-age=0`,
  `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
  `Content-Security-Policy: frame-ancestors 'self'; default-src 'self' 'unsafe-inline' data: blob:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'none'; form-action 'none'; base-uri 'none'`,
  `Content-Disposition: inline`.
- Ghi log `open_ok` ở bước này (lúc nội dung thật sự được giao).

### 4.6 Guard script (chèn vào nội dung) và trang `/v/` (chạy ở cả hai)
- Chặn `contextmenu`, `dragstart`, `selectstart` (trừ input/textarea), `copy`/`cut` (trừ input/textarea).
- Chặn phím: F12; Ctrl/Cmd + Shift + I/J/C; Ctrl/Cmd + U, S, P; Cmd + Option + I/J/U (macOS).
  Không chặn phím điều hướng slide (mũi tên, PageUp/Down, Space, F5 nếu bài dùng, Esc, F11).
- `@media print { body { display:none !important } }` và bắt `beforeprint`.
- Phát hiện DevTools (chênh lệch `outerWidth - innerWidth` > 160 hoặc mẹo `debugger` có thời gian): phủ lớp mờ
  "Đã tạm ẩn nội dung" và gửi log `devtools_suspected` qua trang cha (`postMessage` → FE → API `/event`). Chỉ cảnh
  báo, không khoá link.
- Trang `/v/` gửi `postMessage` cho iframe khi cần toàn màn hình; iframe được `allow="fullscreen; autoplay"`.

## 5. API công khai — `/api/public/lectures` (không JWT)

| Method & path | Body | Trả về |
| --- | --- | --- |
| POST `/session` | `{token, client:{tz,screen,platform}}` | §4.2 bước 8, hoặc lỗi kèm dữ liệu cho màn SL5 |
| POST `/session/takeover` | `{token, kickSessionId, client}` | như trên |
| POST `/heartbeat` | `{sessionId}` | §4.4 |
| POST `/end` | `{sessionId}` (sendBeacon, text/plain JSON) | 204 |
| POST `/event` | `{sessionId, type:'devtools_suspected'}` | 204 (giới hạn 5 lần/phiên) |
| GET `/content/:ticket` | – | HTML §4.5 |

Rate-limit (Redis, fallback in-memory): `/session` và `/takeover` 10/phút/IP và 30/phút/token;
`/heartbeat` 6/phút/session. Vượt → `429 RATE_LIMITED`.
CORS: router public **không** dùng `cors()` mở; chỉ same-origin.

## 6. Số liệu hiển thị

- **SL1 Thư viện:**
  - Tổng bài (đếm theo thư mục hiện chọn, kể cả thư mục con).
  - Link đang hoạt động và số người nhận khác nhau.
  - Thiết bị đang mở ngay lúc này.
  - Cần chú ý = link hết hạn trong ≤ 3 ngày + link có thiết bị bị chặn hoặc bị từ chối do `DEVICE_LIMIT` trong 7 ngày.
- **SL2 Chi tiết:**
  - Bản đang dùng.
  - Số link hoạt động / thu hồi / hết hạn.
  - Thiết bị đã đăng ký và đang mở.
  - Lượt `open_ok` 7 ngày, số lần bị từ chối, số lần đá phiên.

## 7. Mã lỗi

| Code | HTTP | Màn giáo viên (SL5) |
| --- | --- | --- |
| `LINK_INVALID` | 404 | "Link không hợp lệ" |
| `LINK_REVOKED` | 410 | "Link đã bị thu hồi" |
| `LINK_EXPIRED` | 410 | "Link đã hết hạn" + thời điểm |
| `LINK_NOT_STARTED` | 403 | "Link chưa đến thời gian sử dụng" + thời điểm |
| `DEVICE_LIMIT` | 403 | "Đã đủ N thiết bị cho link này" |
| `DEVICE_BLOCKED` | 403 | "Thiết bị này đã bị chặn" |
| `DEVICE_REMOVED` | 403 | "Thiết bị này đã bị gỡ" + nút Mở lại |
| `CONCURRENT_LIMIT` | 409 | Màn chọn: đá thiết bị kia / thoát |
| `SESSION_KICKED` | 409 | "Đã mở ở thiết bị khác" + nút Mở lại ở máy này |
| `SESSION_GONE` | 404 | Tự mở lại 1 lần, thất bại thì "Mất kết nối" + Thử lại |
| `RATE_LIMITED` | 429 | "Thao tác quá nhanh, thử lại sau ít phút" |
| `LECTURE_NOT_READY` | 409 | (admin) |
| `FILE_INVALID` / `FILE_TOO_LARGE` | 400 / 413 | (admin) |
| `FOLDER_CYCLE` / `FOLDER_TOO_DEEP` / `NAME_TAKEN` | 409 | (admin) |

Lỗi công khai không trả stack hay chi tiết nội bộ.

## 8. Giao diện

Thiết kế ở `designs/`, phong cách theo AI Core và Content Studio (design-system-v2 `--iig3-*`, nền `#efefec`,
thẻ `#fffefa`, viền `#deded8`, nhấn `#d55f3d`, chữ `#242521`, bo 12px, nút cao 38px).

| Màn | File | Route |
| --- | --- | --- |
| SL1 Thư viện: cây thư mục, 4 thẻ số liệu, bảng bài giảng, lọc, kéo thả | `SL1-Library.html` | `/secure-lectures`, `/secure-lectures/folders/:id` |
| SL2 Chi tiết bài: 4 thẻ, tab Link · Thiết bị & phiên · Phiên bản · Nhật ký | `SL2-LectureDetail.html` | `/secure-lectures/lectures/:id` |
| SL3 Upload bài giảng (modal) | `SL3-ModalUpload.html` | |
| SL4 Tạo/sửa link (modal) + SL4b link vừa tạo (hiện token 1 lần) | `SL4-*.html` | |
| SL5 Các trạng thái màn giáo viên | `SL5-ViewerStates.html` | `/v/:token` |
| SL6 Đang trình chiếu (thanh trên, iframe, watermark) | `SL6-ViewerPresenting.html` | `/v/:token` |

- Menu: nhóm "Tạo & phát triển", mục "Bài giảng bảo mật" (icon `ShieldCheck` hoặc `Presentation`),
  quyền `secure_lectures.view`.
- Thư mục: tạo, đổi tên, xoá, di chuyển bằng menu ⋯ trên cây; kéo bài từ bảng thả vào nút thư mục.
- Người chỉ có `view` thấy dạng chỉ đọc (ẩn nút upload, tạo link, thu hồi).
- Mọi bảng có trạng thái đang tải (Skeleton), rỗng (lời mời hành động) và lỗi (ErrorState + Thử lại).
- Màn `/v/:token`: không sidebar, nền tối `#1e1f1c`; thanh trên cao 44px; thẻ trạng thái giữa màn.
  Phím F11 / nút "Toàn màn hình" để trình chiếu. Responsive tới 768px (máy tính bảng).
