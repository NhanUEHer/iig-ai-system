# A14 · P4 · Chi phí theo học liệu + thông báo lỗi AI

## Mục tiêu
Người làm nội dung biết mỗi học liệu tốn bao nhiêu và hiểu vì sao một phần gen không chạy.

## Đọc trước
`../SPEC.md` §7 (logs lọc theo ref), §8; trang chi tiết học liệu `ContentStudioItemPage.jsx`, `ArtifactShell.jsx`.

## Làm
1. API `GET /api/content-studio/items/:id/ai-cost` → `{ totalUsd, calls, byAgent: [{agentKey, calls, costUsd}] }`
   (từ `aic_call_logs` với `ref_type='cs_item'`). Quyền `content_studio.view`.
2. UI chi tiết học liệu: dòng nhỏ cạnh meta "1 đoạn văn · 4 câu hỏi" hiện "AI: $0.0123 · 18 lượt"; bấm mở popover
   chia theo agent; người có `ai_core.view` có link "Xem nhật ký" tới C4 lọc theo học liệu.
3. Thông báo lỗi theo mã (trong ArtifactShell và tab Từ điển):
   | code | Thông báo |
   | --- | --- |
   | `QUOTA_EXCEEDED` | "Đã hết ngân sách AI tháng này cho phần này. Liên hệ quản trị." |
   | `COST_CEILING` / `INPUT_TOO_LARGE` | "Nội dung quá dài so với giới hạn. Hãy chia nhỏ đoạn văn." |
   | `CONFIG_MISSING` / `AUTH_FAILED` | "AI chưa được cấu hình. Liên hệ quản trị." |
   | `PROVIDER_DOWN` / `TIMEOUT` | "Dịch vụ AI đang bận. Bấm Tạo lại sau ít phút." |
   | `SCHEMA_INVALID` / `OUTPUT_TRUNCATED` | "AI trả kết quả chưa đúng. Bấm Tạo lại." |
4. Trang chủ Content Studio: không thêm gì (giữ gọn).

## Test
Test API tổng chi phí; build FE đạt.

## Xong khi
Trên local (AI Core fake) chi phí hiện đúng tổng log; mỗi mã lỗi hiển thị đúng câu.
