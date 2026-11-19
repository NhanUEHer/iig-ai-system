# T06 · UI: A1 New item (2 steps)
**Goal**: `/content-studio/new` as `designs/StudioCreateEmpty.html` (step 1) and `designs/StudioReview.html` (step 2).

Depends on T04. Read `../SPEC.md` §5 A1.

## Do
- Step 1: folder chip (P2 picker, default from `?folderId`), title input (placeholder "Tự đặt theo nội dung khi
  bạn dán"), DOCX upload (also drag & drop onto the textarea), textarea, counter, guide cards, "Nội dung cần tạo"
  (4 tasks; vocab Level + Chọn từ), sticky bar; **Phân tách nội dung** calls `/detect` (or `/detect/docx`).
- Step 2: editable title, folder chip, collapsed source with "Sửa văn bản" (back to step 1, keep text), detection
  cards (passage; questions with all options; set a missing answer by clicking an option; "Đổi thành câu hỏi"
  may be omitted if not supported — keep the link hidden), checks list, tasks, sticky bar:
  Quay lại sửa văn bản · Chỉ lưu (`POST /items`, go to A2) · **Xác nhận & tạo nội dung** (`POST /items` with
  tasks, then `POST /items/:id/generate`, go to item page).
- Vocab level/mode must be stored with the item tasks (extend `tasks.vocab = {level, mode}` in backend if needed).

## Done when
Paste the sample letter → review shows 1 passage + 4 questions → confirm creates the item and lands on B1; build passes.
