# S11 · P5 · Công cụ trình chiếu — đợt 1

## Mục tiêu
Giáo viên vẽ, đánh dấu, chỉ laser, mở bảng trắng và ghi chú theo từng slide ngay trên trang trình chiếu `/v/:token`,
**không sửa file HTML bài giảng**. Mọi dữ liệu chỉ lưu trên máy (localStorage).

## Quyết định đã chốt
- Lưu **local** cả nét vẽ lẫn ghi chú (localStorage), không có API/bảng mới, admin không xem.
- Không có công cụ chụp màn. Không có cờ bật/tắt theo link: mọi link đều có bộ công cụ.
- Đợt 1 gồm 9 công cụ: Chuột, Bút, Bút dạ quang, Tẩy, Xoá slide, Hoàn tác/Làm lại, Laser, Bảng trắng, Ghi chú.
  (Đợt 2 để sau: hình/chữ, đèn rọi, kính lúp, che màn, đồng hồ.)

## Đọc trước
`../SPEC.md` §4.5–4.6, `frontend/src/features/secure-lectures/viewer/*`, `src/modules/secure-lectures/assets/guard.js`,
`src/modules/secure-lectures/services/contentService.js`. Iframe nội dung có CSP `sandbox allow-scripts allow-presentation`
(origin opaque); trang cha nhận message bằng cách so `event.source === iframe.contentWindow`, gửi xuống bằng `'*'`.

## Làm

### 1. Báo số slide từ iframe (backend asset, không sửa file HTML)
Trong `guard.js` (được chèn lúc phát), thêm bộ báo slide:
- Bọc `history.pushState`/`history.replaceState` và nghe `hashchange`; đọc `location.hash` dạng `#slide<N>` hoặc `#<N>`
  → `window.parent.postMessage({ type: 'sl:slide', key: 'slide-N' }, '*')`. Báo 1 lần lúc tải.
- Nếu hash không theo mẫu: key = toàn bộ hash nếu có, ngược lại `'default'` (dùng chung 1 lớp vẽ).
- Chuyển phím tắt công cụ lên trang cha: khi iframe đang focus và người dùng bấm `P`, `H`, `E`, `L`, `W`, `N`,
  `Escape`, `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y` thì `postMessage({ type: 'sl:key', key, ctrl, shift })`.
  KHÔNG chặn các phím này trong iframe trừ khi trang cha đang ở chế độ vẽ (trang cha gửi `{type:'sl:tool', drawing:bool}`
  xuống để guard biết; ở chế độ chuột thì phím đi tiếp cho bài giảng, ví dụ mũi tên chuyển slide luôn đi tiếp).
- Có test đơn vị cho hàm parse hash → key (tách thành hàm thuần export trong một module JS dùng chung hoặc test bằng
  cách eval chuỗi asset trong `vm`).

### 2. Lớp vẽ + thanh công cụ (frontend, `frontend/src/features/secure-lectures/viewer/presenter/`)
- `AnnotationLayer.jsx`: `<canvas>` phủ đúng khung iframe, theo `devicePixelRatio`, vẽ lại khi resize. Toạ độ nét
  lưu **chuẩn hoá 0–1** theo kích thước khung để đổi cỡ màn / toàn màn hình không lệch.
  - Chế độ Chuột: `pointer-events: none`. Chế độ vẽ: nhận pointer events (chuột, bút cảm ứng, chạm), `touch-action: none`.
- Mô hình dữ liệu nét: `{ id, tool: 'pen'|'highlighter', color, width, points: [[x,y,pressure?], ...] }`.
  Vẽ mượt bằng quadratic curve qua trung điểm. Highlighter: alpha ~0.35, nét to, `globalCompositeOperation` thường.
- **Tẩy**: tẩy theo nét (chạm vào nét nào thì xoá cả nét đó), có vòng tròn con trỏ.
- **Xoá slide**: xoá mọi nét của slide hiện tại (có thể hoàn tác).
- **Hoàn tác / Làm lại**: stack thao tác theo từng slide (add/remove/clear), Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y.
- **Laser**: chấm đỏ theo con trỏ + vệt mờ dần ~1.2s, không lưu, không vào undo.
- **Bảng trắng**: nút bật trang trắng phủ lên iframe (ẩn bài giảng), có lớp vẽ riêng key `whiteboard`, nút "Quay lại
  bài giảng". Đợt 1 chỉ 1 trang trắng; có công tắc nền trắng/đen.
- `PresenterToolbar.jsx`: thanh nổi ở **cạnh dưới giữa** khung trình chiếu, kéo đổi được sang cạnh trái/phải không bắt
  buộc. Nút: Chuột · Bút · Bút dạ · Tẩy · Laser | màu (6: đen, đỏ, xanh dương, xanh lá, cam, trắng) · độ dày (3) |
  Hoàn tác · Làm lại · Xoá slide | Bảng trắng · Ghi chú · Ẩn thanh. Tooltip kèm phím tắt. Nút đang chọn có trạng thái
  rõ. Trong toàn màn hình thanh vẫn hiện (đặt trong phần tử được fullscreen) và có thể thu gọn thành 1 nút.
  Dùng icon `lucide-react`, màu theo design-system (`--iig3-*` / nhấn `#d55f3d`), nền tối hợp màn trình chiếu.
- Phím tắt (trang cha + chuyển từ iframe): `V`/`Esc` Chuột, `P` Bút, `H` Bút dạ, `E` Tẩy, `L` Laser, `W` Bảng trắng,
  `N` Ghi chú, `Ctrl/Cmd+Z` hoàn tác, `Ctrl/Cmd+Shift+Z` hoặc `Ctrl/Cmd+Y` làm lại. Không bắt phím khi đang gõ trong
  ô ghi chú. Mũi tên/PageUp/PageDown/Space luôn để bài giảng xử lý.

### 3. Ghi chú theo slide
- `NotesPanel.jsx`: khung trượt ở cạnh phải (rộng ~320px, thu được), tiêu đề "Ghi chú · Slide N", textarea tự lưu
  (debounce 400ms) theo key slide hiện tại; danh sách nhỏ các slide đã có ghi chú để nhảy xem (chỉ xem ghi chú, không
  điều khiển bài giảng). Có nút xoá ghi chú slide.
- Ghi chú KHÔNG hiện trên watermark/không gửi server.

### 4. Lưu local
- `annotationStore.js` (thuần, có test): key localStorage `sl:annot:v1:<shareKey>` với `shareKey = sha256(token)`
  cắt 16 ký tự (dùng `crypto.subtle`, KHÔNG lưu token thô). Giá trị `{ slides: { [key]: Stroke[] }, notes: { [key]: string },
  updatedAt }`. Ghi debounce 500ms; bọc try/catch (private mode / quota) và báo nhẹ "Không lưu được trên máy này".
  Giới hạn ~4MB: khi vượt thì làm tròn toạ độ (3 chữ số) rồi mới báo lỗi.
- Undo stack không cần lưu.

### 5. Tích hợp `ViewerPage.jsx`
- Chỉ hiện công cụ ở trạng thái `presenting`. Lắng nghe `sl:slide`/`sl:key` từ đúng iframe. Gửi `sl:tool` xuống iframe
  khi đổi công cụ. Giữ nguyên heartbeat, takeover, guard, watermark hiện có. Khi bị đá/hết hạn: gỡ lớp vẽ cùng iframe
  (dữ liệu local vẫn giữ).

## Không làm
Không sửa backend ngoài `guard.js`, không thêm bảng/API, không đụng màn admin, không làm công cụ đợt 2.

## Test
- `tests/secure-lectures-presenter.test.js` (node --test, không DOM): parse hash → key; annotationStore (serialize,
  giới hạn, key không chứa token thô — inject hàm hash); undo/redo reducer theo slide; chuẩn hoá toạ độ ↔ pixel;
  hit-test tẩy theo nét.
- Build + lint frontend đạt.

## Xong khi
Trên local: mở link, vẽ bút/dạ trên slide 2, sang slide 3 nét biến mất, quay lại slide 2 nét còn; tải lại trang nét và
ghi chú vẫn còn; laser chạy; tẩy, xoá slide, hoàn tác/làm lại đúng; bảng trắng mở/đóng; ở chế độ Chuột vẫn bấm được
quiz/audio trong bài; toàn màn hình vẫn có thanh công cụ.
