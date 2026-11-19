# A09 · P3 · Admin API: agent, phiên bản, chạy thử, phát hành

## Mục tiêu
Backend cho C1, C2, C3 và Run API nội bộ.

## Đọc trước
`../SPEC.md` §1, §2 (`aic_agents`, `aic_agent_versions`), §7 (agents), §10. Runtime A05, guard A06, health A07.

## Làm
1. `agents/agentService.js`:
   - `list()` → agent + bản published (model, version, max token, trần) + chi phí tháng + ngân sách + health.
   - `create({key, name, feature, ...limits, draft})` tạo agent + draft v1.
   - `update(key, patch)` chỉ các trường agent (tên, mô tả, status, trần, ngân sách, ngưỡng, concurrency).
   - `saveDraft(key, draft)`: chưa có draft → copy từ published; mọi lần lưu xoá `last_test_ok_at`.
     Validate: kết nối active, model có giá, `output_schema` là JSON Schema hợp lệ, biến trong template khớp
     `variables`, giới hạn trong khoảng hợp lý (max_input ≤ context_window, max_output ≤ 65536, retries 0–5).
   - `test(key, variables, userId)` → `aiCore.testRun` + checks `{schemaOk, notTruncated, underCeiling}` + preview.
   - `publish(key, userId)`: 409 nếu `last_test_ok_at` null; published cũ → archived; set `published_version_id`;
     xoá cache registry.
   - `versions(key)` + số liệu từng phiên bản từ log; `diff(key, a, b)` (trường tham số + diff dòng của prompt/schema);
     `restore(key, v)` tạo draft từ v.
2. `routes/agents.js` theo §7, gồm `POST /agents/:key/run` (quyền `ai_core.run`).
3. Mọi thao tác ghi audit.
4. Bổ sung service FE.

## Test
`tests/ai-core-admin-agents.test.js`: tạo/sửa/validate; không phát hành khi chưa chạy thử; sửa draft sau chạy thử
→ phải chạy lại; publish chuyển archived; restore; run dùng bản published; quyền.

## Xong khi
Test đạt; luồng tạo → chạy thử (fake) → phát hành → run hoạt động qua API.
