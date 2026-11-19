# T08 · UI: B2 Từ điển (review list + entries)
Depends on T02, T07. Design: `designs/StudioItemDict.html` (entries). Review list per `../SPEC.md` §5 B2-1.

## Do
- States: not started (button Bóc từ) · extracting · **B2-1 review list** · generating (progress per sentence) ·
  **B2-3 entries**.
- B2-1: sentence groups with chip lists, × remove, click to edit, add by selecting text on the left (assign to the
  sentence containing the selection), counts, Lưu danh sách, Tạo từ điển (N từ · M câu).
- B2-3: list (search, filter chips, status per entry, position order) + detail with the 13 fields as labelled
  editable rows, Sửa / Tạo lại / Xoá, prev/next, "Sửa danh sách từ". Edits join the global drafts/save.
- Left source highlights all chunks; selected entry emphasised; needs-review chunk dashed amber.

## Done when
Full sample-letter flow works end to end with the mock provider; build passes.
