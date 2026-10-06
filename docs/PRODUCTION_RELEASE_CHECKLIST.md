# Production release checklist

Applies to AI Scoring Admin backend, admin frontend and PostgreSQL migrations.

## 1. Release inputs

- Use Node.js 22.13 or newer.
- Confirm root and frontend versions are identical.
- Release from an reviewed commit/tag whenever possible.
- Do not package `.env`, database dumps, runtime media, model weights or local credentials.
- Generate the artifact with `npm run release:package`.
- Verify the archive against its adjacent `.sha256` file.

## 2. Required production configuration

Create the server `.env` from `.env.production.example`. At minimum verify:

- `NODE_ENV=production`
- `APP_ENV=production`
- `APP_URL` is the public HTTPS URL.
- `DATABASE_URL` points to the production PostgreSQL instance.
- `JWT_SECRET` is random and contains at least 32 characters.
- `PORT`, SMTP, IIG integration and Dify values are correct for the environment.
- R2 credentials and `AUDIO_STORAGE_MODE=r2` are configured when production media uses R2.
- Bootstrap administrator credentials are blank after the first administrator exists.

Never copy development `.env` or `.env.r2.local` to production.

## 3. Backup before migration

1. Stop write-heavy maintenance jobs or schedule a maintenance window.
2. Back up the application database with `scripts/backup-production.sh` or an equivalent verified `pg_dump` process.
3. Verify the backup can be listed/read and record its backup ID.
4. Preserve the previous immutable application release and current symlink target.

Do not continue without a usable database backup and an application rollback target.

## 4. Install release

1. Extract the archive into a new immutable release directory.
2. Link the existing production `.env` into the release directory.
3. Link/provision runtime model directories separately when those features are enabled.
4. Link persistent media directories or configure R2; do not overwrite existing media.
5. Run `npm ci --omit=dev` in the release root.
6. Confirm `frontend/dist/index.html` and `frontend/dist/events/index.html` exist.
7. Confirm `/events/<event-id>` and all nested attempt routes fall back to `frontend/dist/events/index.html`.
8. Run `npm run check:syntax`.

## 5. Database migration

Migrations are forward-only, tracked in `schema_migrations` and executed in individual transactions.

1. Run `NODE_ENV=production APP_ENV=production npm run db:migrate`.
2. Confirm the latest applied migration is `099_exam_candidate_management.sql` or newer.
3. Confirm no migration is left partially applied.
4. Do not manually edit `schema_migrations`.

The server also runs pending migrations during startup, but running the explicit command first makes migration failure visible before traffic is switched.

## 6. Activate application

1. Point the current release symlink to the new immutable release.
2. Start/reload the backend with `NODE_ENV=production` and `APP_ENV=production`.
3. Validate and reload Nginx using the supplied configuration.
4. Keep only the required number of old releases after verification completes.

## 7. Smoke verification

Run the repeatable read-only smoke suite after traffic has switched:

```bash
EXPECTED_VERSION=1.1.72 \
PROD_BASE_URL=https://admin.iigvn.site \
npm run test:prod
```

To include authenticated list API checks, provide a short-lived administrator
access token through `PROD_ACCESS_TOKEN`. The suite never creates, updates or
deletes production records.

- `GET /health` returns HTTP 200, `status: ok`, the expected version, commit and production environment.
- Login works and permissions are loaded.
- Question groups list/create/update works.
- Question creation starts as Draft; only complete questions can become Active.
- Question media upload and deletion works.
- Exam list/create/edit, part/question ordering and activation works.
- Deleting an exam used by an event returns a readable conflict message.
- Exam-event list/create/update works; school and active-exam selectors load.
- Event avatar/banner upload, replacement and removal works.
- Success toast is green and error toast is red with readable text.
- Browser refresh works on deep admin routes.
- Public LR registration, introduction, attempt and result deep links load under `/events/*`.
- Autosave survives refresh; offline changes retry after reconnection.
- Expiry auto-submits once and repeated submit requests return the same result.
- Application and Nginx logs contain no new 5xx errors.

## 8. Rollback

If startup, migration or smoke verification fails:

1. Stop the new application process.
2. Point the current symlink back to the previous release.
3. Restart the previous release and verify `/health`.
4. If a migration caused incompatible data changes, restore the verified database backup. Do not attempt ad-hoc reverse SQL in production.
5. Record the failed release ID, logs and migration state before retrying.

## 9. Release evidence

Retain:

- Release archive and SHA-256 file.
- `RELEASE-MANIFEST.txt` and internal `SHA256SUMS`.
- Database backup ID.
- Migration output.
- Health response and smoke-test result.
- Deployment timestamp and operator.
