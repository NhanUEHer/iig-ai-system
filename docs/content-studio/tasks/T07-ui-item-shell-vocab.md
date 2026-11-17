# T07 · UI: item page shell + B1 Từ vựng
**Goal**: rework `ContentStudioItemPage` to the shell in all B designs and the vocab tab as `designs/StudioItemVocab.html`.

## Do
- Header (path, title, status pill, meta, Tạo lại tất cả, Lưu thay đổi (N) / Đã lưu), left source card
  (highlights per tab, "Tô từ vựng / Văn bản sạch" toggle, Sửa → document-style editor already in
  `item/PassagePanels.jsx` `SourceEditor`), right card with 4 tabs + status dots, tab in the URL (`?tab=`).
- Keep the global drafts + single save logic that exists today.
- B1: toolbar (status, x/y in passage, Level, Chọn từ, Tạo lại with those settings), column header, rows with
  edit (inline) and delete, selected row ↔ left highlight, + Thêm từ, add by selecting text on the left.
- Remove UI that is not in the designs.

## Done when
Matches the design, edits/regenerate/save work, build passes.
