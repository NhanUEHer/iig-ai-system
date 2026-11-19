# S03 · P1 · API thư mục và bài giảng

## Mục tiêu
Admin quản lý cây thư mục và bài giảng qua API đầy đủ cho màn SL1, SL2 (phần không thuộc link).

## Đọc trước
`../SPEC.md` §2 (`sl_folders`, `sl_lectures`), §3 (folders, overview, lectures, versions), §6, §7.
Tham khảo cách làm cây của Content Studio: `src/modules/content-studio` (chỉ tham khảo, **không** import).

## Làm
1. `repositories/folderRepository.js`, `services/folderService.js`:
   - CRUD thư mục; chặn vòng lặp (`FOLDER_CYCLE`), độ sâu > 5 (`FOLDER_TOO_DEEP`), trùng tên cùng cấp (`NAME_TAKEN`).
   - `GET /folders` trả danh sách phẳng kèm `lectureCount` trực tiếp, cùng `unfiledCount`. FE tự dựng cây.
2. `services/lectureService.js`:
   - Tạo bài kèm v1 (gọi `versionService`), sửa, chuyển nhiều bài, lưu trữ.
   - Lưu trữ đặt `archived_at`; S04 dùng cờ này để coi mọi link là hết hiệu lực.
   - Danh sách có lọc và sắp xếp theo SPEC §3; `includeSubfolders` dùng CTE đệ quy.
   - Mỗi dòng trả `currentVersion {versionNo,size,originalFilename,meta}`, `activeShareCount`, `shareStatusSummary`,
     `updatedAt`, `updatedBy {id,name}`.
3. `GET /overview` và số liệu trong `GET /lectures/:id` theo SPEC §6. Các số liên quan link/phiên tạm trả 0 nếu S04, S05
   chưa xong (để hàm riêng, S09 hoàn thiện).
4. Route admin đầy đủ cho phần trên, dùng `requirePermission`. Kiểm tra đầu vào (độ dài, uuid).

## Test
`tests/secure-lectures-folders.test.js`:
- tạo cây 3 cấp; chuyển thư mục vào con cháu bị chặn;
- xoá thư mục cha thì bài trong cây con về Chưa phân loại;
- trùng tên cùng cấp bị chặn, khác cấp thì cho;
- lọc `folderId=unfiled`, `q`, `includeSubfolders`;
- người chỉ có `view` gọi POST nhận 403.

## Xong khi
Toàn bộ API folders, lectures, versions chạy được bằng curl/Postman trên local; test đạt.
