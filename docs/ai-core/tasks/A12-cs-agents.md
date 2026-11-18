# A12 · P4 · 5 agent cho Content Studio

## Mục tiêu
Định nghĩa prompt + JSON schema + giới hạn cho 5 agent, khớp đúng dữ liệu Content Studio đang lưu.

## Đọc trước
`../SPEC.md` §2, §5; `docs/content-studio/SPEC.md` (dữ liệu từng tab, 13 trường từ điển, 4 trường câu hỏi);
validators hiện tại `src/modules/content-studio/generation/validators.js`; định dạng mock trong
`generation/mockProvider.js` (output agent phải map được sang cùng cấu trúc); prompt Dify cũ để tham khảo
(`src/clients/*DifyClient.js`, `docs/KEY_VOCAB_DIFY_WORKFLOW.md`) — chỉ đọc.

## Làm
1. Thư mục `src/modules/content-studio/agents/` gồm 5 file định nghĩa (system, user template, variables,
   output_schema, model đề xuất, giới hạn đề xuất):
   | key | biến | đầu ra |
   | --- | --- | --- |
   | `cs.vocab` | passage, level, mode | items[{inText, lemma, pos, ipa, meaningVi}] |
   | `cs.dict.extract` | sentences (mảng có index), level | sentences[{index, chunks[]}] |
   | `cs.dict.define` | passage, batch (mảng {index, sentence, chunks}) | entries[{sentenceIndex, 13 trường}] |
   | `cs.translate` | sentences | sentences[{en, vi}] |
   | `cs.question_pack` | passage, question (stem, options, answerKey) | {translation, hint, explanation, note} |
2. Script `scripts/ai-core-seed-content-studio.js`: tạo/cập nhật 5 agent (draft) từ các file trên, gán kết nối theo
   tên truyền vào tham số (`--gemini "Gemini · prod" --deepseek "DeepSeek · prod"`); không phát hành tự động.
3. Mapper `src/modules/content-studio/generation/aiCoreMapping.js`: chuyển output agent → cấu trúc nội bộ
   (giống mockProvider) + test.
4. Bộ input mẫu (bài Letter trong `tests/fixtures/content-studio-letter.txt`) để admin chạy thử ở C2.

## Test
`tests/content-studio-ai-mapping.test.js`: output mẫu đúng schema của từng agent map ra cấu trúc mà validators
hiện tại chấp nhận; schema của 5 agent compile được bằng ajv.

## Xong khi
Test đạt; seed chạy được; chạy thử từng agent trên C2 với key thật (do người review làm) cho kết quả đạt.
