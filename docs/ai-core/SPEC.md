# AI Core — Đặc tả kỹ thuật

Đọc kèm [README.md](README.md). Mọi task A01–A14 tham chiếu các mục trong file này.

## 1. Khái niệm

| Khái niệm | Ý nghĩa |
| --- | --- |
| **Kết nối (connection)** | Một tài khoản provider: provider, tên, API key (mã hoá), base URL tuỳ chọn, bật/tắt. |
| **Model** | Một model của provider kèm giá USD / 1M token và context tối đa. |
| **Agent** | Đơn vị gọi AI có `key` cố định (vd `cs.dict.define`), thuộc một tính năng. Tương đương node LLM. |
| **Phiên bản agent** | Bộ cấu hình bất biến: prompt, schema, model, tham số, giới hạn. Trạng thái `draft` → `published` → `archived`. Mỗi agent có tối đa 1 `published` và 1 `draft`. |
| **Lượt gọi (call)** | Một lần `aiCore.run`. Luôn có 1 dòng `aic_call_logs`, kể cả khi bị chặn. |

Trần chi phí và ngân sách thuộc **agent** (không theo phiên bản) để rollback không làm mất cấu hình tiền.
Max token, retry, timeout, prompt, model thuộc **phiên bản**.

## 2. Mô hình dữ liệu (migration A01)

Tiền tố `aic_`. Tiền lưu `NUMERIC(14,8)` USD. Thời gian `TIMESTAMPTZ`.

### `aic_connections`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| provider | TEXT | `gemini` \| `deepseek` (CHECK, mở rộng sau) |
| name | TEXT UNIQUE | vd `Gemini · prod` |
| api_key_ciphertext | BYTEA | AES-256-GCM, xem §6 |
| api_key_iv | BYTEA | 12 byte |
| api_key_tag | BYTEA | 16 byte |
| api_key_last4 | TEXT | hiển thị |
| key_version | INT | phiên bản master key đã dùng |
| base_url | TEXT NULL | NULL = mặc định của provider |
| status | TEXT | `active` \| `disabled` |
| last_check_at, last_check_ok, last_check_ms, last_check_error | | kết quả "Kiểm tra kết nối" |
| created_by, updated_by, created_at, updated_at | | |

### `aic_models`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| provider | TEXT | |
| model | TEXT | vd `gemini-2.5-flash`; UNIQUE(provider, model) |
| price_in_per_m | NUMERIC | USD / 1M token vào (không cache) |
| price_cached_in_per_m | NUMERIC | USD / 1M token vào trúng cache |
| price_out_per_m | NUMERIC | USD / 1M token ra (gồm token suy nghĩ) |
| context_window | INT | |
| effective_from | TIMESTAMPTZ | |
| status | TEXT | `active` \| `disabled` |

### `aic_agents`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| key | TEXT UNIQUE | `^[a-z0-9]+(\.[a-z0-9_]+)+$`, bất biến sau khi tạo |
| name, description | TEXT | |
| feature | TEXT | vd `content-studio` |
| status | TEXT | `active` \| `paused` |
| max_cost_per_call_usd | NUMERIC | trần mỗi lượt |
| monthly_budget_usd | NUMERIC | ngân sách tháng (theo tháng dương lịch, giờ Asia/Ho_Chi_Minh) |
| alert_threshold_pct | INT | mặc định 80 |
| max_concurrency | INT | mặc định 4 |
| published_version_id | UUID NULL FK | |
| created_by, updated_by, created_at, updated_at | | |

### `aic_agent_versions`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| agent_id | UUID FK | |
| version | INT | tăng dần theo agent; UNIQUE(agent_id, version) |
| status | TEXT | `draft` \| `published` \| `archived` |
| connection_id | UUID FK | kết nối chính |
| model | TEXT | |
| fallback_connection_id, fallback_model | NULL | dự phòng |
| system_prompt | TEXT | |
| user_template | TEXT | có `{{biến}}` |
| variables | JSONB | `[{ "name": "sentence", "required": true, "description": "" }]` |
| output_schema | JSONB | JSON Schema (draft 2020-12, tập con, §5) |
| temperature | NUMERIC | 0–2 |
| max_input_tokens | INT | |
| max_output_tokens | INT | gồm token suy nghĩ |
| timeout_ms | INT | mặc định 60000 |
| max_retries | INT | 0–5, mặc định 2 |
| repair_invalid_json | BOOLEAN | mặc định true |
| change_note | TEXT | |
| last_test_ok_at | TIMESTAMPTZ NULL | lần chạy thử đạt gần nhất (bắt buộc trước khi phát hành) |
| created_by, published_by, created_at, published_at | | |

Phiên bản đã `published`/`archived` là **bất biến**. Sửa = tạo/sửa `draft` mới copy từ bản đang chạy.

### `aic_call_logs`
| Cột | Kiểu | Ghi chú |
| --- | --- | --- |
| id | UUID PK | |
| agent_id, version_id | FK | |
| agent_key, version | TEXT, INT | copy để truy vấn nhanh |
| mode | TEXT | `run` \| `test` (chạy thử, không tính ngân sách) |
| feature | TEXT | |
| ref_type, ref_id | TEXT NULL | vd `cs_item`, id học liệu |
| user_id | NULL | NULL = hệ thống/worker |
| provider, model, connection_id | | model thực sự đã chạy |
| used_fallback | BOOLEAN | |
| attempts | INT | số lần gọi provider |
| status | TEXT | `success` \| `failed` \| `blocked` |
| error_code, error_message | NULL | mã §8; message cắt 500 ký tự |
| finish_reason | TEXT | chuẩn hoá: `stop` \| `length` \| `safety` \| `other` |
| input_tokens | INT | không cache |
| cached_input_tokens | INT | |
| output_tokens | INT | gồm thinking |
| thinking_tokens | INT | thông tin thêm |
| estimated_max_cost_usd | NUMERIC | ước tính trước khi gọi |
| cost_usd | NUMERIC | chi phí thật |
| price_snapshot | JSONB | `{in, cachedIn, out}` USD/1M tại lúc gọi |
| schema_valid_first_try | BOOLEAN | |
| repaired | BOOLEAN | |
| latency_ms | INT | |
| request_preview, response_preview | TEXT NULL | prompt đã dựng và output thô, cắt 20 KB; xem §9 |
| created_at | | |

Index: `(agent_id, created_at DESC)`, `(created_at DESC)`, `(ref_type, ref_id)`, `(status, created_at)`.

### `aic_usage_daily`
Khoá `(day, agent_id, mode)`: `calls, success, failed, blocked, truncated, schema_first_try_ok, fallback,
input_tokens, cached_input_tokens, output_tokens, cost_usd, latency_p95_ms`. Cập nhật bởi job A07.

## 3. Luồng một lượt gọi

```text
aiCore.run(key, vars, ctx)
 1. registry: nạp agent + phiên bản published (draft nếu mode=test)     → CONFIG_MISSING / AGENT_PAUSED
 2. template: kiểm biến bắt buộc, điền {{biến}}                          → VARIABLES_INVALID
 3. input-guard: đếm token vào ≤ max_input_tokens                        → INPUT_TOO_LARGE
 4. cost-guard: estimate = in×giá_in + max_out×giá_out ≤ max_cost_per_call → COST_CEILING
 5. budget-guard: spent_month + estimate ≤ monthly_budget (bỏ qua mode=test) → QUOTA_EXCEEDED
 6. limiter: chờ slot (agent, provider); quá 30s                          → TIMEOUT
 7. provider.generate (timeout_ms), retry 429/5xx/timeout tối đa max_retries, back-off 1s·2s·4s (+jitter)
    hết retry và có fallback → quay lại bước 3–4 với model dự phòng rồi gọi   → PROVIDER_DOWN nếu vẫn lỗi
 8. finish_reason = length                                               → OUTPUT_TRUNCATED (không repair)
 9. schema: parse + validate; sai và repair_invalid_json → gọi lại 1 lần với lỗi validate → SCHEMA_INVALID
10. usage-trace: tính cost thật, ghi aic_call_logs (mọi nhánh, kể cả lỗi ở bước 1–9)
11. trả { data, callId, usage, costUsd, agentKey, version, provider, model, usedFallback }
```

Lỗi ném ra luôn là `AiCoreError { code, message, callId, retryable }`.

## 4. Chi phí (USD)

```text
cost = input_tokens        / 1e6 × price_in_per_m
     + cached_input_tokens / 1e6 × price_cached_in_per_m
     + output_tokens       / 1e6 × price_out_per_m
estimate_max = counted_input / 1e6 × price_in_per_m + max_output_tokens / 1e6 × price_out_per_m
```

- Lần repair JSON và mọi lần retry đều cộng vào `cost` của lượt (cộng usage các lần gọi).
- `spent_month` = tổng `cost_usd` của agent, `mode='run'`, từ đầu tháng (Asia/Ho_Chi_Minh). Đọc từ
  `aic_usage_daily` + log hôm nay; cache 30 giây trong bộ nhớ.
- Làm tròn hiển thị 4 chữ số thập phân; lưu đủ 8.

## 5. Provider

Giao diện adapter (`providers/<name>.js`):

```js
{
  name: 'gemini',
  async generate({ apiKey, baseUrl, model, system, user, schema, temperature, maxOutputTokens, timeoutMs, signal })
    // → { text, finishReason, usage: { input, cachedInput, output, thinking }, raw }
  async countTokens({ apiKey, baseUrl, model, system, user }) // → number
  async check({ apiKey, baseUrl })                             // → { ok, ms, models? }
}
```

| | Gemini | DeepSeek |
| --- | --- | --- |
| Endpoint | `models/{model}:generateContent` | `/chat/completions` (kiểu OpenAI) |
| System | `systemInstruction` | message `role: system` |
| JSON | `responseMimeType: application/json` + `responseSchema` (bản đã chuyển đổi) | `response_format: {type: json_object}`; prompt phải chứa chữ "json" |
| Max out | `maxOutputTokens` | `max_tokens` |
| Đếm token | `:countTokens` | ước lượng: `ceil(chars / 3.5)` × 1.1 (an toàn) |
| Usage | `promptTokenCount`, `cachedContentTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount` | `prompt_cache_miss_tokens`, `prompt_cache_hit_tokens`, `completion_tokens`, `completion_tokens_details.reasoning_tokens` |
| finish | `STOP`→stop, `MAX_TOKENS`→length, `SAFETY`/`RECITATION`→safety | `stop`→stop, `length`→length, khác→other |
| Lỗi có thể retry | 429, 500, 503, timeout | 429, 500, 503, timeout |
| Lỗi không retry | 400, 401, 403 (`AUTH_FAILED`), 404 | 400, 401, 402 (hết tiền → `PROVIDER_DOWN`), 422 |

Chuẩn hoá: `input` = token vào **không** cache (Gemini: `promptTokenCount − cachedContentTokenCount`);
`output` = `candidates + thoughts` (Gemini) hoặc `completion_tokens` (DeepSeek, đã gồm reasoning).

Schema: hỗ trợ tập con `type, properties, required, items, enum, description, nullable, minItems, maxItems`.
Validator nội bộ dùng `ajv` (đã có hoặc thêm dependency) cho mọi provider.

Adapter `fake` (chỉ dùng trong test và khi `AI_CORE_PROVIDER_OVERRIDE=fake`): trả output cấu hình sẵn, usage giả.

## 6. Bảo mật key (A02)

- Mã hoá **AES-256-GCM** (2 chiều) bằng `AI_CORE_MASTER_KEY` (32 byte, base64) trong env.
  Đây là **biến env duy nhất** của AI Core; key provider chỉ nằm trong DB dạng mã hoá.
- Hỗ trợ xoay master key: `AI_CORE_MASTER_KEY_V{n}` + `AI_CORE_MASTER_KEY_CURRENT=n`; mỗi dòng lưu
  `key_version`; script `scripts/ai-core-rotate-master-key.js` mã hoá lại toàn bộ.
- Key giải mã chỉ tồn tại trong bộ nhớ lúc gọi; cache tối đa 5 phút; không log, không trả API.
- API trả `apiKeyLast4` thay cho key. Đổi key = gửi key mới, server mã hoá và thay.
- Thiếu master key → module khởi động ở trạng thái `CONFIG_MISSING`, các lượt gọi trả lỗi rõ ràng, server
  vẫn chạy.

## 7. API

Prefix `/api/ai-core`. Mọi route cần đăng nhập. Quyền: `ai_core.view`, `ai_core.manage`, `ai_core.run`.

| Method | Endpoint | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/connections` | view | Danh sách kết nối (không có key) |
| POST | `/connections` | manage | Tạo `{provider, name, apiKey, baseUrl?}` |
| PATCH | `/connections/:id` | manage | Đổi tên, base URL, `apiKey` mới, status |
| POST | `/connections/:id/check` | manage | Kiểm tra kết nối |
| GET | `/models` | view | Bảng giá |
| PUT | `/models` | manage | Lưu bảng giá (danh sách) |
| GET | `/agents` | view | Danh sách + số liệu tháng + sức khoẻ |
| POST | `/agents` | manage | Tạo agent + draft v1 |
| GET | `/agents/:key` | view | Agent + bản published + draft |
| PATCH | `/agents/:key` | manage | Tên, mô tả, status, trần, ngân sách, ngưỡng, concurrency |
| PUT | `/agents/:key/draft` | manage | Lưu draft (tạo từ bản published nếu chưa có) |
| POST | `/agents/:key/test` | manage | Chạy thử draft `{variables}` → kết quả + usage + checks |
| POST | `/agents/:key/publish` | manage | Phát hành draft (409 nếu chưa có lần chạy thử đạt sau lần sửa cuối) |
| GET | `/agents/:key/versions` | view | Danh sách phiên bản + số liệu |
| GET | `/agents/:key/versions/:a/diff/:b` | view | So sánh |
| POST | `/agents/:key/versions/:v/restore` | manage | Tạo draft từ phiên bản cũ |
| POST | `/agents/:key/run` | run | Chạy bản published `{variables, ref?}` |
| GET | `/logs` | view | Lọc `agentKey, status, from, to, refType, refId`, keyset pagination |
| GET | `/logs/:id` | view | Chi tiết (preview prompt/output cần `manage`) |
| GET | `/usage` | view | Chuỗi chi phí theo ngày, tổng tháng, dự báo |
| GET | `/logs/export` | view | CSV theo bộ lọc, tối đa 50.000 dòng |

Response lỗi chuẩn của repo: `{ error: { code, message } }`; mã AI Core giữ nguyên trong `code`.

## 8. Mã lỗi

| Code | HTTP | Retry tính năng? | Khi nào |
| --- | --- | --- | --- |
| `CONFIG_MISSING` | 503 | không | Thiếu master key, agent chưa có bản published, kết nối tắt |
| `AGENT_PAUSED` | 409 | không | Agent `paused` |
| `VARIABLES_INVALID` | 400 | không | Thiếu biến bắt buộc |
| `INPUT_TOO_LARGE` | 422 | không | Vượt `max_input_tokens` |
| `COST_CEILING` | 422 | không | Ước tính vượt trần mỗi lượt |
| `QUOTA_EXCEEDED` | 429 | sau (tháng sau / nâng ngân sách) | Hết ngân sách tháng |
| `OUTPUT_TRUNCATED` | 502 | có (sau khi chỉnh) | `finish_reason=length` |
| `SCHEMA_INVALID` | 502 | có | Sai schema sau repair |
| `PROVIDER_DOWN` | 503 | có | Hết retry, không có/không qua fallback |
| `AUTH_FAILED` | 502 | không | Key sai/hết hạn |
| `TIMEOUT` | 504 | có | Hết timeout hoặc chờ limiter quá lâu |

## 9. Dữ liệu nhạy cảm trong log

- `request_preview`/`response_preview` chỉ lưu khi `mode='test'` hoặc agent bật `log_payload` (mặc định tắt cho
  `run`). Chỉ người có `ai_core.manage` xem được.
- Tự động xoá preview sau 30 ngày (job A07). Số liệu token/chi phí giữ vô thời hạn.

## 10. Sức khoẻ agent (A07, hiển thị C1/C2)

Tính trên 7 ngày, `mode='run'`:

| Chỉ số | Cảnh báo khi |
| --- | --- |
| chi phí TB / trần mỗi lượt | > 70% |
| % `OUTPUT_TRUNCATED` | > 2% |
| % JSON đúng ngay lần đầu | < 95% |
| % `blocked` | > 0 |
| dự báo cuối tháng (tiêu TB/ngày × số ngày) | > ngân sách |
| % lỗi provider | > 5% |

Nhãn: `Ổn định` nếu không có cảnh báo; nếu có, hiện cảnh báo nặng nhất ("Sát trần 74%", "4% bị cắt token"…).
Cảnh báo ngân sách gửi thông báo admin 1 lần mỗi ngưỡng mỗi tháng (dùng hệ thống notification hiện có nếu có,
nếu chưa thì chỉ hiện trên UI).

## 11. Màn hình (P3)

Route FE `/ai-core/*`, menu "AI Core" nhóm "AI Scoring" hoặc nhóm hệ thống (theo sidebar hiện tại).

| Màn | Route | Task |
| --- | --- | --- |
| C1 Danh sách Agent | `/ai-core` | A10 |
| C2 Cấu hình + Chạy thử | `/ai-core/agents/:key` | A10 |
| C3 Phiên bản | `/ai-core/agents/:key/versions` | A11 |
| C4 Nhật ký & chi phí | `/ai-core/logs` | A11 |
| C5 Kết nối & bảng giá | `/ai-core/connections` | A11 |

Giao diện theo design-system-v2 (`--iig3-*`), class prefix `aic-`, bám canvas.
