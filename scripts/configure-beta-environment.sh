#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/iig-admin/beta}"
RUNTIME_ENV="$DEPLOY_DIR/.env.container"
BOOTSTRAP_ENV="$DEPLOY_DIR/bootstrap-admin.env"
NGINX_SOURCE="$DEPLOY_DIR/nginx-beta.conf"
NGINX_TARGET="/etc/nginx/conf.d/iig-admin-beta.conf"

test "${DEPLOY_ENV:-beta}" = beta || { echo "This bootstrap is Beta-only." >&2; exit 1; }
test -s "$RUNTIME_ENV" || { echo "Missing runtime environment: $RUNTIME_ENV" >&2; exit 1; }
test -s "$NGINX_SOURCE" || { echo "Missing Beta Nginx definition: $NGINX_SOURCE" >&2; exit 1; }

backup="$RUNTIME_ENV.bootstrap.$(date -u +%Y%m%dT%H%M%SZ)"
cp "$RUNTIME_ENV" "$backup"

read_env() {
  sed -n "s/^$1=//p" "$RUNTIME_ENV" | tail -1
}

upsert_env() {
  key="$1"
  value="$2"
  updated="$(mktemp "$DEPLOY_DIR/.env.container.XXXXXX")"
  grep -v "^${key}=" "$RUNTIME_ENV" > "$updated" || true
  printf '%s=%s\n' "$key" "$value" >> "$updated"
  chmod 600 "$updated"
  mv "$updated" "$RUNTIME_ENV"
}

if [ -e "$BOOTSTRAP_ENV" ]; then
  chmod 600 "$BOOTSTRAP_ENV"
fi

postgres_password="$(read_env POSTGRES_PASSWORD)"
if [ -z "$postgres_password" ] || [ "$postgres_password" = CHANGE_ME ]; then
  postgres_password="$(openssl rand -hex 32)"
fi

upsert_env POSTGRES_DB iig_admin_beta
upsert_env POSTGRES_USER iig_admin_beta
upsert_env POSTGRES_PASSWORD "$postgres_password"
upsert_env DATABASE_URL "postgresql://iig_admin_beta:${postgres_password}@postgres:5432/iig_admin_beta"
upsert_env REDIS_URL redis://redis:6379/0
upsert_env APP_URL https://admin-beta.iigvn.site
upsert_env PUBLIC_URL https://admin-beta.iigvn.site

chmod 600 "$RUNTIME_ENV" "$backup"
mkdir -p /opt/iig-admin-data/beta/public
docker network inspect iig-admin-beta >/dev/null 2>&1 || docker network create iig-admin-beta >/dev/null

if command -v nginx >/dev/null 2>&1; then
  install -m 0644 "$NGINX_SOURCE" "$NGINX_TARGET"
  nginx -t
  systemctl reload nginx
else
  echo "Host Nginx is not installed; skipped host routing configuration." >&2
fi

echo "Beta runtime configured with isolated PostgreSQL and separate Admin/Exam domains."
