# AI Core trên IIG Admin

Trạng thái: kiến trúc và phạm vi P0–P4 đã thống nhất, chưa triển khai.

Thiết kế giao diện và sơ đồ kiến trúc: canvas "AI Core – Quản lý Agent"
(C0 Kiến trúc, C1 Danh sách Agent, C2 Cấu hình + Chạy thử, C3 Phiên bản, C4 Nhật ký, C5 Kết nối & bảng giá).

## 1. Mục tiêu

Xây một module AI dùng chung trong IIG Admin, thay cho Dify:

- cấu hình mọi thứ trên hệ thống: kết nối provider, model, prompt (system + user + JSON schema), tham số;
- các tính năng chỉ gọi agent theo `key` qua một API, nhận về JSON đã kiểm schema;
- mỗi agent có **max token vào/ra, số lần thử lại, trần chi phí mỗi lượt, ngân sách tháng và ngưỡng cảnh báo**;
- mọi lượt gọi được ghi log kèm **phiên bản prompt**, token từng loại, giá lúc gọi và chi phí;
- chi phí tính bằng **USD** (quy đổi VND để giai đoạn sau);
- provider đầu tiên: **Gemini** và **DeepSeek**.

Agent ở đây tương đương một node LLM của Dify: một lượt gọi, ra một JSON. Chuỗi nhiều bước
(ví dụ Từ điển: bóc từ → định nghĩa) do code của tính năng điều phối, không dựng workflow kéo-thả.

## 2. Kiến trúc 6 layer

```text
L1 Tính năng sử dụng      Content Studio, key-vocab, dictionary, AI Scoring, hệ thống ngoài
        │  aiCore.run(agentKey, vars, ctx)   ·   POST /api/ai-core/agents/:key/run
L2 API & quản trị          SDK nội bộ · Run API · Admin API · phân quyền ai_core.*
        │  runner.execute(agent, vars, ctx)
L3 Agent runtime           nạp phiên bản → dựng prompt → kiểm JSON (sửa 1 lần) → trả kết quả
        │  guard pipeline
L4 Guard pipeline          input-guard → cost-guard → budget-guard → limiter → retry/fallback → usage-trace
        │  provider.generate(messages, options)
L5 Tích hợp AI bên ngoài   adapter Gemini · adapter DeepSeek · chuẩn hoá · kho khoá
        │  kết quả + usage
L6 Dữ liệu & quan sát      aic_connections · aic_models · aic_agents · aic_agent_versions
                           · aic_call_logs · aic_usage_daily · cảnh báo
```

Chi tiết từng layer, dữ liệu, API và quy tắc: [SPEC.md](SPEC.md).

## 3. Nguyên tắc bắt buộc

1. Tính năng **không** gọi thẳng provider, không đọc key, không tự dựng prompt. Chỉ `aiCore.run`.
2. **API key của provider lưu trong DB, mã hoá 2 chiều AES-256-GCM.** Đổi key trên màn Kết nối, không sửa code,
   không deploy. Env chỉ giữ **một** master key (`AI_CORE_MASTER_KEY`) dùng để mã hoá/giải mã; key provider
   không bao giờ nằm trong env, repo hay seed, và không bao giờ trả về trình duyệt (chỉ 4 ký tự cuối).
3. Log **chụp giá tại lúc gọi**; đổi bảng giá không làm sai lịch sử.
4. Mọi lượt gọi đều có log, kể cả bị chặn (`blocked`) hoặc lỗi.
5. Chỉ phát hành phiên bản agent đã **chạy thử đạt schema** ít nhất 1 lần.
6. Repo là public: không commit key, base URL nội bộ, giá hợp đồng riêng hay dữ liệu học viên.
7. Bảng mới dùng tiền tố `aic_`; bảng `ai_agents` cũ (chấm điểm, key-vocab) giữ nguyên, chuyển dần ở P5.

## 4. Lộ trình

| Phase | Nội dung | Task | Xong khi |
| --- | --- | --- | --- |
| P0 Nền móng | Khung module, migration, quyền, mã lỗi, mã hoá key | A01, A02 | Migration chạy, test mã hoá đạt |
| P1 Gọi AI thật | Adapter Gemini/DeepSeek, pricing, log, runtime, SDK | A03, A04, A05 | `aiCore.run` trả JSON đúng schema, log có chi phí USD |
| P2 Guard | Giới hạn token, trần, ngân sách, limiter, retry/fallback, tổng hợp + cảnh báo | A06, A07 | Test đủ kịch bản chặn và dự phòng |
| P3 Admin UI | API + 5 màn quản trị | A08–A11 | Tạo, chạy thử, phát hành agent không cần code |
| P4 Content Studio | 5 agent, thay mock, Từ điển chạy liền, chi phí theo học liệu | A12–A14 | Một bài gen đủ 4 tab bằng AI thật, xem được chi phí |
| P5 Mở rộng | Run API ngoài, chuyển key-vocab/dictionary/AI Scoring, cache/lô, VND, gỡ Dify | (sau) | Bỏ Dify |

```text
P0 → P1 → P2 ─┬→ P3 (UI)
              └→ P4 (Content Studio)     P3 và P4 chạy song song được
```

## 5. Danh sách task

| Task | Phase | Tên | Phụ thuộc |
| --- | --- | --- | --- |
| [A01](tasks/A01-foundation.md) | P0 | Khung module, migration, quyền, mã lỗi | – |
| [A02](tasks/A02-secrets.md) | P0 | Mã hoá key provider trong DB | A01 |
| [A03](tasks/A03-providers.md) | P1 | Adapter Gemini + DeepSeek, chuẩn hoá | A02 |
| [A04](tasks/A04-pricing-logs.md) | P1 | Pricing USD + ghi `aic_call_logs` | A01 |
| [A05](tasks/A05-runtime-sdk.md) | P1 | Agent runtime + SDK `aiCore.run` | A03, A04 |
| [A06](tasks/A06-guards.md) | P2 | Guard pipeline | A05 |
| [A07](tasks/A07-usage-alerts.md) | P2 | Tổng hợp ngày, sức khoẻ, cảnh báo | A04 |
| [A08](tasks/A08-admin-api-connections.md) | P3 | Admin API: kết nối, bảng giá, nhật ký | A02, A04 |
| [A09](tasks/A09-admin-api-agents.md) | P3 | Admin API: agent, phiên bản, chạy thử, phát hành | A05, A06 |
| [A10](tasks/A10-ui-agents.md) | P3 | UI: Danh sách Agent + Cấu hình/Chạy thử | A09 |
| [A11](tasks/A11-ui-versions-logs-connections.md) | P3 | UI: Phiên bản, Nhật ký, Kết nối & bảng giá | A08, A09 |
| [A12](tasks/A12-cs-agents.md) | P4 | 5 agent Content Studio (prompt + schema) | A05 |
| [A13](tasks/A13-cs-provider.md) | P4 | Content Studio gọi AI Core, Từ điển chạy liền | A06, A12 |
| [A14](tasks/A14-cs-cost-errors.md) | P4 | Chi phí theo học liệu + thông báo lỗi | A13 |

## 6. Cách giao việc

- Mỗi task giao cho Codex một lần, kèm: README này, SPEC, file task. Codex không commit.
- Mỗi task phải kèm test (`node --test`), không gọi provider thật trong test (dùng adapter giả `fake`).
- Người review chạy `npm test`, `cd frontend && npx vite build`, kiểm tra trên local rồi mới commit.
- Thay đổi DB chỉ qua migration mới, số tiếp theo sau migration lớn nhất hiện có (hiện tại 152).
