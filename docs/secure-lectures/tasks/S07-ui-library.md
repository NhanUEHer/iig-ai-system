# S07 · P3 · UI: Thư viện (SL1) + Upload (SL3)

## Mục tiêu
Admin duyệt cây thư mục, tìm và lọc bài, upload, di chuyển bài, quản lý thư mục, đúng thiết kế.

## Đọc trước
`../SPEC.md` §3, §6, §8; `../designs/SL1-Library.html`, `../designs/SL3-ModalUpload.html`.
Mẫu code: `frontend/src/features/ai-core/pages/AgentsPage.*` (header, thẻ số liệu, bảng),
`frontend/src/features/content-studio/` (cây thư mục, dialog thư mục). Class prefix `sl-`, CSS riêng từng trang.

## Làm
1. Chuyển `frontend/src/features/content-studio/folderTree.js` sang `frontend/src/utils/folderTree.js`
   (giữ re-export ở chỗ cũ để Content Studio không đổi). Viết thêm test thuần nếu chưa có.
2. `services/secureLecturesApi.js`: gọi toàn bộ API admin.
3. Route `/secure-lectures`, `/secure-lectures/folders/:folderId` (`all`, `unfiled`, uuid). Menu "Bài giảng bảo mật"
   trong `ApplicationSidebar.jsx` (nhóm Tạo & phát triển, quyền `secure_lectures.view`).
4. `LibraryPage.jsx` theo SL1:
   - Breadcrumb theo thư mục, h1, nút Nhật ký / Thư mục mới / Upload.
   - 4 thẻ số liệu.
   - Cây bên trái: mở/đóng, số bài, menu ⋯ (đổi tên, tạo con, di chuyển, xoá có xác nhận), mục Chưa phân loại.
   - Thanh tìm kiếm (debounce 300 ms) + 2 select lọc/sắp xếp.
   - Bảng: icon, tên + tên file/size, phiên bản, link, trạng thái (badge), cập nhật, nút Tạo link + ⋯
     (mở, di chuyển, lưu trữ).
   - Kéo thả bài vào nút thư mục; kéo thả file `.html` vào bảng để mở modal upload với thư mục hiện tại.
5. `UploadDialog.jsx` theo SL3: vùng thả, kiểm tra phía client (đuôi, cỡ), hiển thị kết quả kiểm tra server (meta),
   tên tự lấy từ `<title>` hoặc tên file, chọn thư mục (dùng lại kiểu `PickFolderDialog`), ghi chú, tiến trình upload.
6. Dialog tạo/đổi tên/di chuyển thư mục.
7. Quyền: chỉ `view` thì ẩn nút ghi.
8. Trạng thái tải/rỗng/lỗi.

## Test
`npx vite build` đạt; `npm run lint --prefix frontend` không lỗi mới; test thuần cho `folderTree`.

## Xong khi
Trên local: tạo cây, upload 3 bài, di chuyển, tìm kiếm, xoá thư mục. Khớp SL1/SL3 ở 1440px, không vỡ ở 1024px.
