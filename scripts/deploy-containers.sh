#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:?DEPLOY_DIR is required}"
cd "$DEPLOY_DIR"
test -s .env || { echo "Missing required deployment file: $DEPLOY_DIR/.env" >&2; exit 1; }
deploy_env="${DEPLOY_ENV:-$(sed -n 's/^DEPLOY_ENV=//p' .env | head -1)}"
test "$deploy_env" = beta || test "$deploy_env" = production || { echo "Unsupported DEPLOY_ENV: ${deploy_env:-missing}" >&2; exit 1; }
compose_files=(-f docker-compose.yml)
if [ "$deploy_env" = beta ]; then
  compose_files+=(-f docker-compose.beta.yml)
fi

compose() {
  docker compose "${compose_files[@]}" "$@"
}
LOCK_DIR="$DEPLOY_DIR/.deploy.lock"
mkdir "$LOCK_DIR" 2>/dev/null || { echo "Another deployment is already running in $DEPLOY_DIR" >&2; exit 1; }

rollback_file=""
rollback_override=""
activated=false
cleanup() {
  rc=$?
  trap - EXIT INT TERM
  if [ "$rc" -ne 0 ] && [ "$activated" = true ] && [ -n "$rollback_file" ] && [ -s "$rollback_file" ]; then
    echo "Health verification failed; restoring previous immutable release." >&2
    cp "$rollback_file" .env
    rollback_override=".compose.rollback.$$.yml"
    {
      printf 'services:\n'
      printf '  admin-api:\n    image: %s\n' "$previous_admin_api_image"
      printf '  admin-web:\n    image: %s\n' "$previous_admin_web_image"
      printf '  exam-web:\n    image: %s\n' "$previous_exam_web_image"
    } > "$rollback_override"
    if docker compose "${compose_files[@]}" -f "$rollback_override" up \
      -d --no-deps --wait --wait-timeout 180 admin-api admin-web exam-web \
      && verify_service admin-api "$previous_admin_api_image" \
      && verify_service admin-web "$previous_admin_web_image" \
      && verify_service exam-web "$previous_exam_web_image"; then
      echo "Previous running images restored successfully." >&2
    else
      echo "CRITICAL: automatic restoration of the previous running images failed." >&2
    fi
  fi
  test -z "$rollback_override" || rm -f "$rollback_override"
  rmdir "$LOCK_DIR" 2>/dev/null || true
  exit "$rc"
}
trap cleanup EXIT INT TERM

for file in docker-compose.yml .env .env.container; do
  test -s "$file" || { echo "Missing required deployment file: $DEPLOY_DIR/$file" >&2; exit 1; }
done

read_runtime_env() {
  key="$1"
  sed -n "s/^${key}=//p" "$DEPLOY_DIR/.env.container" | tail -1
}

require_runtime_value() {
  key="$1"
  value="$(read_runtime_env "$key")"
  test -n "$value" && ! printf '%s' "$value" | grep -q '^CHANGE_ME' || {
    echo "Missing required isolated-service configuration: $key" >&2
    exit 1
  }
}

# One-time migration support: Production ran the API as compose service `api`
# before it was renamed to `admin-api`. Find that legacy container by labels.
legacy_api_container() {
  project="$(compose config --format json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).name||""))')"
  test -n "$project" || return 0
  docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=api" | head -1
}

running_image() {
  service="$1"
  container_id="$(compose ps -q "$service" 2>/dev/null || true)"
  if [ -z "$container_id" ] && [ "$service" = admin-api ]; then
    container_id="$(legacy_api_container)"
  fi
  test -n "$container_id" || {
    echo "Required service is not running before deployment: $service" >&2
    exit 1
  }
  running="$(docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null || true)"
  image="$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || true)"
  test "$running" = true && test -n "$image" || {
    echo "Could not capture the running image for $service" >&2
    exit 1
  }
  case "$image" in
    *[!A-Za-z0-9._/@:+-]*|'')
      echo "Refusing unsafe running image reference for $service" >&2
      exit 1
      ;;
  esac
  printf '%s\n' "$image"
}

verify_service() {
  service="$1"
  expected_image="$2"
  container_id="$(compose ps -q "$service" 2>/dev/null || true)"
  actual_image=""
  health=""
  if [ -n "$container_id" ]; then
    actual_image="$(docker inspect --format '{{.Config.Image}}' "$container_id" 2>/dev/null || true)"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
  fi
  if [ "$actual_image" != "$expected_image" ] || [ "$health" != healthy ]; then
    echo "Post-deploy verification failed for $service (image=$actual_image, expected=$expected_image, health=$health)" >&2
    return 1
  fi
}

if [ "$deploy_env" = beta ]; then
  test -s docker-compose.beta.yml || { echo "Missing Beta deployment override: $DEPLOY_DIR/docker-compose.beta.yml" >&2; exit 1; }
  test -s configure-beta-environment.sh || { echo "Missing Beta bootstrap: $DEPLOY_DIR/configure-beta-environment.sh" >&2; exit 1; }
  DEPLOY_ENV=beta DEPLOY_DIR="$DEPLOY_DIR" bash configure-beta-environment.sh
fi

# AI Scoring is deployed independently. Admin must be configured with the URL
# and matching service credential for the target environment before rollout.
require_runtime_value AI_SCORING_ADMIN_URL
require_runtime_value AI_SCORING_ADMIN_SERVICE_TOKEN
scoring_admin_url="$(read_runtime_env AI_SCORING_ADMIN_URL)"
scoring_health="$(curl -fsS "${scoring_admin_url%/}/health/ready")"
HEALTH="$scoring_health" node -e '
  const value = JSON.parse(process.env.HEALTH);
  if (value.status !== "ok" || value.database !== "ready") {
    console.error(`AI Scoring readiness check failed: status=${value.status ?? "missing"}, database=${value.database ?? "missing"}`);
    process.exit(1);
  }
'

# Capture what is actually running before changing tags. The gateway exports the
# new IMAGE_TAG, so restoring only .env would otherwise select the failed image.
previous_admin_api_image="$(running_image admin-api)"
previous_admin_web_image="$(running_image admin-web)"
previous_exam_web_image="$(running_image exam-web)"

previous_tag="$(sed -n 's/^IMAGE_TAG=//p' .env | head -1)"
next_tag="${IMAGE_TAG:?IMAGE_TAG is required}"
next_version="${APP_VERSION:?APP_VERSION is required}"
next_commit="${APP_COMMIT:?APP_COMMIT is required}"
# CI/CD v2: only the listed components move to next_tag; the others keep their image
# (and release identity), so unchanged containers are not recreated.
deploy_components="${DEPLOY_COMPONENTS:-admin-api,admin-web,exam-web}"
changed_services=()
IFS=',' read -r -a requested_components <<< "$deploy_components"
for component in "${requested_components[@]}"; do
  case "$component" in
    admin-api|admin-web|exam-web) changed_services+=("$component") ;;
    *) echo "Unknown component: $component" >&2; exit 1 ;;
  esac
done
test "${#changed_services[@]}" -gt 0 || { echo "No components to deploy" >&2; exit 1; }
component_changed() { case ",$deploy_components," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

rollback_file=".env.rollback.$(date -u +%Y%m%dT%H%M%SZ)"
cp .env "$rollback_file"

read_env() { sed -n "s/^$1=//p" .env | head -1; }
update_env() {
  key="$1"
  value="$2"
  temporary=".env.update.$$"
  awk -v key="$key" -v value="$value" '
    BEGIN { found = 0 }
    index($0, key "=") == 1 { print key "=" value; found = 1; next }
    { print }
    END { if (!found) print key "=" value }
  ' .env > "$temporary"
  mv "$temporary" .env
}
ensure_env() { [ -n "$(read_env "$1")" ] || update_env "$1" "$2"; }

# Pin every component to what it runs today before moving only the changed ones.
current_tag="${previous_tag:-$next_tag}"
current_version="$(read_env APP_VERSION)"; current_commit="$(read_env APP_COMMIT)"
ensure_env ADMIN_API_IMAGE_TAG "$current_tag"
ensure_env ADMIN_WEB_IMAGE_TAG "$current_tag"
ensure_env EXAM_WEB_IMAGE_TAG "$current_tag"
ensure_env ADMIN_API_APP_VERSION "${current_version:-$next_version}"
ensure_env ADMIN_API_APP_COMMIT "${current_commit:-$next_commit}"
ensure_env ADMIN_WEB_APP_VERSION "${current_version:-$next_version}"
ensure_env ADMIN_WEB_APP_COMMIT "${current_commit:-$next_commit}"

if component_changed admin-api; then
  update_env ADMIN_API_IMAGE_TAG "$next_tag"
  update_env ADMIN_API_APP_VERSION "$next_version"
  update_env ADMIN_API_APP_COMMIT "$next_commit"
fi
if component_changed admin-web; then
  update_env ADMIN_WEB_IMAGE_TAG "$next_tag"
  update_env ADMIN_WEB_APP_VERSION "$next_version"
  update_env ADMIN_WEB_APP_COMMIT "$next_commit"
fi
if component_changed exam-web; then update_env EXAM_WEB_IMAGE_TAG "$next_tag"; fi
if [ "${#changed_services[@]}" -eq 3 ]; then
  update_env IMAGE_TAG "$next_tag"; update_env APP_VERSION "$next_version"; update_env APP_COMMIT "$next_commit"
fi
activated=true

compose pull "${changed_services[@]}"
# The renamed service binds the same host port as the legacy `api` container;
# remove the legacy container right before activation (its image is captured above).
legacy_container="$(legacy_api_container)"
if [ -n "$legacy_container" ]; then
  echo "Removing legacy api container before activating admin-api" >&2
  docker rm -f "$legacy_container" >/dev/null
fi
compose up -d --remove-orphans --wait --wait-timeout 240 "${changed_services[@]}"

expected_images="$(compose config --format json)"
expected_image() {
  service="$1"
  COMPOSE_CONFIG="$expected_images" SERVICE="$service" node -e '
    const config = JSON.parse(process.env.COMPOSE_CONFIG);
    const image = config.services?.[process.env.SERVICE]?.image;
    if (!image) process.exit(1);
    process.stdout.write(image);
  '
}

for service in admin-api admin-web exam-web; do
  verify_service "$service" "$(expected_image "$service")"
done

if [ "$deploy_env" = beta ] && [ -s bootstrap-admin.env ]; then
  bootstrap_rc=0
  compose --profile bootstrap run --rm bootstrap-admin || bootstrap_rc=$?
  rm -f bootstrap-admin.env
  test "$bootstrap_rc" -eq 0
fi

api_port="$(sed -n 's/^API_PORT=//p' .env | head -1)"
admin_port="$(sed -n 's/^ADMIN_PORT=//p' .env | head -1)"
exam_port="$(sed -n 's/^EXAM_PORT=//p' .env | head -1)"

api_health="$(curl -fsS "http://127.0.0.1:${api_port}/health/ready")"
HEALTH="$api_health" EXPECTED_VERSION="$(read_env ADMIN_API_APP_VERSION)" EXPECTED_COMMIT="$(read_env ADMIN_API_APP_COMMIT)" node -e '
  const value = JSON.parse(process.env.HEALTH);
  if (value.status !== "ready" || value.build?.version !== process.env.EXPECTED_VERSION || value.build?.commit !== process.env.EXPECTED_COMMIT) process.exit(1);
'
curl -fsS "http://127.0.0.1:${admin_port}/health" >/dev/null
curl -fsS "http://127.0.0.1:${exam_port}/health" >/dev/null

printf 'Deployment healthy: %s (previous: %s)\n' "$next_tag" "${previous_tag:-none}"
activated=false
