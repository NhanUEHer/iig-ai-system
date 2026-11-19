# A11 · P3 · UI: Phiên bản (C3), Nhật ký & chi phí (C4), Kết nối & bảng giá (C5)

## Mục tiêu
Hoàn thiện 3 màn còn lại theo canvas.

## Đọc trước
`../SPEC.md` §7, §9, §11; canvas C3, C4, C5. API A08, A09. Cùng quy ước UI như A10.

## Làm
1. **C3** `/ai-core/agents/:key/versions`: cột trái danh sách phiên bản (nhãn Nháp/Đang chạy/Lưu trữ, thời gian,
   ghi chú, số liệu: lượt, chi phí TB, % JSON đúng, % cắt); cột phải so sánh 2 phiên bản chọn được (bảng tham số
   đổi màu chỗ khác, diff dòng system/user/schema), nút Khôi phục (tạo draft) và Phát hành.
2. **C4** `/ai-core/logs`: bộ lọc (khoảng ngày, agent, trạng thái, nguồn) giữ trên URL; biểu đồ cột chi phí theo
   ngày (tự vẽ bằng div/SVG, không thêm thư viện lớn); bảng lượt gọi (thời gian, agent+phiên bản, model, token
   vào/ra, chi phí, thời gian xử lý, kết quả có màu, nguồn link tới học liệu khi `ref_type='cs_item'`);
   bấm dòng mở panel chi tiết (token có cache, giá lúc gọi, số lần thử, lỗi, gợi ý khi bị cắt; nút xem prompt/
   đầu ra thô nếu có quyền); Xuất CSV; phân trang "Tải thêm".
3. **C5** `/ai-core/connections`: thẻ kết nối (provider, tên, key che 4 ký tự cuối, base URL, model dùng được,
   số agent đang dùng, kiểm tra gần nhất), nút Kiểm tra kết nối / Đổi key (dialog nhập key mới, không hiện key cũ) /
   Tạm tắt; dialog + Thêm kết nối; bảng giá sửa trực tiếp + Lưu, ghi chú "đổi giá chỉ áp dụng lượt sau".

## Test
Build FE đạt.

## Xong khi
Trên local: thêm kết nối (key giả), sửa giá, chạy demo vài lượt, thấy log + biểu đồ + chi tiết; so sánh 2 phiên
bản và khôi phục được.
