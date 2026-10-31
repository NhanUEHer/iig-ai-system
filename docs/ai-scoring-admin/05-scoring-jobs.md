# Module 05 — Danh sách yêu cầu chấm

## Mục tiêu

Tra cứu toàn bộ request chấm và xác định nhanh job đang ở state nào, thuộc tenant nào và có cần can thiệp không.

## Solution đề xuất

AI Scoring dựng một tenant-safe read projection từ job, submission, plan và section status. BFF cung cấp API nhất quán cho FE; list chỉ trả aggregate metadata để giữ response nhỏ và an toàn.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/jobs` | Danh sách job có filter/phân trang |
| GET | `/api/ai-scoring/jobs/facets` | Danh mục trạng thái, tenant, error code dùng cho filter |
| GET | `/api/ai-scoring/jobs/export` | Export metadata theo filter giới hạn |

### AI Scoring Admin API tương ứng

`GET /api/admin/v1/scoring-jobs`, `/facets`, `/export`.

Filter: `tenantId`, `jobId`, `scoringId`, `keycode`, `scope` (`S`/`W`/`S+W`), `status`, `sectionStatus`, `stage`, `errorCode`, `from`, `to`, `durationGte`, `hasRetry`, `page`, `pageSize`, `sort`.

## Business rules

- Tìm chính xác theo job ID/scoring ID; keycode được normalize uppercase.
- Job phải hiển thị phạm vi chấm được nhận diện từ scoring plan: chỉ Speaking, chỉ Writing hoặc cả hai.
- Trạng thái tổng và trạng thái Speaking/Writing là độc lập, không ghi đè nhau.
- Duration lấy từ accepted đến terminal hoặc thời điểm hiện tại nếu còn chạy.
- List chỉ trả metadata và aggregate progress; không trả transcript/candidate answer.
- Export có giới hạn khoảng thời gian và số dòng, chạy async khi vượt ngưỡng nhỏ.
- Job retry/rescore là bản ghi riêng và phải liên kết `retryOfJobId`/run lineage.

## Màn hình

Route `/ai-scoring/jobs`:

- Search job ID, scoring ID, keycode.
- Filter tenant, trạng thái, section, stage, error, khoảng thời gian, vượt SLA.
- Cột job, tenant, source identity, phạm vi `S`/`W`/`S+W`, status, current stage, tiến độ question/group, section status, duration, retry, webhook, acceptedAt.
- Badge phân biệt terminal, processing, retry scheduled và needs review.
- Click hàng mở trang chi tiết.
- Export theo filter hiện tại.

## Luồng nghiệp vụ

1. FE giữ filter trong URL và gửi tới BFF.
2. BFF validate page size/sort/filter, kiểm tra permission và gọi AI Scoring Admin API.
3. AI Scoring query tenant-scoped read model, trả aggregate progress; không trả candidate payload.
4. FE render job list và mở detail bằng `jobId` bất biến.
5. Export (nếu bật) dùng cùng filter; query lớn chạy async và phải có audit/access record.

## Thiết kế database/read model

Nguồn dữ liệu thuộc AI Scoring:

- `iig_scoring_jobs`: identity, ingestion state, progress, retry và timestamps;
- `iig_submissions`: canonical submission và `ai_scoring_status`;
- `iig_ai_scoring_plans`: requested groups và expected counts;
- `iig_ai_section_statuses`: trạng thái S/W;
- `integration_tenants`: account filter;
- processing/scoring events: current stage/error projection.

Index tối thiểu cần đánh giá: tenant + accepted time, tenant + source scoring ID, status + updated time, keycode + accepted time. Không query Redis để tạo danh sách job.

## Performance/NFR

- Job list p95 <= 800 ms với page <= 100 trên dataset chuẩn 1 triệu job.
- Sort ổn định theo `(acceptedAt, jobId)`; deep pagination dùng cursor/keyset.
- Search exact ID/keycode phải dùng index; filter rộng bắt buộc có time range hợp lý.
- Không query question/group riêng cho từng row; progress/scope phải lấy từ bounded aggregate/read model.

## Task triển khai

- **AI Scoring:** list/facets repository, stable pagination, scope projection và admin DTO.
- **IIG Admin BE:** BFF route, filter validation, permission và timeout/error mapping.
- **IIG Admin FE:** table, search/filter, URL state, pagination, badges và SLA indicator.
- **Database:** bổ sung index sau khi kiểm tra `EXPLAIN ANALYZE` với dữ liệu gần production.

## Test cần có

- Search chính xác job/scoring ID và normalize keycode.
- Kết hợp filter tenant/scope/status/stage/error/time.
- Stable pagination khi job mới được insert.
- S-only, W-only và S+W hiển thị đúng scope/progress.
- Tenant isolation và response không chứa transcript, secret hoặc signed URL.
- Frontend giữ filter khi back/forward và chuyển sang detail.

## Acceptance criteria

- AC1: Kết hợp filter trả đúng tập dữ liệu và giữ filter trên URL.
- AC2: Job đang chạy hiển thị stage mới nhất và duration tăng hợp lý.
- AC3: Job cùng keycode nhưng khác scoring ID vẫn là các bản ghi độc lập.
- AC4: Retry/rescore hiển thị liên kết với job gốc.
- AC5: Không có transcript, secret hoặc signed URL trong list response/export.
- AC6: Pagination/sort ổn định khi có job mới phát sinh.

## Permission cần khai báo

- `ai_scoring.jobs.view`
- `ai_scoring.jobs.export`
