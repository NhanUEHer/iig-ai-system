# Content Studio — Export & vòng đời chỉnh sửa (phân tích)

Ngày 19/11/2026. Dựa trên code hiện tại của nhánh `feat/ai-core` và module cũ `key-vocab`, `dictionary`, `learning-materials`.

## 1. Export Key Vocab & Từ điển — giữ nguyên file và nội dung cũ

### 1.1 Module cũ đang làm gì (giữ nguyên, tái dùng)

| | Key Vocab | Từ điển |
| --- | --- | --- |
| XLSX | `key-vocab/keyVocabExporter.js` — điền vào `assets/templates/KeyVocabulary_ImportTemplate.xlsx` (sheet1, giữ header, style) | `dictionary/dictionaryExporter.js` — điền vào `VocabularyDictionary_ImportTemplate.xlsx`, tự tính chiều cao dòng |
| Cột | A Từ vựng · B Từ gốc · C Loại từ vựng · D Phiên âm · E Nghĩa · F Audio (trống) | A Từ vựng · B Từ gốc · C Loại · D Phiên âm · E Nghĩa VI · F Nghĩa EN · G Nghĩa ngữ cảnh · H Ví dụ · I Cụm từ · J Đồng nghĩa · K Họ từ · L Audio (trống) |
| Quy tắc | Bắt buộc o, t, i, m; `p` phải thuộc 16 loại từ cho phép | Chỉ xuất mục **hoàn tất**; bắt buộc chunk, từ gốc, loại, IPA, nghĩa VI. G = `Câu gốc trong bài:\n“…TỪ VIẾT HOA…”\n→ giải thích`; H = `ví dụ EN\n→ ví dụ VI`; I = mỗi cụm 1 dòng; J = nối `, `; K = nối ` – ` |
| DOCX/PDF | `learning-materials/learningMaterialDocumentExporter.js` (`create(type, format, detail)`) | cùng file |

### 1.2 Ánh xạ dữ liệu Content Studio → định dạng cũ (không đổi exporter)

**Key Vocab** — artifact `vocab.content.items[]`:

| Content Studio | Exporter cũ | Ghi chú |
| --- | --- | --- |
| `inText` | `o` (Từ vựng) | dạng trong bài |
| `lemma` | `t` (Từ gốc) | |
| `pos` | `p` | agent `cs.vocab` dùng đúng 16 loại; mục nào sai loại → chặn export và báo dòng |
| `ipa` | `i` | |
| `meaningVi` | `m` | |

**Từ điển** — `cs_dict_candidates` (status) + `cs_dict_entries.content`:

| Content Studio | Exporter cũ |
| --- | --- |
| candidate `status = ready` | `status = 'completed'` (mục `needs_review/failed/draft` **không** xuất — giống cũ; màn export báo số mục bị bỏ qua) |
| `content.inText` | `originalChunk` |
| `content.lemma` | `canonical` |
| `content.pos` | `partOfSpeech` |
| `content.ipa`, `meaningVi`, `meaningEn` | `ipa`, `meaningVi`, `meaningEn` |
| `content.sentence` | `originalSentence` |
| `content.context` | `contextExplanation` |
| `content.example.en / .vi` | `exampleEn / exampleVi` |
| `collocations[]`, `synonyms[]`, `wordFamily[]` | giữ mảng — exporter tự nối như cũ |

Thứ tự dòng: theo câu (position) rồi theo vị trí chunk trong câu — giống file cũ.

### 1.3 Đề xuất triển khai

- `src/modules/content-studio/export/` gồm `mapVocab(item)` và `mapDictionary(item)` (chỉ ánh xạ) rồi gọi **đúng** `keyVocabExporter.createWorkbook` / `dictionaryExporter.createWorkbook` / `learningMaterialDocumentExporter.create`. Không copy template, không viết exporter mới → file ra giống hệt module cũ.
- API: `GET /api/content-studio/items/:id/export/:kind.:format`
  - `kind`: `vocab` | `dictionary` | `bilingual` | `questions` | `full`; `format`: `xlsx` (vocab, dictionary) | `docx`
  - quyền `content_studio.export` (đã có trong migration 149).
- UI: nút **Xuất** trên header trang học liệu → menu: Key Vocab (XLSX/DOCX), Từ điển (XLSX/DOCX), Song ngữ (DOCX), Câu hỏi (DOCX), Toàn bộ bài (DOCX). Mục chưa sẵn sàng thì mờ và ghi lý do (“còn 3 mục cần xem lại”).
- Export theo thư mục (nhiều bài → 1 file XLSX nối dòng) để giai đoạn sau.

## 2. Export DOCX — Song ngữ và Câu hỏi (mới)

Dùng thư viện `docx` đã có (cùng font/màu với `learningMaterialDocumentExporter`).

### 2.1 Song ngữ (`bilingual.docx`)
- Tiêu đề bài, Part, câu hỏi x–y.
- **Bảng 2 cột** (EN | VI), mỗi câu 1 dòng, đánh số S1…Sn — dễ đối chiếu và in.
- Phía dưới: “Bản dịch liền mạch” = các câu VI ghép thành đoạn (giống cách BE đang ghép).
- Câu `vi` trống/cần xem lại → in “(chưa dịch)” màu cam để không lọt bản thiếu.

### 2.2 Câu hỏi (`questions.docx`)
Mỗi câu:
1. **Câu n.** stem (EN) + 4 phương án, đánh dấu đáp án đúng (đậm + ✓).
2. **Dịch câu hỏi & đáp án** (đoạn đã ghép: câu hỏi + (A)–(D)).
3. **Hint**, 4. **Explanation** (trích dẫn “…” in nghiêng), 5. **Note**.
- Tuỳ chọn “Bản cho học viên”: ẩn đáp án/Explanation, chỉ giữ Hint (dùng làm phiếu luyện tập).

### 2.3 Toàn bộ bài (`full.docx`)
Đoạn văn → Song ngữ → Key Vocab (bảng) → Từ điển (theo câu) → Câu hỏi. Tái dùng các phần trên.

## 3. Vòng đời chỉnh sửa — hiện trạng & thiếu sót

### 3.1 Bảng use case

| # | Use case | Hiện có? | Ghi chú / thiếu |
| --- | --- | --- | --- |
| **Từ vựng** ||||
| V1 | Tạo lại toàn bộ danh sách (đổi level/mode) | ✅ | |
| V2 | Sửa 1 dòng (từ, IPA, loại, nghĩa) | ✅ | |
| V3 | Xoá 1 dòng | ✅ | |
| V4 | Thêm 1 từ thủ công | ⚠️ | phải tự gõ IPA/nghĩa — **thiếu “AI điền giúp” cho dòng mới** |
| V5 | Tạo lại 1 từ (giữ các từ khác) | ❌ | cần gọi AI cho đúng 1 mục |
| V6 | Sửa tay rồi bấm “Tạo lại toàn bộ” | ⚠️ | mất phần sửa tay không cảnh báo → **cần xác nhận** |
| **Từ điển** ||||
| D1 | Bóc từ + định nghĩa tự động | ✅ | |
| D2 | Sửa 1 mục | ✅ | |
| D3 | Tạo lại 1 mục | ✅ | |
| D4 | Xoá 1 mục | ✅ | |
| D5 | Thêm từ vào câu (Sửa danh sách từ) | ⚠️ | từ mới ở trạng thái nháp, **phải bấm thêm “Tạo từ điển”** — nên tự định nghĩa ngay như D1 |
| D6 | Sửa chữ của 1 chunk | ⚠️ | chuyển nháp, cùng vấn đề D5 |
| D7 | Tạo lại cả câu (batch) | ⚠️ | API có (`generate` theo `sentenceIds`) nhưng UI chưa có nút |
| D8 | Bóc lại từ đầu (xoá hết, bóc lại) | ❌ | cần xác nhận vì mất mục đã sửa tay |
| **Dịch** ||||
| T1 | Tạo lại toàn bộ | ✅ | |
| T2 | Sửa 1 câu | ✅ | |
| T3 | Tạo lại 1 câu | ❌ | gọi `cs.translate` với 1 câu + cả đoạn làm ngữ cảnh |
| **Câu hỏi** ||||
| Q1 | Tạo lại cả bộ | ✅ | |
| Q2 | Sửa 4 trường | ✅ | |
| Q3 | Tạo lại 1 câu | ⚠️ | có nút, nhưng gọi cả bộ rồi lấy 1 câu (tốn hơn) và **cache 30 giây có thể trả lại đúng kết quả cũ** nếu bấm ngay sau khi tạo |
| Q4 | Sửa đáp án đúng | ⚠️ | Explanation cũ vẫn giữ → **phải đánh dấu “lỗi thời”** |
| **Nguồn (đoạn văn / câu hỏi)** ||||
| S1 | Sửa đoạn văn gốc | ❌ **lỗi logic** | `updateContent` chỉ cập nhật text; Từ vựng/Dịch/Từ điển/Câu hỏi **không bị đánh dấu lỗi thời** → nội dung lệch với bài (trích dẫn sai, câu dịch lệch) |
| S2 | Sửa câu hỏi/phương án | ❌ **lỗi logic** | gói câu hỏi cũ vẫn “Hoàn tất” |
| S3 | Thêm/xoá câu hỏi | ❌ | chưa hỗ trợ |
| **Chung** ||||
| G1 | Tạo lại phần còn thiếu/lỗi | ⚠️ | “Tạo lại tất cả” tạo lại cả phần đã ổn |
| G2 | Lịch sử phiên bản / hoàn tác | ⚠️ | `cs_artifact_versions` có lưu nhưng UI chưa có |
| G3 | Chi phí theo học liệu | ❌ | task A14 |

### 3.2 Quy tắc “lỗi thời” (stale) cần bổ sung — theo SPEC đã chốt

| Khi sửa | Đánh dấu lỗi thời | Hành động gợi ý |
| --- | --- | --- |
| Đoạn văn | Từ vựng, Dịch; Từ điển: **chỉ các câu bị đổi** (so khớp câu) + mục của câu đó; Câu hỏi: tất cả (vì trích dẫn) | Banner “Đoạn văn đã sửa — 4 phần cần tạo lại” + nút “Tạo lại phần lỗi thời” |
| Câu hỏi / phương án | gói của câu đó | “Tạo lại câu này” |
| Đáp án đúng | gói của câu đó (Explanation) | idem |

Lưu thêm `source_hash` (hash đoạn văn/câu hỏi lúc tạo) vào artifact và câu từ điển; so khi đọc → `stale: true`. Không tự gọi AI (tốn tiền), chỉ báo và cho người dùng chọn.

## 4. Đề xuất task

| Task | Nội dung | Ưu tiên |
| --- | --- | --- |
| E1 | Export Key Vocab + Từ điển (XLSX/DOCX) qua exporter cũ + ánh xạ §1.2 + test so sánh file với module cũ | Cao |
| E2 | Export DOCX Song ngữ, Câu hỏi (2 bản: giáo viên / học viên), Toàn bộ bài | Cao |
| U1 | Stale: `source_hash`, đánh dấu lỗi thời khi sửa nguồn/đáp án, banner + “Tạo lại phần lỗi thời” | **Cao (lỗi logic)** |
| U2 | Từ điển: thêm/sửa chunk → tự định nghĩa ngay; nút “Tạo lại câu này”; “Bóc lại từ đầu” có xác nhận | Cao |
| U3 | Từ vựng: “AI điền” cho dòng mới, “Tạo lại từ này”; xác nhận trước khi tạo lại toàn bộ khi có sửa tay | Trung bình |
| U4 | Dịch: “Tạo lại câu này” | Trung bình |
| U5 | Câu hỏi: tạo lại 1 câu gọi riêng câu đó (bỏ cache bộ khi bấm tay) | Trung bình |
| U6 | Lịch sử phiên bản + hoàn tác cho mỗi phần | Thấp |
| A14 | Chi phí theo học liệu + thông báo lỗi AI | Trung bình |
