# AI Scoring Management trên IIG Admin

Trạng thái: phạm vi chức năng Phase 1 đã thống nhất, chưa phải xác nhận đã triển khai.

## 1. Mục tiêu

Xây dựng module quản lý vận hành AI Scoring trên IIG Admin để:

- cấu hình account kết nối, API token và webhook cho hệ thống tích hợp;
- tra cứu và điều tra toàn bộ vòng đời một yêu cầu chấm;
- retry, cancel, rescore hoặc reconcile theo đúng lifecycle, không sửa DB thủ công;
- theo dõi API, worker, queue, lỗi và audit trên một giao diện chung.

AI Scoring được thiết kế như một service độc lập. IIG Admin chỉ đóng vai trò portal/BFF:

```text
IIG Admin FE
  -> IIG Admin BE /api/ai-scoring/*
    -> AI Scoring Admin API /api/admin/v1/*
      -> AI Scoring DB + Redis Streams
```

IIG Admin không kết nối trực tiếp PostgreSQL hoặc Redis của AI Scoring.

### Ownership và giao tiếp giữa hai hệ thống

- **IIG Admin FE** sở hữu giao diện, trạng thái màn hình và permission-based UX.
- **IIG Admin BE/BFF** xác thực user nội bộ, kiểm tra permission, chuẩn hóa request/response và gọi AI Scoring bằng service credential.
- **AI Scoring microservice** sở hữu tenant, credential, webhook, scoring lifecycle, dữ liệu bền vững, queue và mọi business rule.
- **PostgreSQL/Redis của AI Scoring** không được truy cập trực tiếp từ IIG Admin.
- Admin mutation đi theo luồng: `FE -> BFF -> Admin API -> transaction/outbox -> worker`; BFF không tự cập nhật trạng thái scoring.
- Các endpoint `/api/admin/v1/*` trong bộ tài liệu này là contract cần xây thêm nếu chưa tồn tại trong source hiện tại.

## 2. Nhóm tính năng Phase 1

### A. Kết nối hệ thống

1. **Quản lý account tích hợp** — Tạo, cập nhật, khóa hoặc mở account của hệ thống gọi AI Scoring. Không xây dashboard vận hành riêng theo từng account.
2. **Quản lý API token** — Sinh token, chọn scope, đặt hạn dùng, rotate hoặc thu hồi. Raw token chỉ hiển thị một lần; hệ thống chỉ lưu hash và prefix.
3. **Cấu hình webhook** — Khai báo HTTPS endpoint, sự kiện cần nhận, trạng thái endpoint và signing secret.
4. **Kiểm tra webhook** — Gửi synthetic event để kiểm tra URL, chữ ký và phản hồi của hệ thống nhận.
5. **Lịch sử gửi webhook** — Tra cứu delivery, HTTP status, số lần thử, lỗi và thời điểm retry; cho phép replay delivery thất bại.

### B. Tra cứu bài chấm

6. **Danh sách scoring job** — Hiển thị job ID, scoring ID, keycode, account, phạm vi `S`, `W` hoặc `S+W`, trạng thái và tiến độ.
7. **Tìm kiếm và lọc job** — Tìm theo định danh; lọc theo account, phạm vi chấm, trạng thái, stage, lỗi, thời gian và SLA.
8. **Chi tiết scoring job** — Hiển thị nguồn đầu vào, ingestion, AI Scoring, lỗi hiện tại, kết quả và trạng thái tổng.
9. **Scoring plan** — Hiển thị section, run, câu và score group mà hệ thống thực sự lập kế hoạch cho attempt; không giả định luôn có cả S và W.
10. **Chi tiết câu hỏi** — Hiển thị trạng thái, loại câu, agent/policy/version, kết quả, lỗi và thời gian xử lý của từng câu.
11. **Chi tiết score group** — Hiển thị các câu thuộc group, trạng thái tổng hợp, final score, policy/version và nguyên nhân chưa terminal.
12. **Lịch sử attempt** — Hiển thị attempt đầu tiên, retry/rescore, lineage, trạng thái và kết quả từng lần mà không ghi đè lịch sử.
13. **Timeline xử lý** — Hiển thị các stage từ tiếp nhận đến final/webhook cùng thời gian, retry và lỗi tại từng bước.
14. **Theo dõi lỗi và retry** — Phân loại lỗi, cho biết retryability, số lần thử và lần retry tiếp theo.

### C. Vận hành job

15. **Retry job** — Tạo hoặc tiếp tục attempt theo action backend cho phép; bắt buộc có lý do và idempotency key.
16. **Cancel job** — Terminalize work item còn hoạt động, giữ evidence đã hoàn tất và ngăn event cũ làm job chạy lại.
17. **Rescore job** — Tạo attempt/run mới từ canonical input, giữ nguyên kết quả cũ và lineage.
18. **Reconcile trạng thái** — Tính lại trạng thái từ scoring plan, question và group thực tế; admin không được tự đặt `COMPLETED`.

### D. Giám sát hệ thống

19. **Dashboard vận hành** — Tổng hợp completed, processing, failed, needs-review, latency, top error và job chậm; không bao gồm usage/cost.
20. **Giám sát API và worker** — Hiển thị health độc lập của API, worker, PostgreSQL, Redis, consumer count và revision đang chạy.
21. **Giám sát queue** — Hiển thị backlog, pending, retry scheduled, dead-letter, stale consumer và job vượt SLA.

### E. Quản trị truy cập

22. **Phân quyền và audit** — Kiểm soát quyền xem/vận hành/quản lý kết nối; ghi actor, action, lý do, trạng thái trước/sau và request ID cho mọi mutation.

## 3. Tài liệu chi tiết

| File | Module |
| --- | --- |
| [00-solution-architecture.md](00-solution-architecture.md) | Kiến trúc solution, code map, performance và kế hoạch triển khai |
| [01-dashboard.md](01-dashboard.md) | Dashboard vận hành |
| [02-tenants.md](02-tenants.md) | Account/tenant tích hợp |
| [03-api-credentials.md](03-api-credentials.md) | API token/credential |
| [04-webhooks.md](04-webhooks.md) | Webhook, kiểm tra và delivery |
| [05-scoring-jobs.md](05-scoring-jobs.md) | Danh sách và bộ lọc job |
| [06-scoring-job-detail.md](06-scoring-job-detail.md) | Job detail, scoring plan, câu, group, attempt và timeline |
| [07-operations.md](07-operations.md) | Retry, cancel, rescore và reconcile |
| [08-system-monitoring.md](08-system-monitoring.md) | API, worker, queue, lỗi và cảnh báo |
| [09-permissions-audit.md](09-permissions-audit.md) | Permission và audit |

## 4. Chuẩn API chung

- IIG Admin FE chỉ gọi `/api/ai-scoring/*` bằng session/JWT hiện có.
- IIG Admin BE gọi AI Scoring Admin API bằng service credential riêng, không tái sử dụng token của account tích hợp.
- Response thành công: `{ "success": true, "data": ... }`.
- Response lỗi: `{ "success": false, "code": "...", "error": "...", "requestId": "..." }`.
- List API dùng `page`, `pageSize`, `sort`, filter tường minh và trả `items`, `page`, `pageSize`, `total`.
- Mọi thời gian trả ISO-8601 UTC; frontend hiển thị theo múi giờ người dùng.
- Không trả secret, access token, signed media URL hoặc raw candidate payload trong list API.
- Mọi endpoint kiểm tra permission ở IIG Admin BE; AI Scoring Service tiếp tục kiểm tra service identity và phạm vi admin API.

## 5. Quy tắc completion bắt buộc

- Một request có thể chấm `S`, `W` hoặc `S+W`.
- Section, question, score group và agent/policy phải lấy từ scoring plan thực tế.
- Chỉ terminal khi đủ số question/group dự kiến và mọi phần tử bắt buộc đã terminal.
- Group `COMPLETED` phải có final score hợp lệ.
- Không hard-code số section, số câu hoặc quy tắc “một section hoàn tất thì toàn bài hoàn tất”.
- Retry/rescore tạo lịch sử bất biến; không ghi đè attempt cũ.

## 6. Ngoài phạm vi Phase 1

- Thống kê usage, token và chi phí AI.
- Billing/invoice.
- Dashboard vận hành riêng cho từng tenant/account.
- Tenant tự đăng nhập portal.
- Trình chỉnh sửa agent, prompt, policy hoặc score group.
- API chấm trực tiếp bằng payload và API chấm từng câu.
- Chỉnh sửa trực tiếp điểm/trạng thái hoặc thao tác trực tiếp PostgreSQL/Redis từ UI.

## 7. Definition of Done chung

- Admin có thể tạo account, sinh token, cấu hình và test webhook hoàn toàn trên UI.
- Operator có thể tìm một job, xác định node bị lỗi và thực hiện action hợp lệ mà không cần SSH/SQL.
- Positive/negative permission tests có cho mọi endpoint.
- Tenant isolation và service-to-service authentication được kiểm thử.
- Mutation có audit và idempotency khi phù hợp; không log secret hoặc raw candidate payload.
- Loading, empty, error và permission-denied state có trên mọi màn hình.
- API timeout không làm UI treo; lỗi AI Service được map thành mã lỗi ổn định.
- Unit test service/repository, API integration test và frontend interaction test đạt yêu cầu trước Beta.
