
## CI/CD v2 (2026-11-15)

| Stage | Trigger | What runs |
|---|---|---|
| PR CI (`ci.yml`) | Pull request | `changes` (`scripts/ci/changed-components.mjs`) → only the affected checks: backend tests, admin-web lint+build, exam-web build; image build check only when Dockerfile/dependency inputs change (arm64 native; all weekly). `ci-summary` is the required check. |
| Beta (`release.yml`) | Push to `develop` | Diff vs the last successful Beta release → build ONLY changed images (`linux/arm64`, native runner, `:beta-<sha>`) → deploy ONLY those services (gateway `deploy beta <tag> <version> <commit> <components>`). No test re-run. |
| Production (`promote.yml`) | Manual + `production` approval | Reads Beta/Production digests (`manifest` gateway command), retags Beta digests `:prod-<commit>` + `:v<version>` (no rebuild), deploys only components whose digest differs, tags `v<version>`, fast-forwards `main`, records a GitHub Release manifest. |
| Rollback (`rollback.yml`) | Manual: release tag | Re-points `:prod-<commit>` to the recorded digests and redeploys them. |

Web images read their release identity at runtime (`/runtime-config.js` written by `deploy/docker/40-runtime-config.sh`), so the same image runs on Beta and Production. Host gateway: install `deploy/docker/deploy-ssh-gateway.sh` as `/usr/local/sbin/iig-admin-deploy-gateway` (backward compatible).
