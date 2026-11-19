# Content Studio — implementation guide

Content Studio is a new, self-contained module of IIG Admin for building TOEIC **LR** learning content
(passages + questions) and generating: key vocabulary, a contextual dictionary, a sentence-by-sentence
translation and a question pack (translation, hint, explanation, note).

It does **not** reuse the legacy "Tạo học liệu" code (`src/modules/key-vocab`, `src/modules/dictionary`,
`frontend/src/features/key-vocab`, `frontend/src/features/dictionary`). Ideas may be copied, imports may not.

## Documents
| File | Content |
|---|---|
| `SPEC.md` | Process, data model, API, statuses, validation rules (source of truth for behaviour) |
| `designs/*.html` | Approved screen designs (source of truth for layout). Open in a browser or read the markup; every visual decision is in inline styles |
| `tasks/T*.md` | Implementation tasks, one PR-sized unit each, in order |

## Screen map
| Design file | Screen | Route |
|---|---|---|
| `StudioLanding.html` | A0 Home (entry from the menu) | `/content-studio` |
| `StudioLibrary.html` | A2 Items in a folder | `/content-studio/folders/:folderId` (and `unfiled`) |
| `StudioCreateEmpty.html` | A1-0 New item, before input | `/content-studio/new?folderId=` |
| `StudioReview.html` | A1-2 New item, detection review | same route, step 2 |
| `StudioItemVocab.html` | B1 Item · Từ vựng tab | `/content-studio/items/:id?tab=vocab` |
| `StudioItemDict.html` | B2-3 Item · Từ điển tab (entries) | `?tab=dictionary` |
| `StudioItemTrans.html` | B3 Item · Dịch tab | `?tab=translation` |
| `StudioItemQuestion.html` | B4 Item · Câu hỏi tab | `?tab=questions` |
| `ModalCreateFolder.html` | P1 Create folder popup | modal |
| `ModalPickFolder.html` | P2 Choose folder popup | modal |

B2-1 (dictionary word-list review) has no drawing yet: build it from `SPEC.md` §B2b using the same visual
language as `StudioItemDict.html` (chips per sentence, left source highlights).

## Non-negotiable rules
1. **Follow the designs**: same layout, order, labels (Vietnamese copy as drawn), states and colours.
   Placeholder data in the designs (names, counts) is sample data — bind real data.
2. **Use `frontend/src/design-system-v2`** components and tokens (`--iig3-*`). Feature CSS stays scoped under
   a `cs-` class prefix. Never edit shared design-system files. The legacy global `main input/select/textarea`
   rules use `!important`; override them only inside `cs-` scopes (see existing `ContentStudioItemPage.css`).
3. The page lives inside the existing Admin shell (sidebar + header). Do not draw another shell.
4. Things removed from the reference screenshots must stay out: CEFR levels, audio buttons, "AI Lx Verified",
   difficulty/question type, "Xem log AI", export, "Đưa vào Ngân hàng học liệu", per-item "Duyệt" buttons,
   the word "bẫy" anywhere.
5. One global **Lưu thay đổi (N)** button per item page; no per-section save buttons.
6. Backend stays in `src/modules/content-studio`, routes in `src/routes/contentStudioRoutes.js`,
   migrations `src/database/migrations/15x_content_studio_*.sql` (next free number).
7. Every task: `npm test` (root) passes, `cd frontend && npx vite build` passes, add unit tests for new
   backend logic. Do not touch unrelated modules. Commit on the current branch with a clear message.

## Local run
- DB: Docker Postgres `cs-pg` on port 55432 (`DATABASE_URL=postgres://postgres:cstest@localhost:55432/iig_admin`).
- `node scripts/run-migrations.js`, API `PORT=5005 node src/server.js`, web `npm --prefix frontend run dev`.
- Generation provider defaults to `mock` (`CONTENT_STUDIO_PROVIDER`), returns curated data for the sample
  letter in `tests/fixtures/content-studio-letter.txt`.
