#!/usr/bin/env bash
set -euo pipefail

requested_command="${SSH_ORIGINAL_COMMAND:-}"

case "$requested_command" in
  "scp -t /opt/iig-admin/beta"|"scp -t /opt/iig-admin/beta/"|\
  "scp -t /opt/iig-admin/prod"|"scp -t /opt/iig-admin/prod/")
    exec /usr/bin/scp -t "${requested_command#scp -t }"
    ;;
  "scp -d -t /opt/iig-admin/beta"|"scp -d -t /opt/iig-admin/beta/"|\
  "scp -d -t /opt/iig-admin/prod"|"scp -d -t /opt/iig-admin/prod/")
    exec /usr/bin/scp -d -t "${requested_command#scp -d -t }"
    ;;
esac

# CI/CD v2: `manifest <beta|production>` prints the running image digest per component
# (read-only) so promote.yml can move Beta's exact images to Production.
if [[ "$requested_command" =~ ^manifest\ (beta|production)$ ]]; then
  env_name="${BASH_REMATCH[1]}"; project="iig-admin-${env_name}"
  printf '{'
  first=true
  for service in admin-api admin-web exam-web; do
    id="$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=$service" | head -1)"
    digest=""
    if [ -n "$id" ]; then
      digest="$(docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$(docker inspect --format '{{.Image}}' "$id")" | grep -m1 '^ghcr.io/nhanueher/iig-admin-' || true)"
    fi
    $first || printf ','; first=false
    printf '"%s":"%s"' "$service" "$digest"
  done
  dir=/opt/iig-admin/beta; [ "$env_name" = production ] && dir=/opt/iig-admin/prod
  printf ',"commit":"%s"}\n' "$(sed -n 's/^ADMIN_API_APP_COMMIT=//p;s/^APP_COMMIT=//p' "$dir/.env" | head -1)"
  exit 0
fi

read -r action target image_tag app_version app_commit components trailing <<< "$requested_command"
if [ "$action" != deploy ] || [ -n "${trailing:-}" ]; then
  echo "Deployment key may only upload release definitions or invoke a deployment." >&2
  exit 1
fi

case "$target" in
  beta)
    expected_prefix="beta-"
    deploy_dir="/opt/iig-admin/beta"
    ;;
  production)
    expected_prefix="prod-"
    deploy_dir="/opt/iig-admin/prod"
    ;;
  *)
    echo "Unsupported deployment target." >&2
    exit 1
    ;;
esac

if [[ ! "$image_tag" =~ ^${expected_prefix}[0-9a-f]{40}$ ]] \
  || [[ ! "$app_commit" =~ ^[0-9a-f]{40}$ ]] \
  || [[ "$image_tag" != "${expected_prefix}${app_commit}" ]] \
  || [[ ! "$app_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Invalid immutable release identity." >&2
  exit 1
fi

# Optional component list (CI/CD v2): only these services move to image_tag.
components="${components:-admin-api,admin-web,exam-web}"
if [[ ! "$components" =~ ^(admin-api|admin-web|exam-web)(,(admin-api|admin-web|exam-web)){0,2}$ ]]; then
  echo "Invalid component list." >&2
  exit 1
fi

cd "$deploy_dir"
exec /usr/bin/env \
  IMAGE_TAG="$image_tag" \
  APP_VERSION="$app_version" \
  APP_COMMIT="$app_commit" \
  DEPLOY_DIR="$deploy_dir" \
  DEPLOY_COMPONENTS="$components" \
  /usr/bin/bash deploy-containers.sh
