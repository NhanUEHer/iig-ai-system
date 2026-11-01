# IIG Admin Docker and CI/CD Runbook

## Target topology

The release contains three immutable ARM64 images built from one commit:

- `iig-admin-api`: shared Express API for Admin and Exam Web.
- `iig-admin-admin-web`: Admin React application served by Nginx.
- `iig-admin-exam-web`: candidate Exam React application served by Nginx.

Production PostgreSQL, media and model files remain on the VPS. Beta uses its
own PostgreSQL container and named volume (`iig-admin-beta-postgres-data`) plus
its own unpublished Redis container. Persistent Beta media is isolated under
`/opt/iig-admin-data/beta`; model files remain read-only mounts from
`/opt/ai-scoring`.

## Release path

1. Feature branches merge into `develop` after CI.
2. A `develop` push builds `beta-<full-sha>` images and deploys Beta.
3. Beta health and smoke tests must pass.
4. `develop` is promoted to `main` through a reviewed pull request.
5. A `main` push builds `prod-<full-sha>` images. The protected GitHub
   `production` environment must require approval before deployment.
6. Deployment pulls immutable images, starts all services, waits for Compose
   health, and verifies API version/commit plus both web health endpoints.

The VPS never builds source. Compose runs the append-only migration service to
successful completion before starting the API. A failed migration or health
command fails the deployment job;
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

Beta additionally receives `docker-compose.beta.yml`, `nginx-beta.conf` and
`configure-beta-environment.sh`. The bootstrap is idempotent: it preserves the
generated PostgreSQL password, points only Beta at the `postgres` service, and
never modifies the Production runtime environment.

Use separate loopback ports per environment. Recommended defaults:

| Environment | API | Admin Web | Exam Web |
| --- | ---: | ---: | ---: |
| Beta | 3211 | 3212 | 3213 |
| Production | 3221 | 3222 | 3223 |

Reserve distinct Docker subnets as well: `172.26.0.0/24` for Beta and
`172.27.0.0/24` for Production. PostgreSQL must listen only on loopback and the
Docker host gateway (`172.17.0.1`), while `pg_hba.conf` permits only these two
application subnets with password authentication. Never restore a public
`0.0.0.0/0` PostgreSQL rule.

Use separate mutable media roots. Beta should use
`MEDIA_ROOT=/opt/iig-admin-data/beta`; Production may initially use the existing
`MEDIA_ROOT=/opt/ai-scoring`. Both can use the existing read-only model runtime
with `MODEL_ROOT=/opt/ai-scoring`. Never point Beta at Production media.

For Production, convert only host-local endpoints in the copied runtime env:

- PostgreSQL host `127.0.0.1` -> `host.docker.internal`.
- Redis URL -> `redis://redis:6379/0`; Redis has no published host port.
- Application `PORT` is controlled by Compose and should not be copied.

For Beta, the bootstrap configures:

- `DATABASE_URL` to the isolated `postgres` service.
- `REDIS_URL=redis://redis:6379/0`.
- `APP_URL` and `PUBLIC_URL` to `https://admin-beta.iigvn.site`.
- the first administrator from `BOOTSTRAP_ADMIN_EMAIL` and
  `BOOTSTRAP_ADMIN_PASSWORD` when the isolated database has no users.
- `admin-beta.iigvn.site` -> Admin Web port `3212`.
- `exam-beta.iigvn.site` -> Exam Web port `3213`.

The migration service creates the Beta schema through append-only migrations.
No Production data is copied into Beta by this process.
Set the Beta bootstrap administrator values in `.env.container` before the
first deployment. The bootstrap is idempotent and does not create another user
after the database contains an account.

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
