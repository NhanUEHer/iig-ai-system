# KPI Master và snapshot kỳ báo cáo

## Mục tiêu

KPI được quản trị tập trung theo từng bộ phận. Người nhập phiếu chỉ cập nhật kế hoạch, thực hiện và dữ liệu chi tiết; không được tự thêm hoặc xóa KPI. Cách này giữ cùng một cấu trúc đo lường giữa các tháng và giúp dữ liệu dashboard có thể so sánh ổn định.

## Luồng nghiệp vụ

1. Quản trị viên mở **Báo cáo → Cấu hình KPI**, chọn bộ phận và tạo KPI.
2. Hệ thống tự sinh mã KPI theo tiền tố bộ phận; quản trị viên cấu hình tên, đơn vị, chiều đánh giá và thứ tự.
3. Khi tạo kỳ báo cáo, hệ thống chụp toàn bộ KPI đang hoạt động thành snapshot của kỳ.
4. Mỗi phiếu bộ phận sử dụng đúng snapshot này. Bộ KPI không thể thêm, xóa hoặc thay đổi cấu trúc trong phiếu.
5. Người dùng nhập kế hoạch, giá trị thực hiện thủ công và thêm/bớt các dòng dữ liệu chi tiết.
6. KPI có nguồn **Tự tính** được tính lại từ dữ liệu chi tiết; dữ liệu tháng trước và cùng kỳ lấy từ phiên bản đã publish tương ứng.
7. Sau duyệt và publish, dashboard đọc snapshot và giá trị đã publish. Thu hồi tạo phiên bản nháp mới nhưng vẫn giữ nguyên snapshot lịch sử.

## Quy tắc

- Mã KPI là duy nhất, do hệ thống sinh và không cho sửa.
- Xóa KPI là vô hiệu hóa mềm; chỉ ảnh hưởng kỳ được tạo sau đó.
- Sửa tên, đơn vị, chiều đánh giá chỉ áp dụng cho kỳ mới. Kỳ cũ dùng metadata snapshot.
- `Tăng tốt`: đạt khi thực hiện lớn hơn hoặc bằng kế hoạch.
- `Giảm tốt`: đạt khi thực hiện nhỏ hơn hoặc bằng kế hoạch.
- `Theo dõi`: không xếp đạt/chưa đạt và không tham gia điểm sức khỏe tổng hợp.
- KPI tự tính không cho sửa trực tiếp giá trị thực hiện.
- Dòng chi tiết là dữ liệu vận hành nên vẫn được phép thêm/xóa trong phiếu nháp.
- Backend từ chối lưu nếu danh sách mã KPI gửi lên khác snapshot của phiếu.

## Kiến trúc dữ liệu

- `report_kpi_definitions`: master KPI hiện hành của từng bộ phận.
- `report_kpi_definition_audit_logs`: lịch sử tạo, sửa, vô hiệu hóa và sắp xếp KPI.
- `report_kpi_values`: giá trị KPI theo phiên bản, đồng thời lưu snapshot mã, tên, đơn vị, chiều đánh giá, công thức và thứ tự.
- `report_detail_rows`: các dòng dữ liệu chi tiết động.
- `report_data_versions`: phiên bản nháp/publish giúp thu hồi và publish lại mà không ghi đè lịch sử.

## Phạm vi tiếp theo

- Gán người phụ trách/backup theo bộ phận và kỳ báo cáo.
- Quy trình đề nghị thay đổi KPI có hiệu lực từ kỳ tương lai.
- Ngày hiệu lực và phiên bản bộ KPI để lập kế hoạch thay đổi trước nhiều tháng.
- Cảnh báo KPI thiếu dữ liệu, trễ hạn và nhật ký phê duyệt chi tiết.
