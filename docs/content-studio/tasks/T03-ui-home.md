# T03 · UI: A0 Home
**Goal**: `/content-studio` shows the Home screen exactly as `designs/StudioLanding.html`.

Depends on T01. Read `../SPEC.md` §5 A0.

## Do
- New page `frontend/src/features/content-studio/pages/StudioHomePage.jsx` (+ scoped CSS). Replace the current
  `/content-studio` route element; keep the old page component only if still used elsewhere, otherwise delete it.
- Sections in order: title row (search, Thêm thư mục, Tạo học liệu mới) · attention banner (hidden when 0) ·
  "Thư mục" grid (folder cards, Chưa phân loại card, dashed create card) with Sắp xếp select (Gần đây nhất /
  Tên) · "Làm việc gần đây" list.
- Search: debounced, shows matching items (reuse the recent-row component) instead of the grid while typing.
- Navigation: folder card → A2; Tạo học liệu mới → `/content-studio/new`; recent row button by `nextAction`
  (`review_dictionary` → item `?tab=dictionary`).
- "Thêm thư mục" and dashed card open P1 (T04). Until T04 lands, wire them to a placeholder callback.
- Loading skeletons, empty state (no folders yet → only the create card + guidance), API error state.

## Done when
Visually matches the design at 1440 px and wraps cleanly at 1024 px; real data from T01 endpoints; build passes.
