# A05 · P1 · Agent runtime + SDK `aiCore.run`

## Mục tiêu
Một hàm duy nhất để mọi tính năng gọi agent: nạp phiên bản, dựng prompt, gọi provider, kiểm JSON, ghi log.

## Đọc trước
`../SPEC.md` §1, §3 (bước 1, 2, 7 bản đơn giản, 8–11), §5 (schema), §8.

## Làm
1. `agents/registry.js`: `load(key, {mode})` → `{agent, version}` (published, hoặc draft khi `mode='test'`);
   cache theo `version.id` 60s; lỗi `CONFIG_MISSING` / `AGENT_PAUSED`.
2. `runtime/template.js`: thay `{{name}}` (cho phép khoảng trắng, chỉ tên biến, không biểu thức); giá trị object/array
   → `JSON.stringify`; thiếu biến bắt buộc → `VARIABLES_INVALID` (liệt kê tên); biến thừa bỏ qua.
3. `runtime/schema.js`: validate bằng ajv (thêm dependency nếu chưa có), trả danh sách lỗi dễ đọc;
   parse chấp nhận JSON bọc trong ```json … ```.
4. `runtime/runner.js`: `execute({key, variables, ctx, mode})` theo §3. Ở task này guard chỉ là các hàm "pass"
   (A06 sẽ lắp vào): gọi provider 1 lần, `finish=length` → `OUTPUT_TRUNCATED`, repair JSON 1 lần nếu bật
   (prompt repair: gửi lại output + lỗi validate, yêu cầu chỉ trả JSON đúng schema). Luôn ghi log qua A04 trong `finally`.
5. `index.js`: `run(key, variables, ctx = {feature, refType, refId, userId})` → kết quả §3 bước 11.
   `testRun(key, variables, userId)` = `mode:'test'`, cập nhật `last_test_ok_at` của draft khi đạt.
6. Seed qua script `scripts/ai-core-seed-demo.js` (không phải migration): agent `demo.echo` dùng adapter fake.

## Test
`tests/ai-core-runtime.test.js` dùng adapter `fake`: thành công; thiếu biến; JSON bọc markdown; sai schema → repair
thành công (2 lượt usage cộng dồn, `repaired=true`); repair vẫn sai → `SCHEMA_INVALID`; `length` → `OUTPUT_TRUNCATED`;
log được ghi ở mọi nhánh; testRun cập nhật `last_test_ok_at`.

## Xong khi
Test đạt; `node scripts/ai-core-seed-demo.js && node -e "require('./src/modules/ai-core').run('demo.echo',{text:'hi'})"`
trả JSON và có 1 dòng log.
