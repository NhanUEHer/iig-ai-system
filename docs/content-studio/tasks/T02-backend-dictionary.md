# T02 · Backend: two-step dictionary
**Goal**: replace the single `dictionary` artifact with the extract → review → generate model.

Read: `../SPEC.md` §1, §3 (Dictionary + legacy rules), §4; legacy reference (read only, do not import):
`src/modules/dictionary/dictionaryService.js`, `src/clients/dictionaryDifyClient.js`.

## Do
1. Migration `15x_content_studio_dictionary.sql`: `cs_dict_sentences`, `cs_dict_candidates`, `cs_dict_entries`,
   `cs_dict_attempts` (indexes for queue claims). Leave old `dictionary` artifacts readable but unused.
2. `src/modules/content-studio/dictionary/` with:
   - `dictionaryService.js`: `extract(itemId)` (queues), `getState(itemId)`, `saveList(itemId, sentences)`,
     `generate(itemId, {candidateIds, sentenceIds})`, `saveEntry`, `regenerateEntry`, `removeCandidate`.
   - `normalize.js`: pure functions (extract normalisation, batch mapping, word-family split, sentence match) +
     unit tests ported from the legacy behaviour.
   - Worker: extract job + per-sentence batch claims with `FOR UPDATE SKIP LOCKED`, retries/back-off/timeout,
     stale recovery, attempts log. Hook start/stop next to the existing Content Studio worker in
     `src/apps/admin/server.js`.
3. Provider: extend `generation/mockProvider.js` with `dictionary_extract` (sentences + chunks; curated for the
   sample letter, simple heuristic otherwise) and `dictionary_entries` (uses `mockFixtures.DICTIONARY`).
   Add a `difyProvider.js` stub with the real request/response mapping (env `CONTENT_STUDIO_DIFY_*`), not enabled
   by default.
4. Generation entry point: when tasks include dictionary, `enqueue` triggers `extract` (B2a) only.
5. Routes from SPEC §4 + frontend service functions. Item `taskStatus.dictionary` (T01) now comes from these
   tables: draft list → `waiting_review`.
6. Tests: `tests/content-studio-dictionary.test.js` (normalisation, batch size mismatch, sentence mismatch,
   word family split, status roll-up).

## Done when
Sample letter: generate → list in `draft` → save list → generate → 14 entries `ready`; editing a chunk after
generation marks it `draft`; tests and build pass.
