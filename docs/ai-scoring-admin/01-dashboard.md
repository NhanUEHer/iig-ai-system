# Module 01 — Dashboard vận hành AI Scoring

## Mục tiêu

Cung cấp ảnh chụp vận hành theo thời gian và cho phép drill-down vào danh sách job tương ứng. Phase 1 không bao gồm usage hoặc chi phí AI.

## Solution đề xuất

AI Scoring cung cấp metrics/read-model APIs theo cùng filter context; IIG Admin BFF chỉ proxy có kiểm soát và FE render dashboard/drill-down. Aggregate nặng được cache hoặc materialize trong AI Scoring, không tính lại ở browser/BFF.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/dashboard/summary` | KPI tổng hợp theo khoảng thời gian/tenant |
| GET | `/api/ai-scoring/dashboard/throughput` | Số job theo thời gian và trạng thái |
| GET | `/api/ai-scoring/dashboard/latency` | Average/P50/P95/P99 theo section/stage |
| GET | `/api/ai-scoring/dashboard/failures` | Phân bố lỗi và top error code |
| GET | `/api/ai-scoring/dashboard/queue-health` | Queue lag, pending và worker health rút gọn |

Query chung: `from`, `to`, `tenantId`, `environment`, `granularity`.

### AI Scoring Admin API tương ứng

`GET /api/admin/v1/metrics/summary`, `/throughput`, `/latency`, `/failures`, `/queues`.

## Business rules

- Mặc định hiển thị 24 giờ gần nhất; tối đa 90 ngày cho truy vấn online.
- KPI chỉ đếm job production hoặc theo đúng `environment` được chọn.
- Success rate = job terminal thành công / tổng job terminal; job đang chạy không tính vào mẫu số.
- Total duration tính từ `acceptedAt` đến thời điểm section/job cuối cùng hoàn tất, không dùng timestamp ingestion trung gian.
- P95 chỉ hiển thị khi có đủ mẫu; nếu không trả `null` kèm `sampleSize`.
- Tất cả card có filter đồng nhất và link drill-down giữ nguyên filter.

## Màn hình

Một màn hình `/ai-scoring` gồm:

- Bộ lọc thời gian, tenant, môi trường.
- KPI cards: tổng job, completed, processing, failed, needs review, success rate.
- Biểu đồ throughput theo thời gian.
- Biểu đồ latency tổng/section/stage.
- Top lỗi gần nhất.
- Queue health rút gọn.
- Danh sách job chậm hoặc thất bại gần nhất.
- Thời điểm dữ liệu cập nhật và nút refresh.

## Luồng nghiệp vụ

1. FE gửi filter thời gian, tenant và environment tới IIG Admin BFF.
2. BFF kiểm tra `ai_scoring.dashboard.view` rồi chuyển filter đã chuẩn hóa sang AI Scoring Admin API.
3. AI Scoring đọc aggregate từ durable PostgreSQL; queue health lấy qua service abstraction, không để BFF đọc Redis.
4. API trả cùng một `filterContext`/`generatedAt` để các card dùng chung một snapshot logic.
5. Khi click card, FE điều hướng sang Job List và giữ nguyên filter bằng query string.

## Thiết kế dữ liệu

- Phase 1 ưu tiên query/read model từ `iig_scoring_jobs`, `iig_submissions`, `iig_ai_section_statuses`, `iig_processing_events`, outbox và event publication.
- Không tạo bảng usage/cost.
- Nếu truy vấn online không đạt SLA, bổ sung aggregate table/materialized view bằng migration append-only; không sao chép dữ liệu sang DB của IIG Admin.
- Queue/worker health là dữ liệu runtime và phải trả `unknown` khi không đo được, không tự suy ra `healthy` từ API health.

## Performance/NFR

- Dashboard p95 <= 1.5 giây với filter tối đa 90 ngày trên dataset chuẩn Phase 1.
- Cache aggregate 5–15 giây theo filter; luôn trả `generatedAt` để UI biết độ mới.
- Không chạy full-table count/percentile trực tiếp cho mỗi lần refresh khi vượt SLA; chuyển sang aggregate read model.
- Một dependency monitoring timeout không được làm thất bại toàn bộ dashboard.

## Task triển khai

- **AI Scoring:** xây metrics repository/service và `/api/admin/v1/metrics/*`.
- **IIG Admin BE:** xây BFF routes, service client, permission guard và error mapping.
- **IIG Admin FE:** dashboard, filter đồng bộ, drill-down và loading/empty/error states.
- **Database:** index/read model cần thiết sau khi đo query plan.

## Test cần có

- Unit test công thức success rate, latency percentile và sample-size rule.
- Integration test filter/timezone/tenant và tenant isolation.
- Contract test BFF ↔ Admin API.
- Frontend test drill-down giữ filter và các trạng thái loading/empty/error/403.
- Health test chứng minh worker down không bị hiển thị healthy chỉ vì API còn sống.

## Acceptance criteria

- AC1: Người có quyền xem mở dashboard và nhận dữ liệu trong phạm vi filter.
- AC2: Thay tenant/thời gian cập nhật tất cả card và biểu đồ đồng nhất.
- AC3: Click một KPI mở danh sách job với filter tương ứng.
- AC4: Không có dữ liệu hiển thị empty state, không hiển thị `0%` sai nghĩa.
- AC5: Khi AI Service không khả dụng, UI hiển thị lỗi có request ID và vẫn cho retry.
- AC6: Người không có permission nhận 403 từ backend kể cả khi gọi API trực tiếp.

## Permission cần khai báo

- `ai_scoring.dashboard.view`
