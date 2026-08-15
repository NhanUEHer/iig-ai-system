# ĐẶC TẢ TÍNH NĂNG IMPORT SAO KÊ NGÂN HÀNG VÀ SINH GIAO DỊCH

## 1. Thông tin tài liệu

| Thuộc tính | Giá trị |
| --- | --- |
| Sản phẩm | IIG AI System / IIG Admin |
| Tên tính năng | Import sao kê ngân hàng và sinh giao dịch |
| Module đề xuất | Quản lý chi phí (`Expenses`) |
| Route frontend | `/expenses/imports` |
| API prefix | `/api/expenses` |
| Môi trường triển khai đầu tiên | Development |
| Trạng thái | Đặc tả triển khai |
| Phiên bản | 1.0 |

## 2. Mục tiêu

Xây dựng một tính năng trong hệ thống IIG Admin cho phép người dùng:

1. Chọn ngân hàng và tài khoản/thẻ đã khai báo.
2. Upload file sao kê đúng định dạng.
3. Hệ thống đọc file bằng parser cố định của ngân hàng đã chọn.
4. Bóc tách thông tin sao kê và các dòng giao dịch.
5. Chuẩn hóa giao dịch về một cấu trúc dữ liệu chung.
6. Hiển thị kết quả để người dùng kiểm tra, sửa và xác nhận.
7. Lưu các giao dịch đã xác nhận vào PostgreSQL để phục vụ phân loại chi phí, đối soát và báo cáo.

Mục tiêu ưu tiên là độ chính xác, khả năng kiểm tra và truy vết. Hệ thống không được âm thầm lưu giao dịch nếu cấu trúc file không đúng hoặc tổng tiền không khớp.

## 3. Phạm vi

### 3.1. Trong phạm vi MVP

- Tích hợp trực tiếp vào IIG Admin hiện tại.
- Hỗ trợ ba ngân hàng với mẫu cố định:
  - Techcombank - PDF.
  - TPBank - PDF.
  - VPBank - PDF.
- Chỉ hỗ trợ PDF có lớp chữ; chưa hỗ trợ PDF scan hoặc ảnh chụp.
- Người dùng bắt buộc chọn ngân hàng trước khi chọn file.
- Người dùng bắt buộc chọn tài khoản/thẻ thuộc ngân hàng đó.
- Mỗi lần import một file.
- Validate file đúng ngân hàng và đúng mẫu được hỗ trợ.
- Bóc tách thông tin chung của sao kê.
- Bóc tách toàn bộ giao dịch.
- Preview, chỉnh sửa và xác nhận trước khi lưu.
- Chống upload trùng file và cảnh báo giao dịch trùng.
- Đối chiếu tổng ghi nợ, ghi có và số dư nếu sao kê cung cấp đủ dữ liệu.
- Lưu file gốc trên R2/S3 và metadata trong PostgreSQL.
- Phân quyền và audit log.

### 3.2. Ngoài phạm vi MVP

- VIB/XLSX, đặc biệt file có mật khẩu.
- OCR cho PDF scan.
- Tự động nhận diện ngân hàng.
- Parser tổng quát cho ngân hàng chưa hỗ trợ.
- AI/LLM để bóc tách sao kê.
- Đối soát với ERP hoặc phần mềm kế toán.
- Tự động hạch toán kế toán.
- Tự động duyệt giao dịch mà không có bước kiểm tra của người dùng.

## 4. Các quyết định nghiệp vụ

### 4.1. Bắt buộc chọn ngân hàng trước

Danh sách ngân hàng được fix cứng:

| Mã | Ngân hàng | File hỗ trợ | Parser |
| --- | --- | --- | --- |
| `TECHCOMBANK` | Techcombank | `.pdf` | `TechcombankPdfParser` |
| `TPBANK` | TPBank | `.pdf` | `TpBankPdfParser` |
| `VPBANK` | VPBank | `.pdf` | `VpBankPdfParser` |

Khi chưa chọn ngân hàng, trường chọn file và nút upload bị khóa. Hệ thống không tự dò ngân hàng và không fallback sang parser khác.

### 4.2. Bắt buộc chọn tài khoản/thẻ

- Danh sách tài khoản được lọc theo ngân hàng đã chọn.
- Chỉ hiển thị số tài khoản/thẻ đã che.
- Không cho upload nếu chưa chọn tài khoản.
- Parser phải kiểm tra thông tin tài khoản trong file có phù hợp với tài khoản đã chọn hay không, trong giới hạn dữ liệu mà sao kê cung cấp.
- Nếu không khớp, hệ thống dừng xử lý hoặc yêu cầu người dùng có quyền quản trị xác nhận ngoại lệ.

### 4.3. Không tự lưu sau khi parse

Kết quả parse luôn đi qua màn hình preview. Chỉ khi người dùng bấm **Xác nhận import**, các giao dịch mới được commit vào dữ liệu chính thức.

## 5. Vai trò và phân quyền

Đề xuất thêm permission group `expenses`:

| Permission | Ý nghĩa |
| --- | --- |
| `expenses.view` | Xem lịch sử import và giao dịch |
| `expenses.import` | Upload, xử lý và xác nhận sao kê |
| `expenses.classify` | Phân loại giao dịch sau khi import |
| `expenses.reconcile` | Thực hiện đối soát |
| `expenses.review` | Duyệt hoặc xử lý ngoại lệ |
| `expenses.config` | Quản lý tài khoản ngân hàng và cấu hình |
| `expenses.manage` | Quản trị toàn bộ module |

Mọi API phải kiểm tra permission ở backend. Việc ẩn menu hoặc nút trên frontend chỉ là hỗ trợ giao diện, không thay thế kiểm tra quyền tại server.

## 6. Luồng nghiệp vụ tổng thể

```text
Người dùng mở Quản lý chi phí
        |
        v
Chọn ngân hàng bắt buộc
        |
        v
Chọn tài khoản/thẻ bắt buộc
        |
        v
Chọn file PDF
        |
        v
Validate định dạng, dung lượng, checksum
        |
        v
Upload file gốc lên R2/S3
        |
        v
Chạy parser đúng ngân hàng đã chọn
        |
        v
Validate chữ ký mẫu và lớp chữ PDF
        |
        v
Bóc tách metadata + giao dịch
        |
        v
Chuẩn hóa + tính tổng + phát hiện trùng
        |
        v
Hiển thị preview và cảnh báo
        |
        v
Người dùng sửa hoặc xác nhận
        |
        v
Backend validate lại và commit trong transaction
        |
        v
Sinh giao dịch chính thức + audit log
```

## 7. Trạng thái import

| Trạng thái | Ý nghĩa |
| --- | --- |
| `uploaded` | File đã được tiếp nhận và lưu trữ |
| `processing` | Parser đang xử lý |
| `ready_for_review` | Đã parse xong, chờ người dùng kiểm tra |
| `committed` | Các giao dịch đã được xác nhận và lưu |
| `invalid_file` | File không hợp lệ hoặc sai định dạng |
| `parser_failed` | Parser không thể bóc tách an toàn |
| `reconciliation_failed` | Kết quả parse có chênh lệch cần xử lý |
| `cancelled` | Lần import bị người dùng hủy |

Không cho chuyển trực tiếp từ `uploaded` sang `committed`.

## 8. Yêu cầu giao diện

### 8.1. Trang lịch sử import

Hiển thị:

- Ngày upload.
- Người upload.
- Ngân hàng.
- Tài khoản/thẻ.
- Tên file.
- Kỳ sao kê.
- Số giao dịch.
- Tổng ghi nợ.
- Tổng ghi có.
- Số cảnh báo.
- Trạng thái.
- Thao tác xem, xử lý lại hoặc hủy tùy trạng thái.

Bộ lọc:

- Khoảng thời gian upload.
- Ngân hàng.
- Tài khoản.
- Trạng thái.
- Người upload.
- Tên file.

### 8.2. Form upload

Các trường:

1. Ngân hàng - bắt buộc.
2. Tài khoản/thẻ - bắt buộc.
3. File PDF - bắt buộc, chỉ mở sau khi chọn ngân hàng.
4. Ghi chú - không bắt buộc.

Quy tắc:

- Chỉ nhận một file.
- Chỉ nhận `.pdf`.
- Dung lượng tối đa đề xuất: 15 MB.
- Số trang tối đa đề xuất: 50 trang.
- Hiển thị lỗi tại đúng trường có vấn đề.
- Không truyền file dưới dạng base64; sử dụng `multipart/form-data`.

### 8.3. Trang preview

Phần tóm tắt:

- Ngân hàng.
- Tài khoản/thẻ.
- Chủ tài khoản nếu có.
- Ngày/kỳ sao kê.
- Số dư đầu kỳ.
- Số dư cuối kỳ.
- Tổng ghi nợ trên sao kê.
- Tổng ghi có trên sao kê.
- Tổng ghi nợ đã parse.
- Tổng ghi có đã parse.
- Số giao dịch.
- Số dòng cảnh báo.
- Chênh lệch đối soát.

Bảng giao dịch:

- Ngày giao dịch.
- Ngày hạch toán.
- Nội dung.
- Số tiền nguyên tệ.
- Loại tiền.
- Ghi nợ.
- Ghi có.
- Phí.
- Mã tham chiếu.
- Trang/dòng nguồn.
- Cảnh báo.

Người dùng được phép:

- Sửa ngày giao dịch và ngày hạch toán.
- Sửa nội dung.
- Sửa số tiền.
- Đổi chiều ghi nợ/ghi có.
- Xóa dòng parse sai.
- Thêm dòng bị thiếu.
- Đánh dấu dòng không phải giao dịch.
- Xác nhận chênh lệch kèm lý do nếu có quyền.
- Xác nhận import.
- Hủy import.

Backend phải validate lại toàn bộ dữ liệu khi commit; không tin trực tiếp dữ liệu frontend.

## 9. Cấu trúc dữ liệu chuẩn của parser

Mọi parser phải trả về cùng một contract:

```json
{
  "parser": {
    "bankCode": "TPBANK",
    "version": "1.0.0"
  },
  "statement": {
    "accountNumberMasked": "401286xxxxxx5488",
    "accountHolder": "DUONG NGOC DUC",
    "statementDate": "2026-07-11",
    "periodFrom": null,
    "periodTo": "2026-07-11",
    "currency": "VND",
    "openingBalance": "145877246.00",
    "closingBalance": "90500000.00",
    "totalDebit": "150500000.00",
    "totalCredit": "205877246.00"
  },
  "transactions": [
    {
      "transactionDate": "2026-06-08",
      "postingDate": "2026-06-11",
      "description": "MM* GOOGLE *ADWS...",
      "normalizedDescription": "MM GOOGLE ADWS",
      "originalAmount": "20000000.00",
      "originalCurrency": "VND",
      "debitAmount": "20000000.00",
      "creditAmount": "0.00",
      "feeAmount": "0.00",
      "referenceNumber": null,
      "sourcePage": 1,
      "sourceRow": 4,
      "warnings": [],
      "rawData": {}
    }
  ],
  "reconciliation": {
    "parsedTotalDebit": "150500000.00",
    "parsedTotalCredit": "205877246.00",
    "debitDifference": "0.00",
    "creditDifference": "0.00",
    "isBalanced": true
  },
  "warnings": []
}
```

Số tiền trong Node.js được truyền dưới dạng chuỗi decimal để tránh sai số floating point.

## 10. Giải pháp kỹ thuật

### 10.1. Kiến trúc

Giữ nguyên stack IIG Admin:

- Frontend: React 19 + Vite.
- Backend: Node.js + Express.
- Database: PostgreSQL.
- Storage: Cloudflare R2/S3 qua `storageService` hiện có.
- Authentication: JWT hiện có.
- Authorization: permission system hiện có.
- PDF extraction: `pdfjs-dist`.
- Export Excel trong các giai đoạn sau: package `xlsx` hiện có.
- Testing: `node:test`.

Tính năng được xây dưới dạng module độc lập trong monolith hiện tại. Chưa cần tách microservice vì lưu lượng upload dự kiến thấp, file nhỏ và parser gắn chặt với nghiệp vụ quản trị.

### 10.2. Cấu trúc backend

```text
src/modules/expenses/
  expenseRoutes.js
  expenseController.js
  expenseService.js
  expenseRepository.js
  bankAccountRepository.js
  statementImportService.js
  statementImportRepository.js
  statementValidationService.js
  transactionFingerprint.js
  parsers/
    parserRegistry.js
    pdfTextExtractor.js
    parserUtils.js
    techcombankPdfParser.js
    tpBankPdfParser.js
    vpBankPdfParser.js
```

Trách nhiệm:

- Route: định tuyến và middleware permission/upload.
- Controller: nhận request, gọi service, trả response; không chứa SQL.
- Service: điều phối nghiệp vụ và transaction.
- Repository: toàn bộ SQL có parameter binding.
- Parser: chỉ xử lý dữ liệu file và trả contract chuẩn; không truy cập DB.
- Validation service: validate file, mẫu và kết quả đối soát.

### 10.3. Parser registry

```js
const PARSERS = {
  TECHCOMBANK: techcombankPdfParser,
  TPBANK: tpBankPdfParser,
  VPBANK: vpBankPdfParser
};
```

- Parser được chọn trực tiếp theo `bankCode` người dùng đã chọn.
- Không tự nhận diện ngân hàng.
- Không fallback sang parser khác.
- Mỗi parser có version riêng.
- Version parser được lưu cùng lần import để có thể truy vết và xử lý lại.

### 10.4. Trích xuất PDF

`pdfjs-dist` được dùng để lấy text item và tọa độ:

```json
{
  "text": "24/04/2026",
  "x": 71.2,
  "y": 496.5,
  "width": 49.3,
  "height": 8.1,
  "page": 1
}
```

Quy trình:

1. Đọc từng trang.
2. Giữ tọa độ X/Y của từng text item.
3. Chuẩn hóa Unicode và khoảng trắng.
4. Gom item cùng dòng theo sai số tọa độ Y.
5. Sắp xếp item theo X.
6. Xác định vùng bảng.
7. Map item vào cột theo khoảng X riêng của từng ngân hàng.
8. Ghép nội dung nhiều dòng.
9. Loại header/footer, tổng cộng và điều khoản.
10. Chuẩn hóa giao dịch.

Không sử dụng một regex lớn trên toàn bộ text vì sẽ dễ ghép sai cột và sai giao dịch nhiều dòng.

### 10.5. Xử lý bất đồng bộ

MVP có thể xử lý trong request nếu file nhỏ, nhưng service phải có timeout và giới hạn tài nguyên. Thiết kế trạng thái import phải cho phép chuyển sang worker/job queue khi khối lượng tăng mà không phải thay đổi contract API.

Khuyến nghị:

- Timeout parse: 30 giây.
- Giới hạn 15 MB và 50 trang.
- Không xử lý nhiều file trong một request.
- Trả request ID/import ID để truy vết.

## 11. Yêu cầu parser theo ngân hàng

### 11.1. Techcombank

Chữ ký mẫu:

- Có `TECHCOMBANK`.
- Có tiêu đề sao kê thẻ tín dụng.
- Có vùng `Thông tin chi tiết`.
- Có các cột ngày giao dịch, ngày cập nhật/hạch toán, số tiền, ghi nợ, ghi có và nội dung.

Cần xử lý:

- Số tài khoản thẻ.
- Tên chủ tài khoản.
- Ngày sao kê.
- Số dư kỳ trước.
- Dư nợ cuối kỳ.
- Tổng ghi nợ và ghi có.
- Nội dung giao dịch nhiều dòng.
- Dòng phí giao dịch nước ngoài không lặp ngày.
- Kế thừa ngày từ giao dịch chính khi hợp lý.
- Không nhận dòng tổng và điều khoản thành giao dịch.

### 11.2. TPBank

Chữ ký mẫu:

- Có `TPBank`.
- Có `SAO KÊ TÀI KHOẢN THẺ TÍN DỤNG`.
- Có các cột ngày giao dịch, ngày kết toán, mô tả, số tiền giao dịch gốc, ghi nợ và ghi có.

Cần xử lý:

- Số thẻ đã che.
- Tài khoản trích tiền nếu có.
- Ngày lập bảng.
- Dư nợ kỳ trước.
- Dư nợ sao kê.
- Nhiều nhóm giao dịch theo từng thẻ trong cùng sao kê.
- Dòng `Dư nợ kỳ trước` không phải giao dịch.
- Dòng `Giá trị giao dịch thẻ kỳ này` không phải giao dịch.
- Phí phát hành lại hoặc các loại phí khác là giao dịch hợp lệ.
- Map đúng chiều ghi nợ/ghi có.

### 11.3. VPBank

Chữ ký mẫu:

- Có `VPBANK CREDIT CARD STATEMENT`.
- Có `TRANSACTION DETAILS`.
- Có các cột ngày giao dịch, ngày hạch toán, chi tiết, số tiền giao dịch, loại tiền, phí và số tiền thanh toán.

Cần xử lý:

- Kỳ sao kê.
- Số hợp đồng/tài khoản.
- Hạn mức.
- Dư nợ đầu kỳ.
- Nợ phát sinh trong kỳ.
- Thanh toán trong kỳ.
- Dư nợ cuối kỳ.
- Bảng giao dịch kéo dài qua nhiều trang.
- Header/footer lặp lại.
- Chuẩn hóa quy ước số âm của VPBank.
- Phân biệt thanh toán thẻ với khoản chi.
- Map riêng phí và số tiền thanh toán.

## 12. Chuẩn hóa dữ liệu

### 12.1. Ngày

- Lưu PostgreSQL kiểu `DATE`.
- Chuẩn API: `YYYY-MM-DD`.
- Parser hỗ trợ `DD/MM/YYYY`, `DD/MM/YY` và các biến thể đã xác định trong mẫu.
- Không tự đoán ngày nếu giá trị không hợp lệ.

### 12.2. Số tiền

- PostgreSQL dùng `NUMERIC(20,2)`.
- Không dùng kiểu floating point cho đối soát.
- Loại bỏ ký hiệu tiền tệ và dấu phân cách theo quy tắc của từng mẫu.
- Giữ riêng số tiền nguyên tệ, ghi nợ, ghi có và phí.
- Không vừa có debit và credit lớn hơn 0 trên cùng một dòng, trừ trường hợp được định nghĩa rõ.

### 12.3. Nội dung

- Giữ `description` đúng như nguồn sau khi ghép dòng.
- Sinh `normalized_description` phục vụ tìm kiếm và phân loại.
- Chuẩn hóa khoảng trắng, Unicode và chữ hoa/thường.
- Không xóa các mã tham chiếu có giá trị nghiệp vụ.

### 12.4. Chiều giao dịch

- `debit_amount > 0`: khoản chi/ghi nợ.
- `credit_amount > 0`: khoản thu, hoàn tiền hoặc thanh toán vào thẻ.
- Không suy luận chiều chỉ dựa trên dấu âm nếu mẫu có cột debit/credit rõ ràng.

## 13. Thiết kế database

### 13.1. `expense_bank_accounts`

- `id`.
- `bank_code`.
- `account_name`.
- `account_number_masked`.
- `account_number_hash`.
- `account_type`: `bank_account` hoặc `credit_card`.
- `currency`.
- `department_code`.
- `is_active`.
- `created_by`.
- `created_at`, `updated_at`.

### 13.2. `expense_statement_imports`

- `id`.
- `bank_code`.
- `bank_account_id`.
- `original_filename`.
- `storage_key`.
- `file_checksum`.
- `file_size`.
- `page_count`.
- `statement_date`.
- `period_from`, `period_to`.
- `opening_balance`, `closing_balance`.
- `statement_total_debit`, `statement_total_credit`.
- `parsed_total_debit`, `parsed_total_credit`.
- `transaction_count`.
- `status`.
- `parser_version`.
- `warnings` JSONB.
- `raw_metadata` JSONB.
- `note`.
- `created_by`, `committed_by`.
- `created_at`, `updated_at`, `committed_at`.

Ràng buộc:

- Unique checksum trong phạm vi file sao kê đã commit hoặc đang xử lý.
- `bank_account_id` phải thuộc `bank_code` tương ứng.
- Không sửa ngân hàng/tài khoản sau khi commit.

### 13.3. `expense_statement_draft_transactions`

Lưu kết quả preview trước khi commit:

- `id`.
- `import_id`.
- Các trường giao dịch chuẩn.
- `warnings` JSONB.
- `raw_data` JSONB.
- `source_page`, `source_row`.
- `revision`.
- Timestamps.

Bảng draft cho phép sửa preview, reload trình duyệt và tiếp tục xử lý mà không cần parse lại file.

### 13.4. `expense_transactions`

- `id`.
- `import_id`.
- `bank_account_id`.
- `transaction_date`, `posting_date`.
- `description`, `normalized_description`.
- `original_amount`, `original_currency`.
- `debit_amount`, `credit_amount`, `fee_amount`.
- `reference_number`.
- `fingerprint`.
- `expense_category_id` - nullable ở MVP import.
- `vendor_id` - nullable.
- `department_code`, `project_code` - nullable.
- `classification_source`.
- `reconciliation_status`.
- `review_status`.
- `is_excluded`.
- `raw_data` JSONB.
- `source_page`, `source_row`.
- `created_by`, `updated_by`.
- Timestamps.

### 13.5. `expense_audit_logs`

- `id`.
- `entity_type`.
- `entity_id`.
- `action`.
- `before_data` JSONB.
- `after_data` JSONB.
- `user_id`.
- `request_id`.
- `created_at`.

## 14. Chống trùng

### 14.1. Trùng file

Tính SHA-256 từ nội dung file. Nếu checksum đã tồn tại:

- Không upload lại nếu import cũ đang xử lý hoặc đã commit.
- Cho phép người có quyền xem lần import cũ.
- Có thể cho process lại bằng parser mới qua thao tác riêng, không tạo bản sao dữ liệu.

### 14.2. Trùng giao dịch

Fingerprint đề xuất được tạo từ:

```text
bank_account_id
+ transaction_date
+ posting_date
+ debit_amount
+ credit_amount
+ normalized_description
+ reference_number nếu có
```

Fingerprint chỉ dùng để cảnh báo, không được tự động loại giao dịch trong mọi trường hợp vì ngân hàng có thể phát sinh hai giao dịch thực sự giống nhau.

## 15. Đối soát kết quả parse

Các kiểm tra:

1. Tổng debit của giao dịch so với tổng debit trên sao kê.
2. Tổng credit so với tổng credit trên sao kê.
3. Số dư đầu kỳ, phát sinh và số dư cuối kỳ nếu công thức của ngân hàng cho phép.
4. Dòng thiếu ngày.
5. Dòng không có số tiền.
6. Dòng có cả debit và credit.
7. Dòng có số tiền bằng 0.
8. Giao dịch trùng trong file.
9. Giao dịch có khả năng trùng lịch sử.

Mức cảnh báo:

- `error`: không cho commit.
- `warning`: cho commit sau khi người dùng xác nhận.
- `info`: thông tin hỗ trợ kiểm tra.

Không phải mẫu nào cũng cung cấp đủ tổng debit/credit. Parser phải ghi rõ trường nào có thể đối soát thay vì tự gán số liệu suy đoán.

## 16. API đề xuất

### 16.1. Bootstrap và tài khoản

```text
GET /api/expenses/bootstrap
GET /api/expenses/accounts?bankCode=TPBANK
```

Bootstrap trả danh sách ngân hàng được hỗ trợ, permission hiện tại, giới hạn upload và các enum cần cho UI.

### 16.2. Upload và xử lý

```text
POST /api/expenses/imports
Content-Type: multipart/form-data
```

Fields:

- `bankCode`.
- `bankAccountId`.
- `file`.
- `note`.

Các API khác:

```text
GET  /api/expenses/imports
GET  /api/expenses/imports/:id
POST /api/expenses/imports/:id/process
PUT  /api/expenses/imports/:id/draft-transactions
POST /api/expenses/imports/:id/commit
POST /api/expenses/imports/:id/cancel
GET  /api/expenses/imports/:id/source-url
```

### 16.3. Mã lỗi

| Code | Ý nghĩa |
| --- | --- |
| `STATEMENT_BANK_REQUIRED` | Chưa chọn ngân hàng |
| `STATEMENT_ACCOUNT_REQUIRED` | Chưa chọn tài khoản |
| `STATEMENT_FILE_REQUIRED` | Chưa có file |
| `STATEMENT_FILE_TYPE_INVALID` | File không phải PDF hợp lệ |
| `STATEMENT_FILE_TOO_LARGE` | File vượt dung lượng |
| `STATEMENT_PAGE_LIMIT_EXCEEDED` | File vượt số trang |
| `STATEMENT_DUPLICATED` | File đã được import |
| `STATEMENT_BANK_MISMATCH` | File không đúng ngân hàng đã chọn |
| `STATEMENT_TEMPLATE_UNSUPPORTED` | Mẫu sao kê không được hỗ trợ |
| `STATEMENT_HAS_NO_TEXT_LAYER` | PDF scan hoặc không có lớp chữ |
| `STATEMENT_PARSE_FAILED` | Không thể parse an toàn |
| `STATEMENT_TOTAL_MISMATCH` | Tổng parse không khớp sao kê |
| `STATEMENT_ALREADY_COMMITTED` | Import đã được commit |
| `STATEMENT_REVISION_CONFLICT` | Preview đã được sửa ở phiên khác |

Response lỗi theo chuẩn IIG Admin:

```json
{
  "success": false,
  "error": "File không đúng mẫu sao kê TPBank được hỗ trợ.",
  "code": "STATEMENT_TEMPLATE_UNSUPPORTED",
  "requestId": "..."
}
```

## 17. Transaction commit

Khi người dùng xác nhận:

1. Lock bản ghi import.
2. Kiểm tra trạng thái vẫn là `ready_for_review`.
3. Kiểm tra revision để phát hiện chỉnh sửa đồng thời.
4. Đọc lại draft transactions từ DB.
5. Validate ngày, số tiền và chiều giao dịch.
6. Tính lại tổng ở backend.
7. Tính fingerprint.
8. Kiểm tra trùng lịch sử.
9. Insert giao dịch chính thức.
10. Chuyển import sang `committed`.
11. Ghi audit log.
12. Commit PostgreSQL transaction.

Nếu một bước lỗi, rollback toàn bộ; không để import ở trạng thái commit một phần.

## 18. Lưu trữ file

- Tái sử dụng `storageService` và cấu hình Cloudflare R2 hiện có.
- Tạo prefix riêng, ví dụ `expense-statements/{year}/{month}/{importId}/source.pdf`.
- Database chỉ lưu object key và metadata.
- Không expose object key thành public URL.
- API xem file trả signed URL có thời hạn ngắn.
- Không lưu file sao kê trong các thư mục static hiện tại.
- File tạm phải được xóa sau khi upload/parse.
- Có chính sách retention và xóa dữ liệu theo quy định nội bộ.

## 19. Bảo mật và dữ liệu cá nhân

- Không ghi số tài khoản/thẻ đầy đủ vào log.
- Chỉ hiển thị số tài khoản đã che.
- Không gửi sao kê sang dịch vụ AI bên ngoài trong MVP.
- Validate MIME type và chữ ký `%PDF`, không chỉ dựa vào tên file.
- Giới hạn dung lượng và số trang.
- Thiết lập timeout parser.
- Chặn path traversal qua tên file.
- Tạo tên object storage độc lập với tên file người dùng.
- Signed URL có thời hạn.
- Audit các hành động upload, xem file, sửa preview, commit và hủy.
- Kiểm tra quyền ở backend cho mọi thao tác.
- Không trả `raw_data` nhạy cảm cho người không có quyền cần thiết.

## 20. Hiệu năng và vận hành

- Một file mỗi request.
- Không giữ toàn bộ base64 trong JSON.
- Chỉ giữ buffer khi file nằm trong giới hạn an toàn; ưu tiên temporary file/stream.
- Timeout parse đề xuất 30 giây.
- Ghi duration, page count, item count và parser version vào log kỹ thuật.
- Không ghi raw text sao kê vào application log.
- Khi khối lượng tăng, chuyển bước parse sang worker/job queue nhưng giữ nguyên import state machine và API contract.
- Có thao tác process lại với parser version mới.

## 21. Frontend structure

```text
frontend/src/features/expenses/
  pages/
    StatementImportListPage.jsx
    StatementUploadPage.jsx
    StatementReviewPage.jsx
  components/
    BankSelector.jsx
    BankAccountSelector.jsx
    StatementUploadForm.jsx
    StatementSummary.jsx
    TransactionDraftTable.jsx
    ReconciliationPanel.jsx
    ImportStatusBadge.jsx
  hooks/
    useStatementImports.js
    useStatementReview.js
  services/
    expenseImportService.js
  utils/
    expenseFormatters.js
```

Yêu cầu:

- Tách logic API/state khỏi component hiển thị.
- Component không vượt quá giới hạn được quy định trong `CODING_STANDARDS.md`.
- Có loading, empty, error và conflict states.
- Có cảnh báo khi rời trang trong lúc chưa lưu thay đổi preview.
- Bảng preview hỗ trợ nhiều trang hoặc virtualized list khi giao dịch lớn.
- Đảm bảo hoạt động trên màn hình laptop phổ biến.

## 22. Logging và audit

Technical log nên gồm:

- `requestId`.
- `importId`.
- `bankCode`.
- `parserVersion`.
- Dung lượng và số trang.
- Thời gian xử lý.
- Số giao dịch.
- Số warning/error.
- Mã lỗi nếu thất bại.

Audit log nên gồm:

- Người upload.
- Người sửa preview.
- Giá trị trước/sau khi sửa.
- Người xác nhận.
- Người hủy.
- Lý do xác nhận chênh lệch.

Không log raw PDF text, số thẻ đầy đủ hoặc nội dung nhạy cảm không cần thiết.

## 23. Testing

### 23.1. Unit test dùng chung

- Parse ngày Việt Nam.
- Parse số tiền.
- Chuẩn hóa Unicode.
- Gom text item thành dòng.
- Map dòng vào cột.
- Ghép nội dung nhiều dòng.
- Loại dòng tổng/header/footer.
- Tính fingerprint.
- Tính và so sánh tổng decimal.

### 23.2. Unit test từng parser

Mỗi ngân hàng cần fixture PDF đã che dữ liệu nhạy cảm và file JSON kết quả kỳ vọng:

```text
tests/fixtures/expenses/
  techcombank-statement.pdf
  techcombank-statement.expected.json
  tpbank-statement.pdf
  tpbank-statement.expected.json
  vpbank-statement.pdf
  vpbank-statement.expected.json
```

Điều kiện parser đạt:

- Đúng ngân hàng và tài khoản.
- Đúng số giao dịch.
- Đúng ngày.
- Không mất nội dung nhiều dòng.
- Đúng debit/credit/fee từng dòng.
- Tổng tiền khớp tuyệt đối với expected fixture.
- Không nhận header, footer, số dư hoặc điều khoản thành giao dịch.

### 23.3. Integration test

- Upload đúng ngân hàng.
- Upload sai ngân hàng.
- Upload file không phải PDF.
- Upload PDF scan.
- Upload file trùng checksum.
- File vượt dung lượng/số trang.
- Parse thành công và tạo preview.
- Lưu chỉnh sửa preview.
- Conflict revision.
- Commit thành công.
- Commit hai lần.
- Rollback nếu một giao dịch không hợp lệ.
- Permission 401/403.
- Signed URL chỉ cấp cho người có quyền.

### 23.4. Regression test

Bất kỳ thay đổi parser nào cũng phải chạy lại toàn bộ fixtures của ba ngân hàng. Nếu ngân hàng thay đổi bố cục, thêm fixture mới và tăng parser version; không sửa expected data để che lỗi parser.

## 24. Monitoring và cảnh báo vận hành

Theo dõi:

- Tỷ lệ parse thành công theo ngân hàng.
- Tỷ lệ `STATEMENT_TEMPLATE_UNSUPPORTED`.
- Tỷ lệ đối soát không khớp.
- Thời gian xử lý trung bình và P95.
- Số import trùng.
- Số giao dịch phải sửa thủ công.
- Parser version đang được sử dụng.

Cần cảnh báo kỹ thuật khi một ngân hàng liên tục phát sinh lỗi mẫu, vì đây có thể là dấu hiệu ngân hàng đã thay đổi layout.

## 25. Kế hoạch triển khai

### Giai đoạn 0 - Chuẩn bị môi trường dev

- Backup database dev.
- Đồng bộ dữ liệu báo cáo production về dev bằng script riêng và transaction an toàn.
- Xác minh row count trước/sau.
- Không ghi đè dữ liệu ngoài phạm vi báo cáo.
- Tạo branch triển khai theo prefix `codex/`.

Việc đồng bộ production hiện yêu cầu credential VPS được lưu qua biến môi trường hoặc macOS Keychain; tuyệt đối không lưu mật khẩu vào repository.

### Giai đoạn 1 - Foundation

- Tạo migration database.
- Bổ sung permissions.
- Tạo backend module và routes.
- Tạo cấu hình ba ngân hàng.
- CRUD tài khoản/thẻ tối thiểu.
- Tạo feature frontend và menu.

### Giai đoạn 2 - Upload và PDF engine

- Multipart upload.
- File validation.
- Checksum chống trùng.
- R2 storage.
- PDF text extraction giữ tọa độ.
- Parser registry và error codes.

### Giai đoạn 3 - Ba parser

- Techcombank parser và test.
- TPBank parser và test.
- VPBank parser và test.
- Reconciliation engine.
- Regression fixtures.

### Giai đoạn 4 - Preview và commit

- Trang upload.
- Trang lịch sử import.
- Trang review.
- Draft transaction persistence.
- Edit/revision control.
- Transactional commit.
- Audit log.

### Giai đoạn 5 - Hoàn thiện

- Security review.
- Integration tests.
- UI responsive và accessibility.
- Monitoring metrics.
- `npm run check`.
- UAT với file thật đã được phê duyệt.

## 26. Ước lượng

| Nhóm công việc | Ước lượng |
| --- | ---: |
| Foundation, database, permissions | 3-4 ngày |
| Upload, storage, PDF extraction | 3-4 ngày |
| Ba parser và regression tests | 7-10 ngày |
| Preview, chỉnh sửa và commit | 4-5 ngày |
| Bảo mật, integration test và QA | 3-5 ngày |
| Tổng | 20-28 ngày công |

Ước lượng trên dành cho phạm vi import và sinh giao dịch, chưa bao gồm module phân loại chi phí, dashboard chi phí hoặc đối soát ERP đầy đủ.

## 27. Tiêu chí nghiệm thu

Tính năng được nghiệm thu khi:

1. Chỉ người có quyền mới truy cập và upload được sao kê.
2. Người dùng bắt buộc chọn ngân hàng và tài khoản.
3. Hệ thống chỉ nhận PDF hợp lệ trong giới hạn.
4. Chọn sai ngân hàng phải bị phát hiện.
5. Ba file mẫu Techcombank, TPBank và VPBank được parse đúng.
6. Số giao dịch, ngày, nội dung và số tiền khớp fixture kỳ vọng.
7. Không có dòng tổng/header/footer bị nhận thành giao dịch.
8. Người dùng có thể review và sửa trước khi lưu.
9. Commit có tính nguyên tử, không phát sinh dữ liệu một phần.
10. Upload trùng file bị chặn.
11. Giao dịch nghi trùng được cảnh báo.
12. Tổng parse được đối chiếu với sao kê khi có dữ liệu.
13. File gốc được lưu riêng tư và chỉ xem qua signed URL.
14. Có audit log cho các thao tác quan trọng.
15. Unit, integration và regression tests thành công.
16. Toàn bộ `npm run check` của dự án thành công.

## 28. Rủi ro và biện pháp

| Rủi ro | Biện pháp |
| --- | --- |
| Ngân hàng thay đổi layout | Chữ ký mẫu, parser version, regression fixture và lỗi rõ ràng |
| Parse sai nhưng vẫn sinh giao dịch | Preview bắt buộc, đối soát tổng và transactional commit |
| Hai giao dịch thật có nội dung giống nhau | Fingerprint chỉ cảnh báo, không tự xóa |
| PDF scan không có text | Dừng với lỗi rõ ràng; OCR để phase sau |
| Lộ thông tin ngân hàng | R2 private, signed URL, masking, permission và audit |
| Sai số tiền do floating point | PostgreSQL `NUMERIC` và decimal string trong Node.js |
| Upload file độc hại hoặc quá lớn | MIME/signature validation, giới hạn file/trang và timeout |
| Người dùng sửa cùng lúc | Revision/optimistic concurrency control |
| Parser thất bại giữa chừng | Trạng thái import rõ ràng, không commit giao dịch một phần |

## 29. Hướng mở rộng

Sau khi MVP ổn định:

- Thêm VIB Excel không mật khẩu.
- Xử lý Excel có mật khẩu bằng quy trình bảo mật riêng nếu thực sự cần.
- OCR cho PDF scan.
- Phân loại chi phí bằng keyword/rule.
- Phân loại AI khi rule không đủ độ tin cậy.
- Nhà cung cấp, phòng ban, dự án và cost center.
- Upload hóa đơn/chứng từ.
- Đối soát dữ liệu kế toán/ERP.
- Chốt kỳ và quy trình duyệt.
- Dashboard và export báo cáo chi phí.

## 30. Kết luận

Giải pháp phù hợp nhất cho giai đoạn đầu là ba parser cố định, được người dùng lựa chọn thông qua ngân hàng trước khi upload. Cách tiếp cận này giảm độ phức tạp, không phụ thuộc OCR/AI, dễ kiểm thử và phù hợp với kiến trúc IIG Admin hiện tại.

Yếu tố quyết định chất lượng không phải là tự nhận diện ngân hàng mà là:

- Validate đúng mẫu.
- Parse theo tọa độ và cấu trúc từng ngân hàng.
- Chuẩn hóa dữ liệu tiền/ngày chặt chẽ.
- Đối soát tổng.
- Preview bắt buộc.
- Regression test cho từng mẫu.
- Không commit khi hệ thống không đủ chắc chắn.
