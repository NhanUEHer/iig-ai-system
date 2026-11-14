# Kế hoạch task triển khai kiến trúc hai hệ thống IIG

## 0. Hiện trạng và kế hoạch đang chạy (cập nhật 2026-11-14)

> Đọc mục này trước. Đây là kế hoạch làm việc hiện hành; các mục 5–12 bên dưới là backlog chi tiết gốc.

### 0.1 Code đang nằm ở đâu

Branch làm việc chính đã push lên GitHub (chưa có PR, chưa deploy).

| Repo | Worktree (`.codex-tmp/worktrees/…`) | Branch | Nội dung |
| --- | --- | --- | --- |
| Scoring | `scoring-phase1-integration` | `codex/scoring-phase1-integration` | **Branch làm việc chính của Scoring**: gộp S1–S8 + contract manifest |
| Scoring | `scoring-beta-baseline` | `codex/scoring-beta-baseline` | Baseline = Beta `3b1991f`, không sửa |
| Scoring | `scoring-admin-api-phase1`, `scoring-containers-s3-s4` | cùng tên | S5/S6 batch 1, S3/S4; đã gộp vào branch tích hợp |
| Admin | `admin-bff-tenant-scope` | `codex/admin-bff-tenant-scope` | **Branch làm việc chính của Admin**: tenant scope, chuẩn hóa tenantId, Idempotency-Key, contract test |
| Admin | `admin-beta-baseline` | `codex/admin-beta-baseline` | Baseline = Beta `2af0854`, không sửa |

### 0.2 Trạng thái từng task

| Task | Trạng thái | Đã có | Còn thiếu |
| --- | --- | --- | --- |
| F0–F4 | DONE | Baseline, ownership, contract v1 | — |
| S1 Migration | REVIEW | Runner checksum/fingerprint; chạy thật trên PG 16 | Chạy trên schema-only dump của Beta |
| S2 API/Worker | DONE | Tách entrypoint | — |
| S3/S4 Image | REVIEW | Build + smoke ARM64 pass, API 480 MB | Đẩy audio-base lên registry, ghi digest |
| S5 Public API | DONE (baseline) | create/detail/result/retry, tenant auth | — |
| S6 Admin API | IN_PROGRESS | **15/43 endpoint** (S6a đọc job xong), service credential, tenant scope, replay | 28 endpoint (S6b–S6e) |
| S7 Outbox/Inbox | REVIEW | Crash-window test thật pass | Metric reconciliation |
| S8 Webhook | IN_PROGRESS | Ký v2, body ổn định, retry, replay | Event `scoring.failed`/`scoring.cancelled` |
| S9 Regression | TODO | — | — |
| A-phase (Admin) | TODO | Tenant scope + contract alignment ở BFF | Cờ legacy/standalone, webhook receiver, reconciliation… |
| C, B, P | TODO | — | — |

### 0.3 Vấn đề đã phát hiện khi review

| # | Vấn đề | Mức | Trạng thái |
| --- | --- | --- | --- |
| 1 | FE gọi 36 endpoint, Scoring có 5; FE không gửi tenantId/Idempotency-Key | Nghiêm trọng | Lệch tham số đã sửa (`52b1958`, `7223219`), E2E 9/9; **thiếu endpoint vẫn còn** |
| 2 | Chưa push gì; doc chưa commit | Nghiêm trọng | Đã xử lý (W1) |
| 3 | Phần Claude làm chưa có review độc lập | Trung bình | Chưa làm (W6) |
| 4 | Fingerprint 139 tự duyệt | Trung bình | Xác nhận trên Beta ở B-phase |
| 5 | S6 quá lớn cho một task | Kế hoạch | Đã tách S6a–S6e |
| 6 | Change feed chưa có thiết kế ledger | Kế hoạch | Thuộc S6e |
| 7 | Admin chưa có cờ `legacy|standalone` | Kế hoạch | Thuộc A1 |

### 0.4 Thứ tự làm tiếp (work packages)

Mỗi gói xong phải: test pass, contract manifest cập nhật, commit local, ghi evidence vào mục này.

| Gói | Nội dung | Xong khi |
| --- | --- | --- |
| **W1 Bảo toàn** | Push các branch làm việc lên GitHub (không PR); commit doc kế hoạch + contract vào repo Admin; trả worktree baseline về đúng branch | Mọi commit có trên remote |
| **W2 S6a Đọc job** | `attempts`, `available-actions`, `plan`, `questions`, `questions/:id`, `groups/:id`, `timeline`, `pipeline`, `model-executions`, `export` | Màn hình danh sách + chi tiết job trên Admin chạy E2E không 404 |
| **W3 S6b Thao tác job** | `retry`, `cancel`, `rescore`, `reconcile`, `pipeline/:stepId/retry`; idempotency namespace dùng chung | Replay cùng key / conflict khác payload có test |
| **W4 S6c Tenant/credential, S6d Webhook/audit** | Quản trị tenant, credential, webhook endpoint, deliveries, audit events | Màn hình tenant/webhook chạy E2E |
| **W5 S6e + S8b** | Change ledger + `GET /jobs/changes`, `POST /jobs/lookup`; enqueue `scoring.failed`/`scoring.cancelled` | Manifest 43/43 implemented |
| **W6 S9 + review** | Regression suite Scoring; review độc lập toàn bộ Phase 1; S1 trên dump Beta; audio-base digest | Phase 1 gate đạt |
| **W7 Phase 2 (A1–A9)** | Cờ `legacy|standalone`, webhook receiver + inbox (A5), reconciliation (A6), tách Scoring khỏi Admin runtime | Admin không đọc Scoring DB; split E2E pass |
| W8+ | C1–C6 CI/CD, B1–B6 Beta, P1–P5 Production | Theo mục 5.1 |

Đang làm: **W3** (S6b thao tác job). W1, W2 DONE.

W2 evidence 2026-11-14 — Scoring `5fc59e6`, Admin `c02fd99` (đã push):
- 10 endpoint đọc mới (port từ read model cũ của Admin), mọi query lọc `job.tenant_id`; job tenant khác trả 404.
- List giữ cursor theo contract; FE chuyển sang `CursorPagination` (Trước/Sau). Chi tiết giữ shape cũ FE đang dùng, bỏ credential_id.
- E2E Admin BFF → Scoring API trên PostgreSQL 16 có dữ liệu job thật: 20/20.
- Test: Scoring lint sạch, Jest 44/44, core 480 pass; Admin 803/803, FE build + oxlint sạch.
- Ghi chú: 2 test design-system FE (màn Report) fail sẵn từ trước, không liên quan.
- Chưa có: parity dữ liệu thật so với Admin cũ (thuộc S9).

W1 evidence 2026-11-14:
- Pushed (không PR, không có workflow nào chạy): `NhanUEHer/iig-ai-scoring-backend` → `codex/scoring-phase1-integration` (`7223219`); `NhanUEHer/iig-ai-system` → `codex/admin-bff-tenant-scope`.
- Docs đã commit vào branch Admin; worktree `scoring-beta-baseline` trả về `codex/scoring-beta-baseline` (`3b1991f`).
- Backup git bundle (đã verify): `report/iig-two-system-backup-2026-11-14/{scoring,admin}.bundle`.

## 1. Mục đích

File này là backlog triển khai chính thức cho chương trình tách hệ thống hiện tại thành hai hệ thống độc lập:

1. **IIG Admin và Exam** dùng chung Admin API, PostgreSQL và Redis.
2. **AI Scoring** có API, Worker, PostgreSQL, Redis và release lifecycle riêng.

Hai hệ thống chỉ liên kết qua REST API có phiên bản và signed webhook. Không dùng chung database, Redis, migration, filesystem hoặc source module nghiệp vụ.

Tài liệu triển khai chi tiết liên quan:

- `docs/system-separation-phase-0.md`
- `docs/iig-scoring-ingestion-api-contract.md`
- `docs/iig-scoring-ingestion-database-design.md`
- `report/iig-two-system-implementation-plan-2026-11-14/Ke-hoach-trien-khai-kien-truc-hai-he-thong-IIG.docx`

## 2. Kết quả cần đạt

- Admin Web, Exam Web, Admin API, Scoring API và Scoring Worker là năm artifact độc lập.
- Thay đổi một frontend không bắt buộc build hoặc deploy backend và hệ thống còn lại.
- Scoring API image không chứa FFmpeg hoặc Python.
- Scoring Worker dùng audio base image có version riêng.
- Scoring DB là nguồn sự thật duy nhất cho job, run, plan, result, retry và model execution.
- Admin chỉ giữ `scoring_job_id` và projection trạng thái cần hiển thị.
- Admin tạo và quản trị job qua Scoring API bằng service credential riêng theo môi trường.
- Scoring gửi terminal event qua signed webhook; Admin có inbox chống gửi trùng và reconciliation.
- Beta và Production dùng cùng immutable image digest; Production không rebuild image.
- Mỗi release có health evidence, smoke evidence và rollback target.

## 3. Quy ước quản lý task

### 3.1 Trạng thái

| Trạng thái | Ý nghĩa |
| --- | --- |
| `TODO` | Chưa bắt đầu |
| `READY` | Đã đủ dependency và input để làm |
| `IN_PROGRESS` | Đang triển khai |
| `REVIEW` | Đã triển khai, đang review độc lập |
| `BLOCKED` | Có blocker cụ thể cần xử lý |
| `BETA_VERIFY` | Đã lên Beta, đang smoke hoặc soak |
| `DONE` | Hoàn thành đầy đủ acceptance và evidence |

### 3.2 Mức ưu tiên

| Ưu tiên | Ý nghĩa |
| --- | --- |
| `P0` | Chặn toàn bộ chương trình hoặc ảnh hưởng correctness dữ liệu |
| `P1` | Cần hoàn thành trước Beta cutover |
| `P2` | Cần hoàn thành trước Production hoặc để vận hành ổn định |
| `P3` | Cleanup hoặc cải tiến sau cutover |

### 3.3 Definition of Done cho mọi task code

- [ ] Scope và non-goal của task không thay đổi khi chưa được phê duyệt.
- [ ] Chỉ sửa file thuộc ownership của task.
- [ ] Không ghi secret, token, PII hoặc signed URL vào source, log hoặc evidence.
- [ ] Targeted tests pass.
- [ ] Broader checks pass theo mức rủi ro.
- [ ] Migration là append-only nếu task có thay đổi database.
- [ ] Có review độc lập.
- [ ] Có commit SHA hoặc PR rõ ràng.
- [ ] Handoff ghi changed files, tests, risks và deployment notes.

## 4. Sơ đồ phụ thuộc task

```text
F0 Baseline và inventory
  ├── F1 Admin clean baseline
  ├── F2 Scoring clean baseline
  ├── F3 Migration và data ownership inventory
  └── F4 API contract freeze
        │
        ├── S1 đến S9  AI Scoring canonical
        │       │
        │       └── A1 đến A9  Admin BFF và loại legacy Scoring
        │
        └── C1 đến C6  CI CD và local integration
                    │
                    └── B1 đến B6  Beta rollout
                                  │
                                  └── P1 đến P5  Production rollout
```

Critical path đề xuất:

```text
F0 → F2 → F3 → F4 → S1 → S2 → S3/S4 → S5/S8 → A1 → A2/A3
→ A4/A5/A6 → C2/C3/C4 → C5 → B1 → B2 → B3 → B4 → B5 → B6
→ P1 → P2 → P3 → P4 → P5
```

## 5. Bảng tổng task

| ID | Task | Ưu tiên | Phụ thuộc | Trạng thái |
| --- | --- | --- | --- | --- |
| F0 | Đóng băng scope và lập inventory worktree | P0 | Không | DONE |
| F1 | Tạo Admin clean baseline | P0 | F0 | DONE |
| F2 | Tạo Scoring clean baseline khớp Beta | P0 | F0 | DONE |
| F3 | Lập inventory migration và ownership dữ liệu | P0 | F1, F2 | DONE |
| F4 | Chốt API và webhook contract v1 | P0 | F3 | DONE |
| S1 | Chuẩn hóa migration history của AI Scoring | P0 | F2, F3 | REVIEW |
| S2 | Chuẩn hóa package boundary API và Worker | P0 | F2, F4 | DONE |
| S3 | Tạo Scoring API image nhẹ | P1 | S2 | REVIEW |
| S4 | Tạo audio base và Scoring Worker image | P1 | S2 | REVIEW |
| S5 | Hoàn thiện public Scoring API v1 | P0 | F4, S1 | DONE |
| S6 | Hoàn thiện Admin Scoring API v1 | P0 | F4, S1 | IN_PROGRESS |
| S7 | Hoàn thiện outbox inbox idempotency và reconciliation | P0 | S1, S2 | REVIEW |
| S8 | Hoàn thiện signed webhook delivery | P0 | F4, S7 | IN_PROGRESS |
| S9 | Khóa regression suite AI Scoring | P0 | S3 đến S8 | TODO |
| A1 | Tạo AI Scoring client và environment contract | P0 | F4, S5, S6 | TODO |
| A2 | Tạo Admin BFF read APIs | P0 | A1, S6 | TODO |
| A3 | Tạo Admin BFF operation APIs | P0 | A1, S6 | TODO |
| A4 | Chuyển Admin frontend sang BFF | P1 | A2, A3 | TODO |
| A5 | Tạo webhook inbox và scoring projection | P0 | S8, A1 | TODO |
| A6 | Tạo Admin reconciliation job | P0 | A2, A5 | TODO |
| A7 | Tách Scoring routes và workers khỏi Admin runtime | P0 | A2 đến A6 | TODO |
| A8 | Khóa ownership database trong Admin | P0 | A5, A7 | TODO |
| A9 | Khóa Admin integration và authorization tests | P0 | A1 đến A8 | TODO |
| C1 | Chốt path ownership và dependency graph | P1 | F1, F2 | TODO |
| C2 | Tách CI Admin FE Exam FE Admin API | P1 | C1 | TODO |
| C3 | Tách CI Scoring API Worker audio base | P1 | C1, S3, S4 | TODO |
| C4 | Tạo immutable release và promotion workflow | P0 | C2, C3 | TODO |
| C5 | Tạo local integration Compose | P0 | A9, S9 | TODO |
| C6 | Thêm health build identity metrics và alerts | P1 | S3, S4, A7 | TODO |
| B1 | Chuẩn bị và backup Beta | P0 | C4, C5, C6 | TODO |
| B2 | Deploy split Scoring API và Worker lên Beta | P0 | B1 | TODO |
| B3 | Deploy Admin BFF lên Beta với feature flag tắt | P0 | B2 | TODO |
| B4 | Cutover Admin Beta sang standalone Scoring | P0 | B3 | TODO |
| B5 | Tắt legacy Scoring runtime trên Admin Beta | P0 | B4 | TODO |
| B6 | Beta regression soak và release review | P0 | B5 | TODO |
| P1 | Production readiness review | P0 | B6 | TODO |
| P2 | Tách Scoring API và Worker trên Production | P0 | P1 | TODO |
| P3 | Promote migration và completion fixes | P0 | P2 | TODO |
| P4 | Cutover Admin Production sang BFF | P0 | P3 | TODO |
| P5 | Khóa legacy write paths và lập cleanup backlog | P1 | P4 | TODO |

---

## 5.1 Kế hoạch chia phase và agent thực thi

> Cập nhật ngày 2026-11-14 sau vòng preflight đa agent. Không agent triển khai code nào được bắt đầu từ worktree chính đang bẩn.

| Phase | Phạm vi task | Agent/role | Chế độ | Điều kiện bắt đầu | Gate hoàn thành |
| --- | --- | --- | --- | --- | --- |
| Phase 0 — Baseline | F0–F4 | Foundation owner, migration owner, contract owner | Tuần tự | Có quyền đọc Git/Beta metadata | Exact Admin và Scoring SHA; inventory sanitized; ownership; contract v1 |
| Phase 1A — Scoring DB/runtime | S1–S2 | Scoring migration owner, runtime owner | Tuần tự | F0–F4 DONE | Canonical migrations; API/Worker boundary tests pass |
| Phase 1B — Scoring APIs/durability | S5–S8 | Public API owner, Admin API owner, durability owner | Song song theo file ownership | S1–S2 DONE | Auth, idempotency, webhook, crash-window tests pass |
| Phase 1C — Scoring containers/QA | S3–S4, S9 | Container owner, independent QA | Song song rồi hội tụ | S2 DONE; API contracts frozen | Separate images; regression/container/restart gates pass |
| Phase 2 — Admin BFF | A1–A9 | Admin API owner, webhook/projection owner, FE owner, QA | Batch tuần tự | F4, S5–S8 DONE | Admin không truy cập Scoring DB; split E2E pass |
| Phase 3 — CI/CD và Local | C1–C6 | CI owner, observability owner | Tuần tự | A9 và S9 DONE | Path CI; promote-by-digest; local integration; health evidence |
| Phase 4 — Beta | B1–B6 | Release operator + independent reviewer | Tuần tự | Local gates pass và có Beta authorization | Cutover, regression và soak đạt yêu cầu |
| Phase 5 — Production | P1–P5 | Release operator + approver độc lập | Tuần tự | B6 DONE và explicit Production authorization | Staged cutover; rollback evidence; legacy writes khóa |

### Trạng thái phân công hiện tại

| Agent | Phạm vi đã giao | Kết quả |
| --- | --- | --- |
| `phase0_foundation` | Audit F0 và thiết kế F1/F2 | Hoàn tất read-only; F0 bị block bởi quyết định exact baseline SHA |
| `phase1_scoring_preflight` | Đối chiếu F2–F4, S1–S9 | Hoàn tất read-only; xác định phần đã có, phần thiếu và file ownership |
| `phase2_admin_cicd_preflight` | Đối chiếu A1–A9, C1–C6 | Hoàn tất read-only; xác định direct-DB coupling và CI/CD gaps |

### Blocker phải giải quyết trước khi mở writing agents

- [ ] Xác minh image digest và OCI revision đang chạy trên Beta cho Admin và Scoring.
- [ ] Chọn exact authoritative SHA cho Admin baseline và Scoring baseline.
- [ ] Phân loại 93 tracked changes và 356 untracked entries của Admin theo keep/prototype/artifact/secret-risk.
- [ ] Chọn một migration owner duy nhất và làm rõ gap migration `127` cùng ancestry `121–148`.
- [ ] Chốt namespace và operation contract `/api/admin/v1` trong F4.
- [ ] Tạo dedicated clean worktree cho từng writing batch; không cho hai agent ghi cùng worktree.

### Quy tắc mở agent cho từng batch

1. Agent implementation chỉ nhận task khi tất cả dependency ở trạng thái `DONE` hoặc có exception được phê duyệt và ghi lại.
2. Mỗi writing agent phải được cấp dedicated worktree, branch `codex/*` và danh sách file ownership cụ thể.
3. `package.json`, lockfile, migration, entrypoint, route aggregator và workflow chỉ có một owner tại một thời điểm.
4. Agent review độc lập chỉ bắt đầu khi implementation head đã cố định; review không tự sửa code.
5. Release agent không được merge hoặc deploy chỉ vì code đã pass; Beta và Production cần authorization riêng.
6. Handoff bắt buộc ghi changed files, tests, commit SHA, migration/deployment notes, residual risks và rollback target.

---

# 6. Foundation tasks

## F0 Đóng băng scope và lập inventory worktree

**Ưu tiên:** P0  
**Trạng thái:** DONE  
**Repository:** Admin root và standalone Scoring  
**Phụ thuộc:** Không

### Mục tiêu

Bảo toàn toàn bộ thay đổi hiện có và tạo danh sách chính xác những gì đang nằm ngoài Git baseline trước khi tạo worktree sạch.

### Cách triển khai

1. Ghi lại branch, HEAD, remote và `git status --short` của Admin repository.
2. Ghi lại cùng thông tin cho standalone Scoring repository và mọi worktree liên quan.
3. Phân nhóm file thay đổi:
   - Thay đổi sản phẩm cần giữ.
   - Prototype tách hệ thống.
   - Test và migration mới.
   - Artifact sinh ra hoặc file tạm.
   - Secret hoặc credential cần loại khỏi workspace.
4. Không reset, checkout hoặc xóa file trong worktree hiện tại.
5. Tạo inventory Markdown hoặc JSON gắn timestamp và commit SHA.

### Checklist kiểm tra

- [ ] Inventory bao phủ tracked, untracked và deleted files.
- [ ] Không có nội dung secret được copy vào evidence.
- [ ] Mỗi worktree có branch và commit identity.
- [ ] Không có file người dùng bị thay đổi hoặc xóa.
- [ ] Có danh sách file prototype separation cần chuyển sang baseline mới.

### Evidence

- Sanitized Git inventory.
- Danh sách worktree.
- Danh sách thay đổi cần giữ.

### Rollback

Không có mutation runtime. Nếu inventory sai, tạo lại từ worktree gốc; không sửa worktree để khớp inventory.

### Kết quả audit 2026-11-14

- Admin hiện có 78 modified, 15 deleted và 356 untracked entries; không dùng làm release baseline.
- Standalone Scoring đã là repository riêng nhưng worktree chính và pipeline worktree đều còn thay đổi chưa commit.
- Đã tìm thấy clean worktree candidates, nhưng local refs lệch remote refs và chưa có evidence nối Beta image digest với exact commit.
- Admin Beta đã xác minh dùng revision `2af08544de55702faed4249017ce717d833092c1`; clean worktree: `.codex-tmp/worktrees/admin-beta-baseline`.
- Scoring Beta đã xác minh dùng revision `3b1991f37780b9dfa620b09024620886d90a4dc0`; clean clone: `.codex-tmp/worktrees/scoring-beta-baseline`.
- Image digest Beta đã được đối chiếu read-only; không đọc `.env`, database hoặc runtime credentials.
- Migration ownership tiếp tục được khóa ở F3/S1; không agent khác được tự thêm migration.

## F1 Tạo Admin clean baseline

**Ưu tiên:** P0  
**Trạng thái:** DONE  
**Repository:** `iig-ai-system`  
**Phụ thuộc:** F0

### Mục tiêu

Có một worktree Admin sạch, truy ngược được về remote revision và không chứa thay đổi ngoài scope.

### Cách triển khai

1. Chọn branch nền theo release policy hiện tại.
2. Tạo worktree mới dưới `.codex-tmp/worktrees/` hoặc vị trí đã phê duyệt.
3. Chạy locked dependency install.
4. Chạy `npm run check` trên baseline trước khi chuyển code.
5. Chuyển từng nhóm thay đổi từ worktree hiện tại bằng commit hoặc patch nhỏ.
6. Không copy toàn bộ thư mục `src`, `frontend` hoặc migration hàng loạt.

### Checklist kiểm tra

- [ ] Worktree sạch trước khi nhận thay đổi.
- [ ] Baseline check pass hoặc có blocker được ghi rõ.
- [ ] Mỗi patch chỉ chứa một mục tiêu.
- [ ] Không đưa file tạm, artifact hoặc secret vào Git.
- [ ] Runtime hiện tại vẫn có thể build.

### Acceptance criteria

- Admin source có một branch sạch để triển khai chương trình.
- Tất cả thay đổi được giữ có lý do và owner.
- Không còn dùng worktree bẩn làm release source.

### Evidence 2026-11-14

- Exact Beta SHA: `2af08544de55702faed4249017ce717d833092c1`.
- Worktree/branch: `.codex-tmp/worktrees/admin-beta-baseline`, `codex/admin-beta-baseline`.
- Locked installs và `npm run check` pass: 793 tests, 790 pass, 0 fail, 3 skipped; Admin/Exam production builds pass.
- Worktree clean. Supply-chain backlog: 7 root findings và 1 Admin frontend high finding.

## F2 Tạo Scoring clean baseline khớp Beta

**Ưu tiên:** P0  
**Trạng thái:** DONE  
**Repository:** `iig-ai-scoring-backend`  
**Phụ thuộc:** F0

### Mục tiêu

Xác định source revision chính xác của image Scoring Beta và tạo worktree sạch từ revision đó.

### Cách triển khai

1. Đọc image label `org.opencontainers.image.revision` trên Beta.
2. Fetch remote refs, không suy đoán commit từ branch local hiện tại.
3. Xác minh commit tồn tại trên remote và nằm trong delivery ancestry hợp lệ.
4. Tạo clean worktree từ revision hoặc branch chứa revision.
5. So sánh migration files với `schema_migrations` trên Beta.
6. Chạy `npm run check` và Docker build baseline.

### Checklist kiểm tra

- [ ] Beta image digest ánh xạ được tới exact commit SHA.
- [ ] Worktree có đầy đủ migration đang áp dụng trên Beta.
- [ ] Build và check không phụ thuộc file ngoài repository.
- [ ] Không sử dụng branch `feature/ten-tinh-nang` cũ làm baseline nếu không chứa Beta revision.
- [ ] Có rollback identity của image Beta hiện tại.

### Acceptance criteria

- Có clean Scoring worktree đại diện đúng Beta.
- Source, migration và image provenance khớp nhau.

### Evidence 2026-11-14

- Exact Beta SHA: `3b1991f37780b9dfa620b09024620886d90a4dc0`.
- Worktree/branch: `.codex-tmp/worktrees/scoring-beta-baseline`, `codex/scoring-beta-baseline`.
- Node 22/npm 10 locked install pass; lint, 19 Jest tests, 434 core tests và build đều pass.
- OCI revision liên kết đúng release SHA; worktree clean.
- Supply-chain backlog: 34 audit findings. Architecture backlog: image chung khoảng 1.095 GB chứa FFmpeg/Python.

## F3 Lập inventory migration và ownership dữ liệu

**Ưu tiên:** P0  
**Trạng thái:** DONE  
**Repository:** Admin và Scoring  
**Phụ thuộc:** F1, F2

### Mục tiêu

Chốt bảng nào thuộc Admin, bảng nào thuộc Scoring, bảng nào là projection và bảng nào là legacy.

### Cách triển khai

1. Export danh sách table, constraint, index và migration của Local, Beta và Production.
2. Phân loại bảng theo bốn nhóm:
   - Admin authoritative.
   - Scoring authoritative.
   - Admin projection.
   - Legacy pending archive.
3. Tìm foreign key hoặc repository query xuyên bounded context.
4. Ghi rõ read path và write path hiện tại cho từng bảng Scoring còn nằm trong Admin.
5. Không drop hoặc đổi schema ở task này.

### Checklist kiểm tra

- [ ] Mọi bảng `iig_*` có owner.
- [ ] Mọi foreign key xuyên context được liệt kê.
- [ ] Mọi Admin repository đọc Scoring table được liệt kê.
- [ ] Có row count và timestamp range ở Beta và Production.
- [ ] Có mapping job ID giữa Admin shadow job và Scoring canonical job.

### Deliverable

`docs/two-system-data-ownership-inventory.md`

### Audit finding 2026-11-14

- Hai repository chỉ có migration checksum-identical ở `121`, `124`, `125`.
- Cùng migration number từ `126` trở đi có semantic khác nhau; cấm ghép, renumber hoặc replay chéo.
- Admin DB và Scoring DB phải giữ migration ledger/canonical ancestry độc lập.
- Scoring sở hữu pipeline, snapshots, result, retry, outbox/inbox và integration credentials.
- Admin chỉ sở hữu quản trị/Exam cùng Scoring projection và inbound webhook inbox.

## F4 Chốt API và webhook contract v1

**Ưu tiên:** P0  
**Trạng thái:** DONE  
**Repository:** Scoring contract owner  
**Phụ thuộc:** F3

### Mục tiêu

Đóng băng contract tối thiểu để Admin BFF và Scoring có thể phát triển độc lập.

### Phạm vi contract

- Public create, status, result và retry.
- Admin job list, detail, cancel, rescore, reconcile và step retry.
- Tenant, credential, webhook và audit operations.
- Error schema.
- Webhook payload, signature và retry semantics.
- Idempotency Key và correlation ID.

### Checklist kiểm tra

- [ ] OpenAPI hoặc contract document có version.
- [ ] Request và response có example không chứa PII.
- [ ] Mỗi endpoint có scope.
- [ ] Tenant isolation được mô tả.
- [ ] Retry safety và idempotency được mô tả.
- [ ] Webhook replay protection được mô tả.
- [ ] Có backward compatibility policy.
- [ ] Admin và Scoring owner cùng review.

### Acceptance criteria

- Client và server có thể viết contract tests độc lập.
- Không còn yêu cầu Admin đọc Scoring DB để hoàn thành màn hình quản trị.

### Contract gap 2026-11-14

- Public Scoring API create/detail/result/retry, tenant auth và idempotency đã tồn tại.
- Admin có BFF client, nhưng standalone Scoring Beta chưa cung cấp `/api/admin/v1`.
- Admin chưa có inbound webhook inbox/projection; module hiện tại là outbound Scoring delivery.
- Contract v1 phải khóa service credential, actor context, mutation idempotency, raw-body HMAC, duplicate event semantics và reconciliation API.
- Independent review cuối: `APPROVED`; các findings về tenant scope, change cursor, deterministic secret lookup, management idempotency và PII lifecycle đã đóng.

---

# 7. AI Scoring implementation tasks

## S1 Chuẩn hóa migration history của AI Scoring

**Ưu tiên:** P0  
**Trạng thái:** IN_PROGRESS  
**Phụ thuộc:** F2, F3

### Mục tiêu

Standalone Scoring có một migration history duy nhất, append-only và khớp Beta.

### Cách triển khai

1. Lấy migration `121` đến migration mới nhất từ clean Beta baseline.
2. Xác minh checksum hoặc nội dung migration đã áp dụng.
3. Không sửa migration đã chạy trên Beta hoặc Production.
4. Tạo migration mới để sửa schema nếu cần.
5. Test apply trên:
   - Database rỗng.
   - Snapshot schema Production trước migration.
   - Snapshot schema Beta.
6. Phân tích forward compatibility với image đang chạy và rollback image.

### Checklist kiểm tra

- [ ] Migration apply atomically khi phù hợp.
- [ ] Có unique/index phục vụ idempotency và outbox/inbox.
- [ ] Không còn foreign key sang Admin-owned table.
- [ ] Không có destructive change trong cùng release cutover.
- [ ] Migration one-shot container trả exit code chính xác.

### Evidence

- Migration test logs.
- Schema diff trước và sau.
- Compatibility note.

### Evidence 2026-11-14 — real PostgreSQL (disposable `postgres:16-alpine`)

- Code: commit `75842f4`, branch `codex/scoring-s1-s2-migration-runtime` (local, chưa push).
- DB rỗng không cờ bootstrap: từ chối, exit 1 ("explicit empty-database bootstrap is required").
- DB rỗng + `IIG_MIGRATION_BOOTSTRAP_EMPTY_DATABASE=true`: áp dụng 121→137 (17 migration, 34 bảng), exit 0.
- Chạy lại trên DB đã migrate: no-op, exit 0.
- Không còn FK nào trỏ ra ngoài bảng `iig_*`/`integration_*`.
- Thêm cột lạ vào `iig_scoring_jobs`: từ chối "structural fingerprint mismatch", exit 1; gỡ cột thì pass lại.
- Sửa checksum ledger của `137`: từ chối "checksum mismatch", exit 1.
- Còn thiếu: apply trên snapshot schema Beta/Production (cần dump schema-only, chưa có quyền đọc DB).

## S2 Chuẩn hóa package boundary API và Worker

**Ưu tiên:** P0  
**Trạng thái:** DONE  
**Phụ thuộc:** F2, F4

### Mục tiêu

API không khởi động Worker; Worker không mở public HTTP API; shared core không import Admin code.

### Cách triển khai

1. Tách rõ `apps/scoring-api`, `apps/scoring-worker` hoặc entrypoint tương đương.
2. Di chuyển shared domain code vào package/module có dependency direction rõ ràng.
3. Worker registry chỉ chứa Scoring-owned consumers.
4. Mọi consumer mặc định inert nếu enable flag không được cấu hình.
5. Thêm runtime boundary tests.

### Checklist kiểm tra

- [ ] API entrypoint không gọi `startWorker`.
- [ ] Worker entrypoint không mount controllers.
- [ ] Shutdown đóng đúng DB và Redis clients.
- [ ] Startup failure unwind các resource đã mở.
- [ ] Không có relative require ra ngoài repository.

## S3 Tạo Scoring API image nhẹ

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** S2

### Mục tiêu

API image không chứa FFmpeg, Python hoặc audio model dependencies.

### Cách triển khai

1. Tạo `Dockerfile.api` multi-stage.
2. Chỉ copy production Node dependencies và API dist.
3. Chạy bằng non-root user và `tini` nếu cần.
4. Thêm image labels cho version và commit SHA.
5. Thêm health check `/health/live`.
6. Đo image size và cold start so với image cũ.

### Acceptance criteria

- [ ] `ffmpeg`, `python3`, `torch` không có trong API image.
- [ ] API contract tests pass trong container.
- [ ] Image chạy được trên target ARM64.
- [ ] Image size giảm đáng kể so với image chung hiện tại.

## S4 Tạo audio base và Scoring Worker image

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** S2

### Mục tiêu

Tách dependency audio nặng khỏi application build thường xuyên.

### Cách triển khai

1. Tạo `Dockerfile.audio-base` chứa Node runtime, FFmpeg và `tini`.
2. Chỉ thêm Python nếu runtime thực tế còn cần Python wrapper.
3. Pin base image digest và FFmpeg version.
4. Publish `iig-scoring-audio-runtime:<version>`.
5. Tạo `Dockerfile.worker` kế thừa audio base.
6. Thêm smoke test audio normalize, silence detection và duration probe.
7. Không cài DeepFilterNet, Torch, librosa hoặc noisereduce nếu chưa có product decision và regression suite.

### Checklist kiểm tra

- [ ] Worker image chạy trên ARM64 Production host.
- [ ] Audio base không rebuild khi chỉ đổi Worker JS/TS code.
- [ ] FFmpeg filter output khớp fixture đã duyệt.
- [ ] Worker có memory và CPU limit phù hợp.
- [ ] `/tmp` có giới hạn và được cleanup.

## S5 Hoàn thiện public Scoring API v1

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** F4, S1

### Endpoint

- `POST /api/v1/scoring-jobs`
- `GET /api/v1/scoring-jobs/:jobId`
- `GET /api/v1/scoring-jobs/:jobId/result`
- `POST /api/v1/scoring-jobs/:jobId/retry`

### Cách triển khai

1. Dùng DTO validation whitelist và forbid unknown fields.
2. Authenticate credential bằng hash; không lưu raw credential.
3. Enforce tenant và scope tại guard/service boundary.
4. Ghi job, idempotency record và outbox trong cùng transaction.
5. Result endpoint chỉ trả kết quả của tenant sở hữu job.
6. Retry tạo lineage và idempotency riêng.

### Checklist kiểm tra

- [ ] Thiếu auth trả 401.
- [ ] Credential sai hoặc scope sai trả 403.
- [ ] Cross-tenant job access bị chặn.
- [ ] Duplicate Idempotency Key replay cùng response.
- [ ] Same key nhưng payload khác bị reject.
- [ ] Rate-limit headers và 429 đúng contract.

## S6 Hoàn thiện Admin Scoring API v1

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** F4, S1

### Endpoint tối thiểu

- Job list và detail.
- Cancel, retry, rescore, reconcile và step retry.
- Tenant management.
- Credential issue, revoke và rotation metadata.
- Webhook endpoint management.
- Audit event list.

### Cách triển khai

1. Tạo namespace `/api/admin/v1`.
2. Dùng Admin service credential type riêng với public tenant credential.
3. Scope từng operation và ghi audit cho mutation.
4. Operations phải idempotent hoặc có operation key.
5. Không trả secret sau lần issue credential đầu tiên.

### Acceptance criteria

- [ ] Admin BFF có đủ API thay thế Admin Scoring repositories.
- [ ] Mutation có audit actor, request ID và before/after status.
- [ ] Cancel/rescore/reconcile tuân thủ state machine.
- [ ] Không có operation nào bypass tenant ownership.

## S7 Hoàn thiện outbox inbox idempotency và reconciliation

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** S1, S2

### Mục tiêu

Job không mất và không bị xử lý trùng khi API, Redis hoặc Worker restart.

### Cách triển khai

1. Ghi domain state và outbox event trong cùng transaction.
2. Relay claim event bằng lock/lease có timeout.
3. Consumer ghi inbox/event processing marker trước hoặc trong transaction state update.
4. Ack stream chỉ sau durable commit.
5. Startup reconciliation tìm job ở trạng thái có thể phục hồi.
6. Bounded reconciliation, không scan toàn DB không giới hạn.

### Checklist kiểm tra

- [ ] Crash trước publish được relay lại.
- [ ] Crash sau publish trước mark-delivered không tạo state duplicate.
- [ ] Duplicate stream event không chạy provider lần hai khi đã commit result.
- [ ] Pending consumer được reclaim an toàn.
- [ ] Reconciliation có metric và audit.

### Evidence 2026-11-14 (local, branch `codex/scoring-phase1-integration`, commit `d26deb0`)

- S7: outbox discovery chỉ xét source row `PENDING/FAILED`; log count cho stale-lease recovery/discovery.
- Real PostgreSQL 16 + Redis 7: crash trước publish được relay lại; crash sau publish trước mark-published phát lại cùng event ID và inbox dedupe; pending entry của consumer chết được reclaim, chỉ ack sau khi handler xong.
- Còn thiếu: metric thật (Prometheus) cho reconciliation.

## S8 Hoàn thiện signed webhook delivery

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** F4, S7

### Mục tiêu

Scoring gửi terminal event có chữ ký, retry và delivery audit.

### Cách triển khai

1. Chốt event envelope và raw-body signature format.
2. Tạo delivery attempt với unique event and endpoint key.
3. Retry exponential backoff có giới hạn.
4. Phân biệt retryable HTTP và terminal configuration errors.
5. Không log secret hoặc full sensitive payload.
6. Có replay operation qua Admin API với audit.

### Checklist kiểm tra

- [ ] HMAC test vectors pass.
- [ ] Timestamp và event ID ổn định qua retry.
- [ ] 2xx đánh delivered đúng một lần.
- [ ] Timeout, 429 và 5xx được retry.
- [ ] 4xx contract/configuration error có policy rõ ràng.

### Evidence 2026-11-14 (local, branch `codex/scoring-phase1-integration`, commit `d26deb0`)

- Migration 139: `signing_key_id`, `signature_version` (delivery cũ giữ `v1`, mới `v2`), `replay_count`, idempotency key cho admin audit. Apply trên prefix Beta + bootstrap rỗng cho cùng fingerprint.
- Chữ ký v2 khớp test vector F4; body đóng băng trước lần gửi đầu; backoff có jitter; complete/fail bị chặn theo lease.
- Retry: timeout, 408/425/429/5xx. Permanent: 4xx khác và lỗi cấu hình.
- `POST /api/admin/v1/webhook-deliveries/:id/replay`: quyền `ai_scoring.webhooks.replay`, Idempotency-Key (replay/conflict), audit cùng transaction.
- Còn thiếu: event `scoring.failed`/`scoring.cancelled` chưa được enqueue; receiver phía Admin (A5).

## S9 Khóa regression suite AI Scoring

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** S3 đến S8

### Bộ test bắt buộc

- Speaking Q1-Q2 RTA.
- Describe Picture Q3-Q4.
- Respond Q5-Q10.
- Express Opinion Q11.
- Writing groups đang hỗ trợ.
- Missing media, invalid audio và silence.
- Provider timeout và depleted credit.
- Retry stage, retry job và reconciliation.
- Plan-driven completion.
- Restart API, Worker và Redis transport.

### Acceptance criteria

- [ ] Expected normalized output được version hóa.
- [ ] Test không phụ thuộc Production payload hoặc PII.
- [ ] Không có test flaky chưa được ghi nhận.
- [ ] Full `npm run check` pass.
- [ ] Container smoke pass cho API và Worker images.

---

# 8. Admin implementation tasks

## A1 Tạo AI Scoring client và environment contract

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** F4, S5, S6

### Mục tiêu

Admin có một typed client duy nhất để gọi Scoring API.

### Cách triển khai

1. Tạo client trong `src/clients` hoặc module `scoring-bff`.
2. Validate `AI_SCORING_BASE_URL` và credential ở startup.
3. Thiết lập connect timeout và request timeout.
4. Retry chỉ cho GET hoặc request có Idempotency Key.
5. Truyền request ID/correlation ID.
6. Chuẩn hóa upstream errors thành Admin error contract.

### Checklist kiểm tra

- [ ] Không log Authorization header.
- [ ] Không retry mutation không idempotent.
- [ ] DNS, connect timeout, request timeout và invalid JSON có test.
- [ ] Base URL không được phép trỏ localhost trong Production nếu policy cấm.
- [ ] Client không đọc Scoring DB fallback.

## A2 Tạo Admin BFF read APIs

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A1, S6

### Phạm vi

- Job list.
- Job detail.
- Result detail.
- Tenant, credential metadata, webhook và audit read APIs.

### Acceptance criteria

- [ ] Admin session và permission được kiểm tra trước upstream call.
- [ ] Filter và pagination được validate.
- [ ] Error state hiển thị được trên UI.
- [ ] Response không lộ Scoring service credential.
- [ ] Read API có contract tests với mock Scoring server.

## A3 Tạo Admin BFF operation APIs

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A1, S6

### Phạm vi

- Retry.
- Cancel.
- Rescore.
- Reconcile.
- Step retry.
- Tenant, credential và webhook mutations.

### Checklist kiểm tra

- [ ] Permission riêng cho mỗi nhóm operation.
- [ ] Idempotency Key được tạo hoặc truyền ổn định.
- [ ] Request ID đi xuyên hai hệ thống.
- [ ] Negative authorization tests pass.
- [ ] UI nhận được operation status rõ ràng.

## A4 Chuyển Admin frontend sang BFF

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** A2, A3

### Mục tiêu

Admin FE chỉ gọi same-origin `/api/ai-scoring/*` BFF; không gọi Scoring domain trực tiếp.

### Cách triển khai

1. Chuẩn hóa `aiScoringJobService` và các frontend services liên quan.
2. Loại mọi hard-coded Scoring domain và credential.
3. Giữ loading, empty, partial failure và retry states.
4. Chuyển từng màn hình bằng feature flag nếu cần.

### Checklist kiểm tra

- [ ] Job list/detail/operations chạy qua BFF.
- [ ] Tenant/credential/webhook screens chạy qua BFF.
- [ ] 401/403/409/429/5xx có thông báo phù hợp.
- [ ] Frontend build và lint pass.
- [ ] Exam FE không bị rebuild nếu chỉ đổi Admin Scoring UI.

## A5 Tạo webhook inbox và scoring projection

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** S8, A1

### Database

Tạo migration append-only cho:

- `scoring_event_inbox` với unique event ID.
- `admin_scoring_job_projection` hoặc tên theo convention hiện tại.
- Index theo `scoring_job_id`, `submission_id`, status và updated time.

### Cách triển khai

1. Capture raw body trước JSON parsing cho HMAC verify.
2. Verify timestamp và constant-time signature.
3. Insert inbox và update projection trong cùng transaction.
4. Duplicate event trả 2xx và không update lần hai.
5. Không lưu full sensitive payload nếu không cần.

### Checklist kiểm tra

- [ ] Invalid signature bị reject.
- [ ] Expired timestamp bị reject.
- [ ] Duplicate event idempotent.
- [ ] Job/tenant mapping mismatch bị reject và audit.
- [ ] Migration apply và rollback compatibility analysis hoàn thành.

## A6 Tạo Admin reconciliation job

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A2, A5

### Mục tiêu

Sửa projection khi webhook bị mất hoặc Admin downtime.

### Cách triển khai

1. Query projection chưa terminal hoặc quá stale theo batch nhỏ.
2. Gọi Scoring status API.
3. Update projection idempotently.
4. Ghi metric `reconciliation_corrections_total`.
5. Có distributed lock trong Admin Redis nếu nhiều replica.

### Checklist kiểm tra

- [ ] Job bounded theo batch size và time budget.
- [ ] Không scan toàn DB mỗi chu kỳ.
- [ ] Không ghi ngược Scoring DB.
- [ ] Network failure không làm mất projection cũ.
- [ ] Có manual reconcile operation cho một job.

## A7 Tách Scoring routes và workers khỏi Admin runtime

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A2 đến A6

### Mục tiêu

Admin process chỉ chạy Admin-owned HTTP routes, scheduler và workers.

### Cách triển khai

1. Dùng `src/apps/admin/app.js` làm app entrypoint chính.
2. Dùng `src/apps/admin/server.js` làm server entrypoint chính.
3. Loại Scoring integration routes khỏi Admin app.
4. Loại ingestion, Scoring và webhook delivery workers khỏi Admin server.
5. Giữ Admin webhook receiver vì đây là consumer của integration contract.
6. Thêm boundary tests.

### Acceptance criteria

- [ ] Admin startup không import `iig-ingestion` hoặc `iig-ai-scoring` workers.
- [ ] Admin image không cần provider credentials.
- [ ] Admin health không phụ thuộc Scoring DB hoặc Redis.
- [ ] Legacy entrypoint không còn được dùng trong Beta deployment.

## A8 Khóa ownership database trong Admin

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A5, A7

### Mục tiêu

Ngăn code mới đọc/ghi bảng Scoring legacy trong Admin DB.

### Cách triển khai

1. Lập denylist hoặc architecture test cho Scoring-owned table names.
2. Xóa route/service dependency vào legacy repositories sau khi BFF parity đạt.
3. Đổi write paths legacy thành read-only hoặc feature flag off.
4. Chưa drop table.

### Checklist kiểm tra

- [ ] Repository scan không có query mới tới Scoring-owned tables.
- [ ] Admin migrations không tạo hoặc alter Scoring-owned tables.
- [ ] Legacy writes bằng 0 trong Beta soak.
- [ ] Backup và archive plan tồn tại.

## A9 Khóa Admin integration và authorization tests

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A1 đến A8

### Bộ test

- BFF success/error contracts.
- Permission positive và negative cases.
- Webhook valid, invalid, replay và duplicate.
- Reconciliation correction.
- Admin startup không start Scoring Worker.
- Frontend job list/detail/operations.
- Exam catalog, attempt, autosave, submit và result regression.

### Acceptance criteria

- [ ] Targeted tests pass.
- [ ] `npm run check` pass.
- [ ] Không có regression Exam khi tách Scoring.

---

# 9. CI CD and local environment tasks

## C1 Chốt path ownership và dependency graph

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** F1, F2

### Mục tiêu

Xác định thay đổi path nào làm build artifact nào.

### Deliverable

Ma trận tối thiểu:

| Path | Admin FE | Exam FE | Admin API | Scoring API | Scoring Worker |
| --- | --- | --- | --- | --- | --- |
| `apps/admin-web/**` | Có | Không | Không | Không | Không |
| `apps/exam-web/**` | Không | Có | Không | Không | Không |
| `apps/admin-api/**` | Không | Không | Có | Không | Không |
| `apps/scoring-api/**` | Không | Không | Không | Có | Theo dependency graph |
| `apps/scoring-worker/**` | Không | Không | Không | Không | Có |
| `packages/scoring-core/**` | Không | Không | Không | Có | Có |

## C2 Tách CI Admin FE Exam FE Admin API

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** C1

### Cách triển khai

1. Tạo workflow hoặc jobs độc lập với path filters.
2. Dùng lockfile cache riêng theo artifact.
3. Admin FE và Exam FE build riêng.
4. Admin API chạy backend tests và image build riêng.
5. Không chạy full root build khi chỉ một FE thay đổi, trừ scheduled full verification.

### Acceptance criteria

- [ ] Sửa Admin CSS không build Exam FE hoặc backend.
- [ ] Sửa Exam UI không build Admin FE.
- [ ] Shared UI thay đổi chỉ fan-out tới consumer thực sự dùng package.
- [ ] CI status rõ artifact nào pass/fail.

## C3 Tách CI Scoring API Worker audio base

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** C1, S3, S4

### Acceptance criteria

- [ ] API image và Worker image có workflow riêng.
- [ ] Audio base chỉ build khi Dockerfile hoặc system dependency manifest đổi.
- [ ] Production target ARM64 được build và smoke.
- [ ] Multi-arch compatibility build không chặn mọi hotfix nếu policy không yêu cầu.
- [ ] Cache scope không làm Beta và Production rebuild dependency không cần thiết.

## C4 Tạo immutable release và promotion workflow

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** C2, C3

### Mục tiêu

Build một lần và promote cùng digest từ Beta sang Production.

### Checklist kiểm tra

- [ ] Image tag chứa exact commit SHA.
- [ ] Image label chứa revision và version.
- [ ] Beta deploy ghi digest thực tế.
- [ ] Production workflow nhận digest đã Beta Verified.
- [ ] Production không chạy Docker build.
- [ ] Rollback chọn được digest trước đó.
- [ ] Migration chạy bằng one-shot container và fail closed.

## C5 Tạo local integration Compose

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** A9, S9

### Topology

```text
Admin Compose
  Admin API
  Admin PostgreSQL
  Admin Redis

Scoring Compose
  Scoring API
  Scoring Worker
  Scoring PostgreSQL
  Scoring Redis

Integration Network
  HTTP only between Admin API and Scoring API
```

### Checklist kiểm tra

- [ ] Hai PostgreSQL volume riêng.
- [ ] Hai Redis volume riêng.
- [ ] Admin không có Scoring DATABASE URL.
- [ ] Scoring không có Admin DATABASE URL.
- [ ] Service credential và webhook secret là local-only fixtures.
- [ ] Local start/stop script không xóa volume mặc định.
- [ ] End-to-end submit, status, result và webhook pass.

## C6 Thêm health build identity metrics và alerts

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** S3, S4, A7

### Phạm vi

- `/health/live`.
- `/health/ready`.
- Build commit, version và environment.
- API request duration/error rate.
- Job count by status.
- Stage duration.
- Redis consumer lag.
- Provider latency/error codes.
- Webhook attempt age.
- Reconciliation corrections.

### Acceptance criteria

- [ ] Health endpoint không lộ secret hoặc hostname nhạy cảm.
- [ ] Worker có readiness hoặc heartbeat có ý nghĩa.
- [ ] Alert có owner và runbook link.
- [ ] Metrics phân biệt Beta và Production.

---

# 10. Beta rollout tasks

## B1 Chuẩn bị và backup Beta

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** C4, C5, C6

### Checklist

- [ ] Backup Admin Beta DB.
- [ ] Backup Scoring Beta DB.
- [ ] Ghi image digest hiện tại của từng container.
- [ ] Export migration list và aggregate job counts.
- [ ] Xác minh rollback image còn tồn tại.
- [ ] Tạo Admin BFF credential Beta.
- [ ] Tạo webhook secret Beta.
- [ ] Không dùng Production secret trên Beta.
- [ ] Xác nhận maintenance/verification window.

## B2 Deploy split Scoring API và Worker lên Beta

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** B1

### Trình tự

1. Deploy Scoring API image mới, giữ Worker cũ.
2. Smoke live, ready, create, status và result.
3. Deploy Worker image mới dùng audio base.
4. Kiểm tra queue consumption, media preparation và provider calls.
5. Restart API và Worker riêng để chứng minh lifecycle độc lập.

### Rollback

- API lỗi: quay API digest cũ, không đổi Worker.
- Worker lỗi: dừng Worker mới và resume Worker digest cũ.
- Không rollback DB nếu migration chỉ expand và image cũ còn tương thích.

## B3 Deploy Admin BFF lên Beta với feature flag tắt

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** B2

### Checklist

- [ ] Deploy Admin API nhưng `standalone` mode chưa bật toàn hệ thống.
- [ ] Health Admin không phụ thuộc Scoring availability.
- [ ] Service credential smoke pass.
- [ ] BFF permission tests pass.
- [ ] Internal account có thể bật standalone mode.
- [ ] Legacy path vẫn là rollback path có thời hạn.

## B4 Cutover Admin Beta sang standalone Scoring

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** B3

### Trình tự

1. Chuyển job list/detail read paths.
2. So sánh status/result với Scoring canonical data.
3. Chuyển retry/rescore/reconcile/cancel operations.
4. Chạy regression jobs Speaking và Writing.
5. Chuyển create job sang standalone Scoring.
6. Theo dõi webhook inbox và reconciliation.

### Acceptance criteria

- [ ] Job mới chỉ được tạo trong Scoring DB.
- [ ] Admin projection cập nhật terminal state.
- [ ] Không duplicate job khi retry request.
- [ ] Admin UI không cần đọc legacy Scoring tables.

## B5 Tắt legacy Scoring runtime trên Admin Beta

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** B4

### Checklist

- [ ] Tắt Admin legacy Scoring workers.
- [ ] Tắt public Scoring integration routes trên Admin.
- [ ] Xác nhận không có active job chỉ tồn tại trong legacy queue.
- [ ] Giữ legacy tables và backup ở trạng thái read-only.
- [ ] Theo dõi logs để phát hiện code path còn truy cập legacy tables.

## B6 Beta regression soak và release review

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** B5

### Beta smoke matrix

- Admin login, RBAC và Scoring screens.
- Exam catalog, candidate, attempt, autosave, submit và result.
- Scoring auth, idempotency, tenant isolation và result.
- Source, media, STT, validation, run, scoring, completion và webhook.
- Provider timeout, quota depleted, DNS failure, invalid audio và retry.
- API and Worker independent rollback.

### Điều kiện `BETA_VERIFIED`

- [ ] Không có job mới chạy trong Admin DB.
- [ ] Không mất hoặc xử lý trùng job sau restart.
- [ ] Regression parity đạt 100% trên tập đã duyệt.
- [ ] Webhook và reconciliation có evidence.
- [ ] Không có cross-database connection.
- [ ] Rollback đã được thử.
- [ ] Soak đủ thời gian được phê duyệt.
- [ ] Có immutable image digest và exact commit SHA.

---

# 11. Production rollout tasks

## P1 Production readiness review

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** B6

### Mục tiêu

Xác nhận mọi technical gate đã pass và chỉ còn Production authorization.

### Checklist

- [ ] Beta state là `BETA_VERIFIED`.
- [ ] Production change window được xác nhận.
- [ ] Không có kỳ thi hoặc batch quan trọng ngoài rollback plan.
- [ ] Backup và restore procedure sẵn sàng.
- [ ] Image digest khớp Beta Verified digest.
- [ ] Migration compatibility analysis pass.
- [ ] Monitoring và alert owner sẵn sàng.
- [ ] Rollback digest và command được ghi rõ.
- [ ] Có phê duyệt Production ngay trước deploy.

## P2 Tách Scoring API và Worker trên Production

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** P1

### Trình tự

1. Promote Scoring API digest đã chạy Beta.
2. Smoke API trong khi Worker cũ tiếp tục chạy.
3. Promote Worker digest.
4. Theo dõi queue lag, active jobs và provider error rate.
5. Xác minh API và Worker rollback độc lập.

### Rollback

- Quay đúng component bị lỗi về digest cũ.
- Không restart component còn lại nếu không cần.

## P3 Promote migration và completion fixes

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** P2

### Checklist

- [ ] Backup Scoring Production DB.
- [ ] Chạy one-shot migrate container.
- [ ] Kiểm tra `schema_migrations`.
- [ ] Deploy Worker hỗ trợ plan-driven completion.
- [ ] Chạy bounded reconciliation theo phạm vi đã duyệt.
- [ ] Theo dõi terminal job count và webhook deliveries.
- [ ] Không chạy destructive migration.

## P4 Cutover Admin Production sang BFF

**Ưu tiên:** P0  
**Trạng thái:** TODO  
**Phụ thuộc:** P3

### Staged rollout

| Stage | Traffic | Điều kiện chuyển tiếp |
| --- | --- | --- |
| P4.1 | Feature flag tắt | Admin health và service credential smoke pass |
| P4.2 | Internal account read-only | List/detail/status parity đạt |
| P4.3 | Internal mutation | Retry/rescore/reconcile có audit và idempotency |
| P4.4 | Tất cả Admin users | Error rate và latency trong threshold |
| P4.5 | Create job standalone | Không job mới xuất hiện trong legacy tables |

### Rollback

1. Tắt feature flag standalone.
2. Quay Admin API image nếu cần.
3. Không xóa hoặc tạo lại Scoring jobs đã được chấp nhận.
4. Reconcile projection sau rollback.

## P5 Khóa legacy write paths và lập cleanup backlog

**Ưu tiên:** P1  
**Trạng thái:** TODO  
**Phụ thuộc:** P4

### Mục tiêu

Ngăn hệ thống quay lại dual-write nhưng chưa thực hiện destructive cleanup.

### Checklist

- [ ] Legacy Scoring workers không còn chạy.
- [ ] Legacy Scoring routes không public.
- [ ] Legacy tables không nhận write mới.
- [ ] Backup và archive location được ghi lại.
- [ ] Monitoring phát hiện truy cập legacy table bất thường.
- [ ] Tạo backlog riêng cho drop tables và remove code.
- [ ] Destructive cleanup chưa chạy nếu chưa có phê duyệt riêng.

---

# 12. Checklist release evidence

Mỗi Beta hoặc Production release phải lưu:

- [ ] Repository và exact commit SHA.
- [ ] CI run URL hoặc ID.
- [ ] Image tag và image digest.
- [ ] Migration result.
- [ ] Health check result.
- [ ] Smoke test result.
- [ ] Regression scope.
- [ ] Monitoring snapshot không chứa PII.
- [ ] Rollback image digest.
- [ ] Người phê duyệt và thời điểm phê duyệt.
- [ ] Residual risks và deferred work.

# 13. Control matrix tối thiểu

| Control | Áp dụng | Evidence mong đợi |
| --- | --- | --- |
| IIG-SDLC-01 Scope và acceptance | Mọi task | Task description và acceptance criteria |
| IIG-SDLC-02 Quality attributes | Mọi epic | Reliability, performance, security thresholds |
| IIG-SDLC-03 Architecture và data flow | Mọi epic | Architecture docs và ownership inventory |
| IIG-SDLC-04 Threat và abuse cases | API, auth, webhook, media | Threat note và mitigations |
| IIG-SDLC-05 Secure implementation | Mọi code task | Reviewed diff và coding standards |
| IIG-SDLC-06 Secret PII evidence protection | Mọi environment | Logging và evidence review |
| IIG-SDLC-07 Supply chain | Dependency, Docker, workflow | Lockfile, SCA, image provenance |
| IIG-SDLC-08 Verification | Mọi code task | Targeted và broader tests |
| IIG-SDLC-09 Security verification | Exposed/auth surfaces | SAST, secret scan, negative tests |
| IIG-SDLC-10 Durable state | Migration, outbox, inbox | Migration và transaction tests |
| IIG-SDLC-11 Independent review | Mọi PR | Reviewer decision và exact-head CI |
| IIG-SDLC-12 Immutable artifact | Beta và Production | Image digest và commit SHA |
| IIG-SDLC-13 Release rollback | Beta và Production | Authorization, health, smoke, rollback target |
| IIG-SDLC-14 Detection response | Runtime changes | Metrics, alerts và runbook |
| IIG-SDLC-15 Sanitized evidence | Mọi gate | Evidence pack không chứa secret hoặc PII |

# 14. Quy trình cập nhật file này

1. Khi bắt đầu task, đổi trạng thái ở bảng tổng và section task thành `IN_PROGRESS`.
2. Ghi owner, branch/worktree và ngày bắt đầu ngay dưới metadata task.
3. Không đánh dấu `DONE` khi chỉ hoàn thành code; acceptance, tests, review và evidence phải đủ.
4. Nếu task bị block, ghi blocker cụ thể, người cần xử lý và điều kiện unblock.
5. Khi scope thay đổi, cập nhật dependency graph và affected tasks trước khi code tiếp.
6. Production tasks chỉ chuyển sang `IN_PROGRESS` sau khi có explicit Production authorization.

