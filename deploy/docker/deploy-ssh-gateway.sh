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

read -r action target image_tag app_version app_commit trailing <<< "$requested_command"
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

cd "$deploy_dir"
exec /usr/bin/env \
  IMAGE_TAG="$image_tag" \
  APP_VERSION="$app_version" \
  APP_COMMIT="$app_commit" \
  DEPLOY_DIR="$deploy_dir" \
  /usr/bin/bash deploy-containers.sh
