# S08 · P3 · UI: Chi tiết bài giảng (SL2) + Tạo link (SL4)

## Mục tiêu
Admin quản lý toàn bộ vòng đời link và thiết bị của một bài trên một màn.

## Đọc trước
`../SPEC.md` §3, §4.1, §6, §8; `../designs/SL2-LectureDetail.html`, `SL4-ModalShare.html`, `SL4b-ModalShareCreated.html`.

## Làm
1. Route `/secure-lectures/lectures/:id`, trang `LectureDetailPage.jsx`:
   - Breadcrumb thư mục, h1, nút Di chuyển / Xem trước (mở tab preview) / Upload bản mới / Tạo link.
   - 4 thẻ số liệu.
   - Tab **Link chia sẻ**: bảng người nhận, mã `…{hint}`, hiệu lực, thiết bị x/y, đang mở x/y, trạng thái; nút
     Copy (chỉ copy được khi vừa tạo, nếu không thì tooltip "Link chỉ hiện lúc tạo"), Sửa, Gia hạn, Thu hồi (dialog
     nhập lý do, cảnh báo không hoàn tác).
   - Tab **Thiết bị & phiên**: chọn link → bảng thiết bị (nhãn, lần đầu, lần cuối, IP che 2 octet cuối, phiên đang mở);
     nút Đá phiên, Gỡ, Chặn/Bỏ chặn. Tự làm mới 15 s khi tab đang mở.
   - Tab **Phiên bản**: danh sách, Xem, Dùng bản này (xác nhận: link không cố định sẽ đổi theo).
   - Tab **Nhật ký**: bảng log của bài (dùng component của S09; nếu S09 chưa có thì để placeholder).
2. `ShareDialog.jsx` (tạo + sửa) theo SL4:
   - người nhận, bắt đầu, hết hạn (nút nhanh 7/30 ngày);
   - số thiết bị, mở cùng lúc (kiểm tra ≤ thiết bị);
   - phiên bản (luôn mới nhất / cố định);
   - 2 công tắc watermark và guard;
   - cảnh báo khi giảm số thiết bị dưới số hiện có.
3. `ShareCreatedDialog.jsx` theo SL4b: hiện URL đầy đủ, nút Copy (thông báo "Đã copy"), cảnh báo chỉ hiện 1 lần.
   Đóng thì xoá token khỏi state.
4. Nút "Tạo link" ở SL1 mở thẳng `ShareDialog` cho bài đó.

## Test
Build đạt; test thuần cho hàm định dạng trạng thái link và kiểm tra form.

## Xong khi
Trên local: tạo link, copy, mở bằng trình duyệt khác, thấy thiết bị và phiên xuất hiện, đá phiên, gỡ máy, thu hồi.
Khớp SL2/SL4 ở 1440px.
