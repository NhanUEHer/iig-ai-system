
## CI/CD v2 (2026-11-15)

| Stage | Trigger | What runs |
|---|---|---|
| PR CI (`ci.yml`) | Pull request | `changes` (`scripts/ci/changed-components.mjs`) → only the affected checks: backend tests, admin-web lint+build, exam-web build; image build check only when Dockerfile/dependency inputs change (arm64 native; all weekly). `ci-summary` is the required check. |
| Beta (`release.yml`) | Push to `develop` | Diff vs the last successful Beta release → build ONLY changed images (`linux/arm64`, native runner, `:beta-<sha>`) → deploy ONLY those services (gateway `deploy beta <tag> <version> <commit> <components>`). No test re-run. |
| Production (`promote.yml`) | Manual + `production` approval | Reads Beta/Production digests (`manifest` gateway command), retags Beta digests `:prod-<commit>` + `:v<version>` (no rebuild), deploys only components whose digest differs, tags `v<version>`, fast-forwards `main`, records a GitHub Release manifest. |
| Rollback (`rollback.yml`) | Manual: release tag | Re-points `:prod-<commit>` to the recorded digests and redeploys them. |

Web images read their release identity at runtime (`/runtime-config.js` written by `deploy/docker/40-runtime-config.sh`), so the same image runs on Beta and Production. Host gateway: install `deploy/docker/deploy-ssh-gateway.sh` as `/usr/local/sbin/iig-admin-deploy-gateway` (backward compatible).

## Secure Lectures release requirements (S10)

- PR CI must run `npm run check:syntax`, `npm test`, `npm run lint --prefix frontend` and `cd frontend && npx vite build`. The E2E suite uses `node --test`, Express HTTP injection, independent cookie jars and in-memory session/ticket/blob/rate-limit stores; no database is required. PostgreSQL fallback coverage is opt-in through `SECURE_LECTURES_TEST_DATABASE_URL`.
- The deploy compose pipeline runs `migrate` (`node scripts/run-migrations.js`) before `admin-api`; `admin-api` depends on `service_completed_successfully`. Verify migration `160_secure_lectures.sql` appears in `schema_migrations` before opening traffic.
- Both GitHub environments must provision a non-empty `SECURE_LECTURES_PUBLIC_BASE_URL`: `https://admin-beta.iigvn.site` on Beta and the approved public HTTPS origin on Production. A request-derived base URL is local-development fallback only.
- A multi-instance API deployment must provision the same healthy `REDIS_URL` to every instance. Memory fallback is not a distributed store and is forbidden for multi-instance Secure Lectures.
- The app does not currently enable Express `trust proxy`. The only public entry point must be a trusted Nginx/proxy that overwrites `Host`, `X-Forwarded-Host=$host`, `X-Forwarded-Proto=$scheme` and `X-Forwarded-For=$proxy_add_x_forwarded_for`. Do not forward client-supplied `X-Forwarded-Proto` unchanged. Until a constrained `trust proxy` policy is implemented, IP rate-limit keys see the immediate proxy IP; test and record this behavior on Beta.
- Preserve `Sec-Fetch-Site`; the public same-origin guard accepts `same-origin`/`none` and rejects browser cross-site values before CORS. DevTools detection is audit-only (`devtools_suspected`) and must not hide or lock content.
