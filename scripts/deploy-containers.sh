#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:?DEPLOY_DIR is required}"
cd "$DEPLOY_DIR"
LOCK_DIR="$DEPLOY_DIR/.deploy.lock"
mkdir "$LOCK_DIR" 2>/dev/null || { echo "Another deployment is already running in $DEPLOY_DIR" >&2; exit 1; }

rollback_file=""
activated=false
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [ "$rc" -ne 0 ] && [ "$activated" = true ] && [ -n "$rollback_file" ] && [ -s "$rollback_file" ]; then
    echo "Health verification failed; restoring previous immutable release." >&2
    cp "$rollback_file" .env
    docker compose up -d --remove-orphans --wait --wait-timeout 180 || true
  fi
  rmdir "$LOCK_DIR" 2>/dev/null || true
  exit "$rc"
}
trap cleanup EXIT INT TERM

for file in docker-compose.yml .env .env.container; do
  test -s "$file" || { echo "Missing required deployment file: $DEPLOY_DIR/$file" >&2; exit 1; }
done

previous_tag="$(sed -n 's/^IMAGE_TAG=//p' .env | head -1)"
next_tag="${IMAGE_TAG:?IMAGE_TAG is required}"
next_version="${APP_VERSION:?APP_VERSION is required}"
next_commit="${APP_COMMIT:?APP_COMMIT is required}"

rollback_file=".env.rollback.$(date -u +%Y%m%dT%H%M%SZ)"
cp .env "$rollback_file"

update_env() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '%s=%s\n' "$key" "$value" >> .env
  fi
}

update_env IMAGE_TAG "$next_tag"
update_env APP_VERSION "$next_version"
update_env APP_COMMIT "$next_commit"
activated=true

docker compose pull
docker compose up -d --remove-orphans --wait --wait-timeout 180

api_port="$(sed -n 's/^API_PORT=//p' .env | head -1)"
admin_port="$(sed -n 's/^ADMIN_PORT=//p' .env | head -1)"
exam_port="$(sed -n 's/^EXAM_PORT=//p' .env | head -1)"

api_health="$(curl -fsS "http://127.0.0.1:${api_port}/health")"
HEALTH="$api_health" EXPECTED_VERSION="$next_version" EXPECTED_COMMIT="$next_commit" node -e '
  const value = JSON.parse(process.env.HEALTH);
  if (value.status !== "ok" || value.build?.version !== process.env.EXPECTED_VERSION || value.build?.commit !== process.env.EXPECTED_COMMIT) process.exit(1);
'
curl -fsS "http://127.0.0.1:${admin_port}/health" >/dev/null
curl -fsS "http://127.0.0.1:${exam_port}/health" >/dev/null

printf 'Deployment healthy: %s (previous: %s)\n' "$next_tag" "${previous_tag:-none}"
activated=false
