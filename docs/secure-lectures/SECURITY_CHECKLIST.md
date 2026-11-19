# Checklist bảo mật — Bài giảng bảo mật

Ngày kiểm tra: **2026-11-19**  
Phạm vi: S01–S10, kiểm tra mã nguồn và test tự động trong worktree.  
Kết luận code-level: **PASS**. Kiểm tra Beta với giáo viên thật: **NOT RUN** vì phạm vi bàn giao cấm deploy.

## Kết quả bắt buộc của S10

| Kiểm soát | Kết quả | Bằng chứng |
| --- | --- | --- |
| Không có URL công khai tới file gốc | PASS | Blob nằm ngoài `public/`; nội dung chỉ qua `/api/public/lectures/content/:ticket`; ticket gắn thiết bị, TTL ngắn và dùng một lần. E2E xác nhận lần dùng thứ hai trả blank 404. |
| Token không nằm trong log hoặc DB | PASS | DB chỉ lưu SHA-256 và `token_hint`; access logger che `/v/:token` và `/content/:ticket`; E2E xác nhận state/log không chứa token thô. |
| Header bảo mật đúng | PASS | E2E kiểm tra `Cache-Control: no-store`, CSP có `sandbox`, `frame-ancestors 'self'`, `connect-src 'none'`, cùng `nosniff`; unit test bao phủ đầy đủ header. |
| Public API không mở CORS | PASS | `sameOriginOnly` được gắn trước global `cors()`; không gắn middleware CORS trên router public. Tín hiệu chính là `Sec-Fetch-Site`; `cross-site` bị 403. |
| Người chỉ có `secure_lectures.view` không ghi được | PASS | E2E gọi `POST /folders` với quyền view-only và nhận 403 `PERMISSION_DENIED`; mọi route ghi yêu cầu `manage` hoặc `share`. |
| HTML có `fetch` ra ngoài bị chặn | PASS | E2E upload HTML chứa `fetch("https://evil.example")`; response content có CSP `connect-src 'none'` và opaque-origin sandbox. |
| Iframe không đọc được cookie admin | PASS | Content CSP dùng `sandbox allow-scripts allow-presentation` **không** có `allow-same-origin`; cookie xác thực admin là HttpOnly; cookie thiết bị `sl_did` cũng HttpOnly và chỉ có path `/api/public/lectures`. |
| Rate-limit hoạt động | PASS (code); điều kiện deploy bên dưới | Unit test xác nhận request mở thứ 11/phút/IP nhận 429; store có giới hạn theo IP, token, session và event. |

## Điều kiện bắt buộc khi deploy

1. **Bắt buộc đặt `SECURE_LECTURES_PUBLIC_BASE_URL` trên Beta và Production** thành đúng public HTTPS origin. Không dùng cơ chế suy ra từ request ở hai môi trường này.
2. Ứng dụng hiện **chưa bật Express `trust proxy`**:
   - `req.ip` dùng cho rate-limit sẽ là IP peer trực tiếp (thường là reverse proxy), không phải IP giáo viên. Vì vậy giới hạn theo IP có thể bị gộp cho nhiều người dùng sau cùng một proxy.
   - cờ `Secure` của cookie `sl_did` được code kiểm tra thêm từ `X-Forwarded-Proto`; URL share và fallback same-origin cũng đọc `X-Forwarded-Host`/`X-Forwarded-Proto`.
   - Nginx/proxy tin cậy phải **ghi đè**, không nối/nhận header do client gửi: `Host $host`, `X-Forwarded-Host $host`, `X-Forwarded-Proto $scheme`, `X-Forwarded-For $proxy_add_x_forwarded_for`. Không dùng `$http_x_forwarded_proto` từ request ngoài.
   - Trước khi coi rate-limit theo IP là chính xác theo giáo viên, phải bật `trust proxy` với số hop/CIDR cụ thể và kiểm thử `req.ip`; không dùng `true` chung chung.
3. Same-origin guard ưu tiên `Sec-Fetch-Site`: chỉ nhận `same-origin` hoặc `none`; `cross-site`/`same-site` bị từ chối. Proxy phải giữ nguyên header này. Request không có header (server-to-server/sendBeacon cũ) được kiểm tra tiếp bằng `Origin` và host đã cấu hình.
4. **Nhiều instance API bắt buộc dùng Redis** (`REDIS_URL`) cho session, ticket và rate-limit. Fallback memory/DB chỉ dành cho local hoặc một instance; memory store giữa các instance không đồng bộ.
5. Phát hiện DevTools **chỉ ghi log** `devtools_suspected`; không che nội dung, không khóa link, không kết thúc phiên. Đây là heuristic có false positive và không phải ranh giới bảo mật.

## Kiểm tra trước khi mở traffic

- Xác nhận `SECURE_LECTURES_PUBLIC_BASE_URL` trả về HTTPS và trùng origin của admin viewer.
- Xác nhận Redis healthy; với nhiều instance, mở trên instance A rồi heartbeat/takeover qua instance B.
- Kiểm tra Nginx đã ghi đè các header forwarded và không cho truy cập trực tiếp cổng API từ Internet.
- Mở một link thật qua HTTPS: `Set-Cookie: sl_did=...; Secure; HttpOnly; SameSite=Lax`.
- Thử cross-site request và xác nhận 403; thử request thứ 11 trong một phút và xác nhận 429 ở topology thực tế.
- Kiểm tra log không chứa token đầy đủ, query string nhạy cảm hoặc nội dung bài giảng.

## Xác nhận

- Người thực hiện kiểm tra code/test: Codex — 2026-11-19.
- Người vận hành Beta/Production: _chưa ký; thực hiện khi có lệnh deploy được phê duyệt_.

