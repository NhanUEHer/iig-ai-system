# A10 · P3 · UI: Danh sách Agent (C1) + Cấu hình & Chạy thử (C2)

## Mục tiêu
Admin xem toàn bộ agent, tạo/sửa cấu hình, chạy thử và phát hành trên giao diện, bám đúng canvas.

## Đọc trước
`../SPEC.md` §10, §11; canvas artboard C1, C2. API A09. Mẫu trang: `frontend/src/features/content-studio/`
(PageFrame, design-system-v2 `--iig3-*`, Button). Class prefix `aic-`, CSS riêng từng trang.

## Làm
1. Route `/ai-core` và `/ai-core/agents/:key` (+ `/ai-core/agents/new`), menu "AI Core" (quyền `ai_core.view`)
   trong `ApplicationSidebar.jsx`.
2. **C1** `AgentsPage.jsx`: 4 thẻ tổng quan (chi phí tháng/ngân sách + dự báo, lượt 7 ngày + % thành công,
   token 7 ngày, số agent cần chú ý); tìm kiếm + lọc tính năng/provider/trạng thái; bảng cột như canvas
   (agent+key, tính năng, model + dự phòng, phiên bản, max in/out, trần/lượt, thanh chi phí/ngân sách đổi màu
   khi ≥ ngưỡng, nhãn sức khoẻ); nút Kết nối & bảng giá, Nhật ký, + Tạo agent. Trạng thái rỗng/lỗi/đang tải.
3. **C2** `AgentEditorPage.jsx`: header (tên, key, nhãn Nháp vN / Đang chạy vM, Phiên bản, Nhật ký, Lưu nháp,
   Phát hành — disabled kèm tooltip khi chưa chạy thử đạt). Cột trái 4 khối:
   ① Mô hình (kết nối, model lọc theo provider, temperature, dự phòng, định dạng đầu ra);
   ② Prompt (system, user template, chip biến tự phát hiện từ `{{…}}`, JSON schema với kiểm tra cú pháp tại chỗ);
   ③ Giới hạn (max in, max out, timeout, retries, sửa JSON, concurrency);
   ④ Trần chi phí USD (trần/lượt, ngân sách tháng, ngưỡng %).
   Cột phải: Chạy thử (ô cho từng biến, ước tính trước, nút Chạy thử) và Kết quả (đạt/không, 4 ô token vào+cache,
   token ra/max, chi phí/trần, thời gian; 3 dòng kiểm tra; JSON được format, cuộn).
   Cảnh báo rời trang khi có thay đổi chưa lưu. Người chỉ có `view` thấy dạng chỉ đọc.
4. Phong cách theo trang Content Studio vừa làm: header breadcrumb + h1, khung bo 12px, input viền rõ, focus cam.

## Test
Build FE đạt; test logic thuần (phát hiện biến trong template, validate JSON schema text) nếu tách được.

## Xong khi
Trên local: tạo agent demo (kết nối fake), chạy thử, phát hành, thấy trong C1 với số liệu; khớp canvas ở 1440px
và không vỡ ở 1024px.
