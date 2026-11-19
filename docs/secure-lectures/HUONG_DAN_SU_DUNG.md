# Hướng dẫn sử dụng Bài giảng bảo mật cho admin

## 1. Upload bài giảng

1. Mở **Tạo & phát triển → Bài giảng bảo mật**.
2. Chọn thư mục đích hoặc tạo thư mục mới.
3. Bấm **Tải bài giảng lên**, chọn một file `.html` tự chứa, tối đa 20 MB.
4. Nhập tiêu đề, ghi chú nếu cần rồi xác nhận.
5. Mở trang chi tiết và dùng **Xem trước** để kiểm tra slide, âm thanh, font và phím điều hướng.

Chỉ upload nội dung đã được phép phát hành. File phải tự chứa; các lệnh gọi mạng ra ngoài sẽ bị CSP chặn khi giáo viên trình chiếu.

## 2. Tạo và gửi link

1. Trong trang chi tiết bài giảng, mở tab **Link chia sẻ** và bấm **Tạo link**.
2. Nhập tên người nhận (tên này xuất hiện trong watermark), thời hạn, số thiết bị tối đa và số thiết bị mở cùng lúc.
3. Giữ watermark và guard bật, trừ khi có phê duyệt khác.
4. Bấm tạo rồi sao chép link ngay. Token chỉ hiển thị một lần; hệ thống không thể lấy lại link cũ.
5. Gửi link qua kênh riêng cho đúng người nhận. Nếu mất link, thu hồi link cũ và tạo link mới.

## 3. Khi giáo viên báo “đã đủ thiết bị”

1. Mở bài giảng → **Link chia sẻ**, chọn đúng người nhận.
2. Mở danh sách **Thiết bị & phiên** và đối chiếu tên trình duyệt, thời gian, IP gần nhất với giáo viên.
3. Chọn thiết bị cũ/không còn dùng và bấm **Gỡ thiết bị**. Không gỡ thiết bị đang dùng nếu chưa xác minh.
4. Yêu cầu giáo viên mở lại link. Trình duyệt đó sẽ được đăng ký như thiết bị mới nếu còn chỗ.
5. Nếu thấy thiết bị lạ, **Chặn thiết bị**, thu hồi link và tạo link mới; kiểm tra tab **Nhật ký**.

Thông báo **“đã mở ở thiết bị khác”** là giới hạn mở cùng lúc, không phải giới hạn tổng thiết bị. Giáo viên có thể chọn đá phiên kia; admin cũng có thể đá phiên từ tab thiết bị.

## 4. Thu hồi, gia hạn và xử lý sự cố

- **Gia hạn:** sửa thời điểm hết hạn khi link vẫn hợp lệ.
- **Thu hồi:** dùng khi gửi nhầm hoặc nghi lộ link. Thu hồi không hoàn tác; phiên đang mở sẽ dừng ở heartbeat kế tiếp.
- **Link hết hạn/không hợp lệ:** kiểm tra hạn, trạng thái thu hồi và đúng link người nhận; không yêu cầu giáo viên gửi token lên kênh công khai.
- **Mất kết nối:** yêu cầu thử lại một lần, kiểm tra mạng rồi báo vận hành kèm thời gian, tên bài và người nhận — không gửi token đầy đủ.
- **Nghi mở DevTools:** hệ thống chỉ ghi sự kiện để điều tra, không tự khóa giáo viên.

