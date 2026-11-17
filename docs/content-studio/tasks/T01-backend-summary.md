# T01 · Backend: summaries for Home and folder view
**Goal**: endpoints that A0 and A2 need, with derived statuses.

Read: `../README.md`, `../SPEC.md` §2, §4, §5 (A0, A2); designs `StudioLanding.html`, `StudioLibrary.html`.

## Do
1. In `src/modules/content-studio/contentStudioService.js` (or a new `summaryService.js` in the module):
   - `folderSummary()` → root folders `[{id, name, itemCount (subtree), children:[{id,name,itemCount}], pendingReview, needsReview, failed, readyCount, updatedAt}]` + `unfiledCount`.
   - `recentItems({limit})` → `[{id, title, folderPath:[{id,name}], part, questionRange, kind, updatedAt, taskStatus:{vocab,dictionary,translation,questions}, nextAction:'review_dictionary'|'review'|'open', nextLabel}]`.
   - `attention()` → `{dictionaryPending, needsReview, total}`.
   - Extend `listItems` rows with `taskStatus` (4 keys) and `nextAction` the same way.
   Task status rules: not requested → `null`; derive from `cs_artifacts` (`question_pack` aggregated over questions,
   worst wins: failed > generating > needs_review > ready). Until T02 lands, dictionary uses the old `dictionary`
   artifact; write the derivation so T02 can switch it to `cs_dict_*` in one place.
2. Routes in `src/routes/contentStudioRoutes.js`: `GET /folders/summary`, `GET /items/recent`, `GET /attention`
   (permission: view). Add matching functions to `frontend/src/services/contentStudioService.js`.
3. Tests in `tests/content-studio-summary.test.js` for the pure derivation helpers (status priority, next action).

## Done when
- Endpoints return the shapes above against the local DB; `npm test` and `npx vite build` pass.
- No UI changes in this task.
