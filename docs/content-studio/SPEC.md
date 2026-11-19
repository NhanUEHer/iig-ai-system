# Content Studio — functional spec

## 0. Current state (already in code, branch `feat/content-studio-p0`)
- Tables: `cs_folders`, `cs_items` (+`tasks` jsonb), `cs_segments`, `cs_questions`, `cs_artifacts`,
  `cs_artifact_versions` (migrations 149–151).
- Detection: `detect/detectContent.js` (passages, question sets, options, answer keys, Part 6/7, sentences),
  DOCX text extraction `detect/docxText.js`.
- Generation: `generation/generationService.js` (queue in `cs_artifacts`, in-process worker, retries),
  `mockProvider.js` + `mockFixtures.js`, `validators.js`.
- Artifact types: `vocab`, `dictionary` (single blob — **to be replaced**, see B2), `passage_translation`,
  `question_pack` (per question: `translation` string, `hint`, `explanation`, `note`).
- API: `/api/content-studio/folders|items|detect|detect/docx|items/:id/generate|items/:id/content|artifacts/:id(/regenerate)`.
- UI: a first version of the main page and item page exists; it must be reworked to match the designs.

## 1. Process (per item)
```
B0 Nhập & nhận diện
 ├─ B1 Từ vựng ............ 1 call (level + mode) → list
 ├─ B2a Bóc từ ............ 1 call → word list per sentence  ─► B2b reviewer edits & saves ─► B2c generate (1 call per sentence)
 ├─ B3 Dịch ............... 1 call → sentence translations
 └─ B4 Câu hỏi ............ 1 call per question (or per set) → 4 fields
```
- B1, B2a, B3, B4 are independent and run in parallel. Only B2a → B2b → B2c is sequential.
- "Lưu & tạo nội dung" / "Xác nhận & tạo nội dung" queues B1, B2a, B3, B4 for the ticked tasks. B2 stops at
  status **Chờ duyệt danh sách** until the reviewer presses **Tạo từ điển**.

## 2. Statuses
Per artifact / per dictionary entry: `queued`, `generating`, `ready` (Hoàn tất), `needs_review` (Cần xem lại,
validator issues), `failed` (Lỗi). Dictionary list adds `draft` (Chờ duyệt danh sách).
Tab dots: grey = not created, blue = running, amber = waiting review / needs review, green = done, red = failed.
Item status is derived from its artifacts at read time (never stored as truth).

## 3. Data model changes
### Dictionary (replaces the `dictionary` artifact blob)
```
cs_dict_sentences(id, item_id, segment_id, position, text, status, updated_at)
cs_dict_candidates(id, item_id, sentence_id, position, chunk, status draft|queued|generating|ready|needs_review|failed,
                   attempts, error, locked_at, created_at, updated_at)
cs_dict_entries(id, candidate_id unique, content jsonb, validation jsonb, source ai|human, provider, updated_at)
cs_dict_attempts(id, candidate_id, attempt, request jsonb, response jsonb, error, duration_ms, created_at)
```
Entry content = the 13 legacy fields:
`inText, lemma, pos, ipa, meaningVi, meaningEn, sentence, context, example{en,vi}, collocations[], synonyms[], wordFamily[]`
(sentence comes from the sentence row; 13 = inText, lemma, pos, ipa, meaningVi, meaningEn, sentence, context,
example.en, example.vi, collocations, synonyms, wordFamily).

### Rules carried over from the legacy dictionary
- Extract output `{sentences:[{sentence_text, items[]}]}`; each sentence must be inside the passage
  (normalised whitespace/case), each chunk must appear exactly in its sentence; de-duplicate per sentence;
  max 300 chunks.
- Generation batch = all queued candidates of one sentence; send `target_chunk` as a JSON array; the response
  `dictionary_entries[]` must have the same length; `context_analysis.original_sentence` must match the sentence;
  map by order; `word_family` string is split on ` - ` / `–`.
- Retry 3× with back-off (5 s × attempt); timeout 150 s (no retry on timeout); stale `generating` > timeout+30 s
  becomes `failed`. Concurrency 4.
- Editing a candidate's chunk after generation marks it `draft` again ("cần tạo lại").

## 4. API additions
| Method | Path | Purpose |
|---|---|---|
| GET | `/folders/summary` | Root folders with item count, unit children (name, count), `pendingReview`, `needsReview`, `updatedAt`; plus unfiled count |
| GET | `/items/recent?limit=5` | Recent items for A0 with derived next action |
| GET | `/attention` | Counts for the A0 banner (items waiting dictionary review, items needing review) |
| POST | `/items/:id/dictionary/extract` | Run B2a (queues job) |
| GET | `/items/:id/dictionary` | Sentences, candidates, entries, counts |
| PUT | `/items/:id/dictionary/list` | Save reviewed list `{sentences:[{id, chunks:[{id?, chunk}]}]}` |
| POST | `/items/:id/dictionary/generate` | `{candidateIds?: [], sentenceIds?: []}` (all draft by default) |
| PUT | `/dictionary/entries/:candidateId` | Save edited entry (human version, re-validate) |
| POST | `/dictionary/entries/:candidateId/regenerate` | Re-queue one entry |
| DELETE | `/dictionary/candidates/:candidateId` | Remove a word |
| PATCH | `/items/:id` | add `folderId` move (already supported) — used by P2 |

## 5. Screens → behaviour
### A0 Home `/content-studio` (`StudioLanding.html`)
Header actions: search (filters across all folders), **Thêm thư mục** (P1, root), **Tạo học liệu mới** (A1, no folder).
Attention banner only when count > 0, link filters A2 to items needing work. Folder cards = root folders,
status pill priority: Lỗi > Chờ duyệt từ > Cần xem lại > Hoàn tất x/y > Bản nháp. Unit chips (max 3 + "…").
"Chưa phân loại" card → "Phân loại ngay" opens A2 unfiled. Dashed card → P1. "Làm việc gần đây": 5 items, button
label by next action: Duyệt danh sách từ / Xem lại / Mở.

### A2 Folder `/content-studio/folders/:id` (`StudioLibrary.html`)
Breadcrumb path, tree on the right, list with search + status filter chips (Tất cả / Cần xử lý / Đang tạo /
Hoàn tất) and 4 status columns (Từ vựng · Từ điển · Dịch · Câu hỏi). Row action = next action. "Tạo học liệu
mới" pre-selects this folder. Row menu: Chuyển thư mục (P2), Xoá.

### A1 New item `/content-studio/new` (`StudioCreateEmpty.html` → `StudioReview.html`)
Step 1: title (auto from detection when untouched), DOCX upload, big textarea, char/word counter, guide cards,
"Nội dung cần tạo" (4 tasks; vocab level/mode), primary **Phân tách nội dung** (disabled while empty).
Step 2: detection review — editable title, folder picker (P2), collapsed source with "Sửa văn bản" (back to step 1),
passage card, question cards with full options and correct answer; missing answer → amber card, click an option
to set it. Right: tasks + checks list. Bottom: Quay lại sửa văn bản · Chỉ lưu · **Xác nhận & tạo nội dung**
(→ item page).

### B Item page `/content-studio/items/:id`
Header: path, title, derived status pill, meta, **Tạo lại tất cả**, **Lưu thay đổi (N)** (disabled "Đã lưu").
Left: fixed "Nội dung gốc" with highlights driven by the active tab; "Sửa" toggles document-style source editing.
Right: tabs with status dots **Từ vựng · Từ điển · Dịch · Câu hỏi**.
- **B1 Từ vựng** (`StudioItemVocab.html`): status, "x/y từ có trong bài", Level + Chọn từ selects, Tạo lại;
  table rows (# · từ + IPA + "trong bài" · loại từ · nghĩa · sửa/xoá); click row → inline edit; selected word
  emphasised on the left; + Thêm từ / select text on the left.
- **B2-1 Từ điển — duyệt danh sách** (no drawing): per sentence a chip list of chunks (× remove, click to edit,
  select text on the left to add to that sentence); counts; **Lưu danh sách**, **Tạo từ điển (N từ · M câu)**.
- **B2-3 Từ điển — mục từ** (`StudioItemDict.html`): left list (search, filters Tất cả / Cần xem / Từ đơn /
  Cụm từ, status per entry, sorted by position) + right detail = the 13 fields as labelled rows (editable),
  Sửa / Tạo lại / Xoá, previous/next. "Sửa danh sách từ" returns to B2-1.
- **B3 Dịch** (`StudioItemTrans.html`): left sentences S1…Sn; right one card per sentence with editable
  Vietnamese only, filter Tất cả / Cần xem lại / Đạt, issue line from validator, active sentence synced both sides.
- **B4 Câu hỏi** (`StudioItemQuestion.html`): question chips (Câu n · answer, red dot when needs review),
  stem, options read-only with correct answer, then 4 one-paragraph fields: **Dịch câu hỏi & đáp án**, **Hint**,
  **Explanation**, **Note**, each with validator issues; Tạo lại câu này; prev/next. Quote from Explanation is
  underlined in the left source.

### P1 / P2 popups (`ModalCreateFolder.html`, `ModalPickFolder.html`)
P1: name (focus, ≤160), "Cấp gốc" vs "Trong thư mục khác" + tree, preview path, Huỷ / Tạo thư mục.
P2: title + current folder, search, recent chips, expandable tree with counts, selected ✓, inline
"+ Thư mục mới trong …", footer path, Huỷ / **Chuyển vào đây** (or **Chọn** when opened from A1).

## 6. Validators (existing, keep)
Translation: sentence count, empty, numbers preserved. Question pack: all 4 fields present, explanation names the
correct letter and every wrong option, quoted text exists in passage, hint does not leak the answer, note has no
banned words (bẫy, đánh lừa, lừa). Vocab: inText in passage, lemma + meaning present, ≤30. Dictionary entry:
required fields, inText in its sentence.
