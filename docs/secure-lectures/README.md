# Bài giảng bảo mật (Secure Lectures) trên IIG Admin

Trạng thái: **Đã triển khai** ngày **2026-11-19**. S01–S09 đã commit; S10 đã hoàn tất trong worktree và được giữ
chưa commit theo yêu cầu bàn giao.

## Lịch sử triển khai S01–S10

| Task | Commit / trạng thái |
| --- | --- |
| S01 | `dee9c2e` — foundation, migration 160, permissions, errors, config, stores, routers |
| S02 | `2bd7837` — private blob store, HTML inspector, versioned upload API |
| S03 | `16c0093` — folder tree and lecture APIs |
| S04 | `64d60ce` — share links, one-time token, limits, revoke, device admin |
| S05 | `e0e0367` — access engine, devices, atomic sessions, heartbeat, takeover, rate-limit, same-origin guard |
| S06 | `46fe8fe` — teacher viewer, one-time content delivery, guard and watermark |
| S07 | `433c26e` — library UI, folder tree, lecture table, upload and folder dialogs |
| S08 | `cc39fd9` — lecture detail UI, share dialogs, devices and versions tabs |
| S09 | `bc40ef6` — access logs, metrics, attention flags, hourly maintenance |
| S10 | Chưa commit theo yêu cầu — E2E HTTP in-memory, security checklist, deploy docs và hướng dẫn admin |

| Tài liệu | Nội dung |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Kiến trúc hệ thống, luồng dữ liệu, bảo mật, hướng scale |
| [SPEC.md](SPEC.md) | Đặc tả: khái niệm, dữ liệu, API, quy tắc nghiệp vụ, mã lỗi, UI |
| [designs/](designs/) | Thiết kế giao diện HTML (mở bằng trình duyệt, khổ 1440px) |
| [tasks/](tasks/) | 10 task S01–S10 để giao cho Codex |

## 1. Bài toán

Giáo viên trình chiếu bài giảng dưới dạng **một file HTML tự chứa**: slide, JS, audio đều đã nhúng sẵn trong file.
IIG cần phát file này cho giáo viên mà không mất kiểm soát:

- upload và lưu file trên IIG Admin, **quản lý theo cây thư mục** (giống Content Studio, nhưng là module riêng);
- gửi cho giáo viên **một link trên domain IIG Admin, token nằm sẵn trong link**, bấm là mở, không cần đăng nhập;
- mỗi link có **thời hạn**, **số thiết bị tối đa** (ví dụ 3) và **số thiết bị mở cùng lúc** (ví dụ 1);
- khi vượt số mở cùng lúc: báo cho giáo viên, cho chọn **đá thiết bị kia** hoặc **thoát**;
- gây khó cho việc tải file, xem mã nguồn (F12, Ctrl+U/S/P, chuột phải, in), và có watermark để truy vết;
- admin thu hồi, gia hạn, gỡ thiết bị, xem ai mở lúc nào.

Lưu ý: không có cách nào chặn 100% người rành kỹ thuật lấy nội dung đã hiển thị trên trình duyệt. Mục tiêu là
**chặn người dùng phổ thông, và truy được ai làm lộ** (watermark theo người nhận + log thiết bị/IP).

## 2. Mục tiêu chung

| # | Mục tiêu | Đo bằng |
| --- | --- | --- |
| G1 | Admin tự upload, sắp xếp, chia sẻ bài giảng, không cần dev | Làm trọn luồng upload → tạo link → giáo viên mở trên UI |
| G2 | File gốc không bao giờ có URL công khai hoặc vĩnh viễn | Không request nào trả file nếu thiếu phiên hợp lệ; URL nội dung chỉ dùng 1 lần, sống ≤ 60 giây |
| G3 | Giới hạn thời hạn, số thiết bị, số mở cùng lúc được đảm bảo ở server | Test tự động cho từng giới hạn |
| G4 | Mọi lượt mở đều truy vết được | Log mọi sự kiện, kể cả bị từ chối; watermark tên người nhận |
| G5 | Kiến trúc mở rộng được (PDF/video, OTP, domain riêng, nhiều instance) | Xem ARCHITECTURE §8, không phải đập đi làm lại |

## 3. Quyết định đã chốt

| Chủ đề | Quyết định |
| --- | --- |
| Định dạng | Chỉ 1 file `.html` tự chứa (audio vài KB nhúng sẵn). Không upload audio riêng. Tối đa 20 MB. |
| Domain | Dùng chung domain IIG Admin. Link: `https://<admin-domain>/v/<token>`. |
| Xác thực giáo viên | Chỉ token trong link. Không OTP, không tài khoản. |
| Vượt số mở cùng lúc | Màn thông báo với 2 nút: "Đá thiết bị kia, mở ở đây" / "Thoát". |
| Vượt số thiết bị | Từ chối, yêu cầu liên hệ admin để gỡ bớt thiết bị. |
| Tổ chức | Cây thư mục nhiều cấp, bảng và quyền riêng, không dùng chung dữ liệu với Content Studio. |
| Tiền tố | Bảng `sl_`, quyền `secure_lectures.*`, class CSS `sl-`, code `src/modules/secure-lectures`. |

## 4. Lộ trình

| Phase | Mục tiêu phase | Task | Xong khi |
| --- | --- | --- | --- |
| P0 Nền móng | Có dữ liệu, quyền, nơi lưu file riêng tư | S01, S02 | Migration chạy; upload 1 file HTML lên kho riêng, đọc lại đúng sha256 |
| P1 Quản lý | Quản lý thư mục, bài giảng, link qua API | S03, S04 | Gọi API tạo thư mục → bài giảng → link, thu hồi được; test đạt |
| P2 Trình chiếu | Giáo viên mở link và trình chiếu an toàn | S05, S06 | Mở link trên 2 trình duyệt: đúng các giới hạn, đá phiên, watermark, chặn phím |
| P3 Giao diện admin | Admin làm mọi việc trên UI theo thiết kế | S07, S08 | Khớp `designs/SL1–SL4` ở 1440px, không vỡ ở 1024px |
| P4 Vận hành | Nhật ký, thống kê, dọn dẹp, kiểm thử E2E, sẵn sàng release | S09, S10 | E2E đạt; checklist release ký xong |
| P5 Mở rộng | (sau) PDF/video, OTP email, domain riêng, CDN, báo cáo | – | Theo ARCHITECTURE §8 |

```text
P0 ─→ P1 ─┬→ P2 (viewer)  ─┐
          └→ P3 (UI admin) ─┴→ P4
P2 và P3 chạy song song được sau khi P1 xong.
```

## 5. Danh sách task

| Task | Phase | Tên | Phụ thuộc |
| --- | --- | --- | --- |
| [S01](tasks/S01-foundation.md) | P0 | Khung module, migration, quyền, mã lỗi | – |
| [S02](tasks/S02-storage-upload.md) | P0 | Kho lưu trữ riêng tư + upload, phiên bản | S01 |
| [S03](tasks/S03-folders-lectures-api.md) | P1 | API thư mục và bài giảng | S01, S02 |
| [S04](tasks/S04-shares-api.md) | P1 | API link chia sẻ: token, hạn, giới hạn, thu hồi | S03 |
| [S05](tasks/S05-access-engine.md) | P2 | Bộ kiểm soát truy cập: thiết bị, phiên, heartbeat, đá phiên | S04 |
| [S06](tasks/S06-viewer.md) | P2 | Trang trình chiếu + phát nội dung + lớp bảo vệ | S05 |
| [S07](tasks/S07-ui-library.md) | P3 | UI: Thư viện (cây thư mục, danh sách, upload, di chuyển) | S03 |
| [S08](tasks/S08-ui-detail-share.md) | P3 | UI: Chi tiết bài giảng, link, thiết bị, phiên bản | S04, S07 |
| [S09](tasks/S09-logs-ops.md) | P4 | Nhật ký truy cập, số liệu tổng quan, dọn dẹp, rate-limit | S05 |
| [S10](tasks/S10-e2e-release.md) | P4 | Kiểm thử E2E, checklist bảo mật, release | S06, S08, S09 |

## 6. Cách giao việc cho Codex

- Mỗi lần giao **một task**, kèm README này, ARCHITECTURE, SPEC, file task và file thiết kế liên quan.
- Codex **không commit**. Người review chạy `npm test`, `npm run check:syntax`, `cd frontend && npx vite build`,
  kiểm tra trên local rồi mới commit, mỗi task một commit.
- Mỗi task phải có test `node --test` trong `tests/`. Test không gọi R2 hay Redis thật: dùng storage `local` và
  store bộ nhớ (in-memory) có cùng interface.
- DB chỉ thay đổi qua migration mới. Số tiếp theo hiện tại là **160**; nếu đã bị dùng thì lấy số lớn nhất + 1.
- Repo public: không commit token, domain nội bộ, hay file bài giảng thật.
