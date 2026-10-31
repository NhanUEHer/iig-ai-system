# Module 06 — Chi tiết bài chấm, điểm và timeline

## Mục tiêu

Cho phép điều tra một bài end-to-end và xem đúng ID câu/nhóm từ dữ liệu nguồn mà không sửa điểm.

## Solution đề xuất

Job detail được dựng từ scoring plan đã sealed và immutable attempt lineage. FE hiển thị cây plan/run/group/question theo dữ liệu thật, tải tab nặng theo nhu cầu và không suy luận completion từ số section cố định.

## API

### IIG Admin BFF

| Method | Endpoint | Mục đích |
| --- | --- | --- |
| GET | `/api/ai-scoring/jobs/:jobId` | Tổng quan job và section |
| GET | `/api/ai-scoring/jobs/:jobId/result` | Kết quả final theo score/detail contract |
| GET | `/api/ai-scoring/jobs/:jobId/attempts` | Attempt/retry/rescore lineage |
| GET | `/api/ai-scoring/jobs/:jobId/plan` | Scoring plan, expected counts và run/group tree |
| GET | `/api/ai-scoring/jobs/:jobId/questions` | Danh sách câu và state |
| GET | `/api/ai-scoring/jobs/:jobId/questions/:questionId` | Chi tiết câu |
| GET | `/api/ai-scoring/jobs/:jobId/groups/:groupId` | Chi tiết score group và câu áp dụng |
| GET | `/api/ai-scoring/jobs/:jobId/timeline` | Event timeline |
| GET | `/api/ai-scoring/jobs/:jobId/model-executions` | Lineage model đã redact |

### AI Scoring Admin API tương ứng

Cùng resource dưới `/api/admin/v1/scoring-jobs/:jobId/*`.

## Result contract tối thiểu

- `scores[]`: `groupId`, `appliedQuestionIds[]`, `score`, rule/version metadata.
- `details[]`: `questionId`, `comment`, `errors[]`, `transcript`.
- Error gồm `span/evidence`, `type`, `priority/severity`, `comment`.
- ID nhóm và câu phải là source ID/canonical mapping đã kéo từ IIG, không dùng index UI thay thế.

## Business rules

- Chỉ trả final result khi job có kết quả; nếu đang chạy trả 409 `RESULT_NOT_READY` kèm current status.
- Result bất biến theo scoring run. Rescore tạo run mới, không overwrite lịch sử.
- Transcript chỉ hiển thị cho người có permission detail; media dùng short-lived proxy/presigned URL nếu thực sự cần nghe.
- Timeline sắp theo occurredAt và sequence; duplicate delivery không tạo duplicate event hiển thị.
- Model execution chỉ trả provider/model/policy/prompt version, trạng thái và latency cần cho điều tra; không trả usage/cost, prompt secret, API key hoặc raw provider response chứa PII.
- Zero-resolution phải hiển thị origin/reason/metadata để phân biệt không làm bài với lỗi kỹ thuật.

## Màn hình

Route `/ai-scoring/jobs/:jobId` gồm:

- Header: identity, tenant, trạng thái, duration, source IDs.
- Section cards Speaking/Writing.
- Score group cards và câu áp dụng.
- Bảng các câu thuộc scoring plan thực tế: state, score, zero reason, retry, duration.
- Drawer câu: prompt metadata an toàn, transcript, score, comment, error evidence.
- Timeline stage/event.
- Model lineage: provider/model/prompt version và latency.
- Webhook delivery liên quan.
- Khu vực thao tác vận hành theo permission.

## Luồng nghiệp vụ

1. FE tải overview trước, sau đó tải song song plan/questions/timeline khi tab được mở.
2. BFF kiểm tra permission chi tiết và gọi các endpoint admin tenant-safe.
3. AI Scoring dựng cây từ scoring plan đã sealed, không từ số section/câu hard-code.
4. Question/group/run được map bằng canonical IDs và lineage của đúng attempt.
5. Result chỉ xuất hiện khi attempt terminal thành công; attempt cũ vẫn truy cập được sau retry/rescore.

### Quy tắc hoàn tất

- Plan phải `SEALED` và đủ `expected_run_count`, `expected_question_count`, `expected_group_count`.
- Mọi run/question/group bắt buộc phải terminal.
- Group `COMPLETED` phải có `final_score`.
- Failure/review được roll up theo severity; không tự biến lỗi kỹ thuật thành completed-with-issues.
- S-only/W-only hoàn tất theo đúng scope của plan, không chờ section không tồn tại.

## Thiết kế database/read model

- `iig_ai_scoring_plans`: scope và expected counts bất biến.
- `iig_ai_scoring_runs`: một run theo policy/group, status và run lineage.
- `iig_ai_question_runs`: trạng thái/score/error từng câu.
- `iig_ai_group_results`: aggregation status và final score.
- `iig_ai_section_statuses`: projection trạng thái section.
- `iig_processing_events`, `iig_ai_scoring_events`: timeline append-only.
- `iig_ai_model_executions`: lineage provider/model/prompt/latency đã redact.

Không tạo bảng detail riêng trong IIG Admin. Nếu cần read model, nó vẫn thuộc DB/migration của AI Scoring.

## Performance/NFR

- Overview/plan p95 <= 1 giây; questions/timeline p95 <= 1.5 giây.
- Tab nặng lazy-load và pagination; không trả raw model output/media mặc định.
- Query bounded theo một job/attempt và dùng bulk joins, không N+1 theo question/group.
- Active job polling backoff 5–30 giây và dừng khi terminal hoặc tab không còn visible.

## Task triển khai

- **AI Scoring:** detail/result/plan/question/timeline repositories và DTO redaction.
- **IIG Admin BE:** BFF endpoints, permission theo mức list/detail/lineage.
- **IIG Admin FE:** overview, plan tree, section/run/group cards, question drawer, attempts và timeline.
- **Data mapping:** chuẩn hóa source IDs, status enums và zero-resolution display.

## Test cần có

- S-only 11 câu/4 group; W-only theo plan; S+W đầy đủ.
- Thiếu question/group hoặc group thiếu final score giữ `PROCESSING`.
- Failure/review severity roll-up đúng.
- Retry/rescore xem đúng attempt, không trả nhầm result cũ.
- Timeline có thứ tự ổn định và không duplicate do event redelivery.
- Permission/redaction cho transcript, media và model lineage.

## Acceptance criteria

- AC1: Bài completed hiển thị đủ section, score group và câu theo scoring plan/source ID của attempt.
- AC2: `appliedQuestionIds` khớp mapping canonical đã dùng khi chấm.
- AC3: Job chưa final không trả nhầm result cũ của cùng keycode/scoring ID.
- AC4: Rescore cho phép xem từng run riêng và không mất lịch sử.
- AC5: Timeline phản ánh đúng thứ tự source → media → STT → score → group → final/webhook.
- AC6: Nội dung nhạy cảm không xuất hiện nếu người dùng chỉ có quyền list.

## Permission cần khai báo

- `ai_scoring.jobs.view`
- `ai_scoring.jobs.view_detail`
- `ai_scoring.jobs.view_model_lineage`
