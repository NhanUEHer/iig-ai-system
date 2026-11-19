# S09 · P4 · Nhật ký truy cập, số liệu, dọn dẹp, rate-limit

## Mục tiêu
Admin truy vết được mọi lượt mở; hệ thống tự dọn dữ liệu; số liệu tổng quan chính xác.

## Đọc trước
`../ARCHITECTURE.md` §7, §9; `../SPEC.md` §3 (`/logs`, `/overview`), §6.
Mẫu job định kỳ: `src/services/mappingSyncScheduler.js`.

## Làm
1. `GET /logs` có lọc (bài, link, sự kiện, khoảng ngày), phân trang cursor. Trả kèm tên bài, người nhận, nhãn thiết bị.
2. Hoàn thiện số liệu SPEC §6 cho `/overview` và chi tiết bài. Viết query gộp, có index phù hợp (thêm migration nếu
   thiếu).
3. FE:
   - Component `AccessLogTable` dùng ở tab Nhật ký (SL2).
   - Trang "Nhật ký truy cập" (nút ở SL1) với bộ lọc.
   - Nhãn sự kiện tiếng Việt.
   - Lọc nhanh "Bị từ chối".
4. Job mỗi giờ (`secureLectureMaintenance.js`, chỉ chạy ở 1 instance nhờ khoá Redis `SET NX EX`):
   - đóng phiên DB không heartbeat > TTL (`end_reason='timeout'`);
   - xoá log quá `LOG_RETENTION_DAYS`;
   - xoá blob và version của bài lưu trữ > 30 ngày;
   - ghi log tóm tắt ra console.
5. Rà rate-limit và log che token (S05, S06) dưới tải: script `scripts/secure-lectures-load.js` giả lập 200 thiết bị
   heartbeat, đo p95.

## Test
`tests/secure-lectures-maintenance.test.js`: job đóng đúng phiên chết, xoá đúng log cũ, không xoá bài lưu trữ < 30 ngày.
Query số liệu trả đúng trên dữ liệu mẫu.

## Xong khi
Màn nhật ký lọc được; job chạy được 2 lần liên tiếp không lỗi; tải 200 thiết bị p95 heartbeat < 100 ms trên local.
