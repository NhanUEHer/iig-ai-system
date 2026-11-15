# IIG AI System

Internal Digital Product Department workspace. This repository contains the AI scoring administration application and content tools, including Audio Studio.

> Start here when using an AI coding assistant: read this file, then `CODING_STANDARDS.md`.

## Quick start

Requirements:

- Node.js and npm
- PostgreSQL
- FFmpeg and FFprobe

```bash
cp .env.example .env
npm install
npm --prefix frontend install
npm start
npm --prefix frontend run dev
```

Backend defaults to the configured `PORT`; Vite proxies API and generated media requests to `http://localhost:5005` unless `VITE_API_PROXY_TARGET` is set.

Verification:

```bash
npm run check
```

### Shared AI Scoring Admin API contract

`contracts/ai-scoring-admin-api-v1.json` is the shared, machine-readable source
of truth for the Admin BFF ↔ Scoring API boundary. An identical copy is kept in
the Scoring repository so the systems can build independently. Admin CI checks
frontend calls against this copy, while Scoring CI compares endpoints marked
`implemented` with its NestJS controllers. A mismatch must fail CI, and contract
changes must update both copies in the same delivery.

This runs backend syntax checks and tests, frontend lint, and the production frontend build.

## Application structure

```text
frontend/src/
  App.jsx                                  route and permission guard
  components/layout/ApplicationSidebar.jsx permission-aware navigation

src/
  app.js                                   Express mount and static media paths
  database/migrations/

public/
```

## Báo cáo KPI

Route: `/reports/kpi`

Module báo cáo Phase 1 cho phép tài khoản có `reports.upload` chọn kỳ, upload file `.xlsx`, `.xlsm` hoặc `.xls`, xem cảnh báo/preview và xác nhận đồng bộ. Backend đọc KPI từ `98_DATA_EXPORT`, dữ liệu chi tiết từ 6 sheet nghiệp vụ, sau đó publish toàn bộ kỳ trong một PostgreSQL transaction. Dashboard chỉ đọc version đã publish.

Permissions:

- `reports.view`: xem dashboard và lịch sử đồng bộ.
- `reports.upload`: kiểm tra và commit file Excel.
- `reports.manage`: quyền quản trị kỳ/cấu hình dành cho các bước tiếp theo.

API prefix: `/api/reports` với các endpoint `bootstrap`, `dashboard`, `imports`, `imports/inspect` và `imports/:id/commit`.

## Audio Studio (removed)

The Local TTS / voice-cloning feature (Audio Studio) was removed on 2026-11-15. Its historical migrations (003, 007, 008, 009) are kept so the migration ledger stays valid; the `local_tts_history` / `local_voice_clones` tables are no longer used.

## Environment variables

Core project variables are documented in `.env.example`.

Never commit `.env`, generated media, credentials, or user recordings unless an explicit repository policy is added for them.

### Environment and version identity

- Local Vite development defaults to `Dev`; backend uses `APP_ENV=development` and the local `DATABASE_URL`.
- Production builds inject `Production`, the root `package.json` version, and the current short Git commit into the frontend bundle.
- The sidebar displays the environment and version. Backend `/health` returns the same identity under `build`.
- Production must set `NODE_ENV=production`, `APP_ENV=production`, `APP_VERSION`, `APP_COMMIT`, and a JWT secret of at least 32 characters.

## Production backup, data sync and deployment

- `scripts/backup-production.sh` creates a full PostgreSQL custom dump, a focused scoring-data dump, row counts, and a media archive in `.partial-*` directories. It publishes a backup only after manifests and SHA-256 checks pass, removes partial output on failure, and retains the three newest server backups.
- `scripts/sync-production-scoring-to-local.sh` first backs up the local database, exports production scoring rows as portable column inserts, then replaces the four local business tables inside one transaction.
- `deploy.sh` requires a clean, tagged `main` synchronized with `origin/main`, matching backend/frontend versions, Node.js 22.13.0 or newer, at least 2 GB free on production, and an exclusive remote deploy lock. `ALLOW_UNPUSHED_RELEASE=true` is an emergency-only override.
- Deployment excludes local override secrets (`.env*.local`) and the repository-root `tmp/` directory. Bank-statement source files must never be shipped from a developer workspace; production receives them only through authenticated import and stores them in R2 under `expense-statements/YYYY/MM/...`.
- Releases are immutable under `/opt/ai-scoring-releases/<deploy-id>`. Shared `.env`, generated media, model files, and Python environments remain under `/opt/ai-scoring`; `/opt/ai-scoring-current` points to the active release.
- Activation switches `/opt/ai-scoring-current`, restarts PM2, and verifies the exact production version and commit on port `5005`. A failed identity/health check automatically restores the previous release and restarts PM2.
- A new verified backup is the default. `PREVERIFIED_BACKUP_ID=<id>` reuses a checksum/manifest-backed backup; `SKIP_BACKUP=true` is an explicit emergency choice and prints a warning.
- The three newest immutable releases are retained for fast rollback. Nginx serves the SPA and generated media through `/opt/ai-scoring-current` on port `3100`.

Never put the Hetzner password in any repository file. Provide `VPS_PASSWORD` only in the process environment, or store it in macOS Keychain under service `ai-scoring-vps` and account `root@<VPS_IP>`; `deploy.sh` can read that item without printing the secret.

Development audio storage uses Cloudflare R2 when `AUDIO_STORAGE_MODE=r2`. PostgreSQL stores only an `r2:<object-key>` reference and metadata. The bucket layout mirrors production: `cleaned-audio/` for processed answers, `dialogues/` for generated audio, `question-bank/` for question assets, and `test/` for connectivity checks. Run `npm run audio:migrate-dev-r2` for a dry run and append `-- --apply` to upload existing local files, update their database references, and remove the migrated local copies.

Production bank-statement imports require R2 credentials even when audio storage is local. The R2 token must allow Put/Get/Head/Delete on the configured bucket. The application stores statement sources under `expense-statements/`; in production an R2 write failure rejects the import so a committed transaction can never lose its source statement.

## Database migrations

Migrations run automatically during backend startup through `src/database/migrate.js`. Each SQL filename is recorded in `schema_migrations` and applied once inside a transaction.

Never edit an already deployed migration to change production state. Add the next numbered migration instead.

## Safe extension checklist

When changing a module:

1. Preserve permission checks on both frontend and backend.
2. Keep API controllers thin; orchestration belongs in services.
3. Keep database queries parameterized.
4. Run `npm run check`.

## Related documentation

- `CODING_STANDARDS.md`: repository-wide architecture and coding rules.
- `db_architecture.md` and `detailed_db_schema.md`: broader database documentation.
