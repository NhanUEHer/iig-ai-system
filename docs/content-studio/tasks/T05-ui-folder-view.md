# T05 · UI: A2 Folder view
**Goal**: `/content-studio/folders/:folderId` (`unfiled` supported) as `designs/StudioLibrary.html`.

Depends on T01, T04. Read `../SPEC.md` §5 A2.

## Do
- Page with breadcrumb, right-side folder tree (existing `FolderPanel` may be adapted to the design), search,
  status filter chips with counts, column header, item rows with 4 task-status columns and the next-action button,
  row menu (Chuyển thư mục → P2, Xoá → ConfirmDialog).
- "Tạo học liệu mới" → `/content-studio/new?folderId=…`.
- Poll every 3 s while any row is generating.

## Done when
Matches the design, filters/search work, move and delete work, build passes.
