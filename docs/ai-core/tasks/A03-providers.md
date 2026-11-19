# A03 · P1 · Adapter Gemini + DeepSeek

## Mục tiêu
Gọi được 2 provider qua cùng một giao diện, trả usage chuẩn hoá.

## Đọc trước
`../SPEC.md` §5, §8. Tài liệu API chính thức của Gemini (`generateContent`, `countTokens`) và DeepSeek
(`/chat/completions`, usage cache hit/miss).

## Làm
1. `providers/gemini.js`, `providers/deepseek.js`, `providers/fake.js`, `providers/index.js` (`get(name)`).
   Giao diện đúng §5: `generate`, `countTokens`, `check`. Dùng `fetch` có sẵn của Node, `AbortController` cho timeout.
2. `providers/normalize.js`: map usage và `finishReason` theo bảng §5; map HTTP lỗi → `{ retryable, code }`
   (`AUTH_FAILED`, `PROVIDER_DOWN`, `TIMEOUT`).
3. Gemini: chuyển JSON Schema nội bộ sang `responseSchema` (bỏ từ khoá không hỗ trợ); `systemInstruction`.
4. DeepSeek: `response_format: json_object`; nếu system/user không chứa chữ "json" thì thêm câu
   "Return the answer as JSON." vào cuối system. `countTokens` ước lượng theo §5.
5. `fake.js`: hàng đợi phản hồi lập trình được (`fake.enqueue({text, usage, finishReason} | {error})`) cho test.
6. Không log key; lỗi trả `message` đã làm sạch (không chứa key/URL có key).

## Test
`tests/ai-core-providers.test.js` mock `fetch`: request body đúng cho từng provider; usage chuẩn hoá đúng
(Gemini có cache + thinking; DeepSeek cache hit/miss + reasoning); finish map; 401→AUTH_FAILED không retryable;
429/503→retryable; timeout → TIMEOUT.

## Xong khi
Test đạt. (Tuỳ chọn, không bắt buộc trong CI) script `scripts/ai-core-smoke.js <connectionId> <model>` gọi thật 1 lần.
