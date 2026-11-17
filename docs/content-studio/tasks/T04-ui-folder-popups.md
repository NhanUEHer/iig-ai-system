# T04 · UI: folder popups P1 and P2
**Goal**: reusable `CreateFolderDialog` and `PickFolderDialog` matching `designs/ModalCreateFolder.html` and
`designs/ModalPickFolder.html`.

## Do
- Components in `frontend/src/features/content-studio/components/` built on design-system-v2 `Modal`.
- P1 props: `defaultParentId`, `onCreated(folder)`. Location toggle Cấp gốc / Trong thư mục khác, tree picker,
  preview path, validation (required, ≤160), API errors inline.
- P2 props: `title`, `currentFolderId`, `confirmLabel` ("Chuyển vào đây" | "Chọn"), `onConfirm(folderId|null)`.
  Search filters tree (keeps ancestors), recent chips (last 3 folders used, localStorage with try/catch),
  expand/collapse, counts, "Chưa phân loại", inline "+ Thư mục mới trong …" opening P1 with that parent and
  selecting the new folder.
- Wire: A0 buttons (T03), A2 row "Chuyển thư mục", A1 folder picker (T06), item page path (T07).
- Shared tree helpers in `folderTree.js`.

## Done when
Both dialogs work with keyboard (Esc, Enter, focus trap from design-system `Modal`), match the designs, build passes.
