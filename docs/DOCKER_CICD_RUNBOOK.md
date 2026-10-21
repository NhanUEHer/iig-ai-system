# IIG Admin Docker and CI/CD Runbook

## Target topology

The release contains three immutable ARM64 images built from one commit:

- `iig-admin-api`: shared Express API for Admin and Exam Web.
- `iig-admin-admin-web`: Admin React application served by Nginx.
- `iig-admin-exam-web`: candidate Exam React application served by Nginx.

During the first migration phase, PostgreSQL, Redis, media and model files remain
on the VPS. Containers reach PostgreSQL and Redis through
`host.docker.internal`; persistent media/model directories are mounted from
`/opt/ai-scoring`. Database containerization is a separate migration.

## Release path

1. Feature branches merge into `develop` after CI.
2. A `develop` push builds `beta-<full-sha>` images and deploys Beta.
3. Beta health and smoke tests must pass.
4. `develop` is promoted to `main` through a reviewed pull request.
5. A `main` push builds `prod-<full-sha>` images. The protected GitHub
   `production` environment must require approval before deployment.
6. Deployment pulls immutable images, starts all services, waits for Compose
   health, and verifies API version/commit plus both web health endpoints.

The VPS never builds source. A failed health command fails the deployment job;
the prior tag remains recorded in `.env.rollback.<timestamp>` for rollback.

## Required GitHub configuration

Create GitHub environments `beta` and `production`. Require manual reviewers on
`production`. Add these secrets to both environments:

- `VPS_HOST`: deployment host name or address.
- `VPS_SSH_PRIVATE_KEY`: restricted deployment SSH key.
- `VPS_KNOWN_HOSTS`: pinned `known_hosts` entry generated out of band.

Use a dedicated SSH key whose public key is constrained with
`deploy/docker/deploy-ssh-gateway.sh` as an `authorized_keys` forced command.
Do not upload a general-purpose root or operator private key to GitHub.

GHCR publishing uses `GITHUB_TOKEN`. The packages must be readable by the VPS;
authenticate Docker on the VPS once with a read-only package token.

## VPS bootstrap

Create `/opt/iig-admin/beta` and `/opt/iig-admin/prod`. Each directory requires:

- `docker-compose.yml` from this repository.
- `.env`, based on `deploy/.env.deploy.example`.
- `.env.container`, containing runtime configuration and secrets.

Use separate loopback ports per environment. Recommended defaults:

| Environment | API | Admin Web | Exam Web |
| --- | ---: | ---: | ---: |
| Beta | 3211 | 3212 | 3213 |
| Production | 3221 | 3222 | 3223 |

Use separate mutable media roots. Beta should use
`MEDIA_ROOT=/opt/iig-admin-data/beta`; Production may initially use the existing
`MEDIA_ROOT=/opt/ai-scoring`. Both can use the existing read-only model runtime
with `MODEL_ROOT=/opt/ai-scoring`. Never point Beta at Production media.

For phase one, convert only host-local endpoints in the copied runtime env:

- PostgreSQL host `127.0.0.1` -> `host.docker.internal`.
- Redis host `127.0.0.1` -> `host.docker.internal`.
- Application `PORT` is controlled by Compose and should not be copied.

Do not print or commit either populated environment file.

## Beta cutover

1. Keep PM2 and host Nginx online.
2. Deploy containers on Beta loopback ports.
3. Verify `/health`, Admin login, Exam catalog/start, API authentication,
   PostgreSQL, Redis, R2, media access, upload and one non-destructive exam flow.
4. Route Beta domains to ports 3212/3213 only after smoke tests pass.
5. Preserve the old upstream for immediate routing rollback.

## Production cutover

1. Confirm the exact Production SHA passed Beta.
2. Take and verify PostgreSQL/media backups.
3. Deploy Production containers on ports 3221/3222/3223.
4. Run the same smoke suite against loopback ports.
5. Switch production domain upstreams to the two web containers.
6. Observe logs and health before stopping PM2 and host Nginx port 3100.
7. Retain the legacy immutable release until the observation window closes.

## Rollback

Restore the previous `.env.rollback.<timestamp>` as `.env`, then run:

```bash
docker compose pull
docker compose up -d --remove-orphans --wait --wait-timeout 180
```

If the container path itself is unhealthy during initial migration, restore the
outer Nginx upstream to host ports 3100/5005. Database rollback is not implied by
an application rollback; migrations must remain backward compatible.

## Storage prerequisite

Do not deploy until the VPS has at least 5 GB available. At review time the root
filesystem had only about 258 MB free, while Docker reported substantial unused
image data. Remove only images verified as unused by active Compose projects and
retain current and rollback application images.
