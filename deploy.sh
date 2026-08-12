#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
VPS_IP="${VPS_IP:-178.105.45.146}"
VPS_DIR="${VPS_DIR:-/opt/ai-scoring}"
RELEASES_DIR="${RELEASES_DIR:-${VPS_DIR}-releases}"
CURRENT_LINK="${CURRENT_LINK:-${VPS_DIR}-current}"
APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version")}"
APP_COMMIT="${APP_COMMIT:-$(git rev-parse --short HEAD)}"
DEPLOY_ID="$(date -u +%Y%m%dT%H%M%SZ)-v${APP_VERSION}-${APP_COMMIT}"
RELEASE_DIR="$RELEASES_DIR/$DEPLOY_ID"
BACKUP_ID="${DEPLOY_ID%%-v*}"
SSH_OPTIONS=(-o BatchMode=no -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes)
REMOTE_LOCK="/var/lock/ai-scoring-deploy.lock"
LOCK_ACQUIRED=false

cleanup() {
  if [ "$LOCK_ACQUIRED" = true ]; then
    sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "rmdir '$REMOTE_LOCK' 2>/dev/null || true" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [ -z "${VPS_PASSWORD:-}" ] && command -v security >/dev/null 2>&1; then
  VPS_PASSWORD="$(security find-generic-password -a "root@${VPS_IP}" -s ai-scoring-vps -w 2>/dev/null || true)"
  export VPS_PASSWORD
fi
if [ -z "${VPS_PASSWORD:-}" ]; then
  echo "VPS_PASSWORD is required. Store it in macOS Keychain service ai-scoring-vps."
  exit 1
fi

echo "[1/9] Running release preflight..."
test "$(git branch --show-current)" = main || { echo "Deploy requires the main branch." >&2; exit 1; }
test -z "$(git status --porcelain)" || { echo "Deploy requires a clean working tree." >&2; exit 1; }
test "$APP_VERSION" = "$(node -p "require('./frontend/package.json').version")" || { echo "Root and frontend versions differ." >&2; exit 1; }
git tag --points-at HEAD | grep -Fxq "v$APP_VERSION" || { echo "HEAD must have tag v$APP_VERSION." >&2; exit 1; }
if [ "${ALLOW_UNPUSHED_RELEASE:-false}" != true ]; then
  git fetch --quiet origin main "refs/tags/v$APP_VERSION:refs/tags/v$APP_VERSION" || { echo "Cannot verify origin/main and release tag." >&2; exit 1; }
  test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" || { echo "HEAD is not synchronized with origin/main. Set ALLOW_UNPUSHED_RELEASE=true only for an approved emergency." >&2; exit 1; }
fi

sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  set -e
  mkdir '$REMOTE_LOCK' 2>/dev/null || { echo 'Another deployment is already running.' >&2; exit 1; }
  available_kb=\$(df -Pk '$VPS_DIR' | awk 'NR==2{print \$4}')
  test \"\$available_kb\" -ge 2097152 || { echo 'Production requires at least 2 GB free.' >&2; rmdir '$REMOTE_LOCK'; exit 1; }
  test -s '$VPS_DIR/.env'
  command -v pm2 >/dev/null
  command -v nginx >/dev/null
"
LOCK_ACQUIRED=true

echo "[2/9] Running complete local verification..."
npm run check

echo "[3/9] Building Production v${APP_VERSION} (${APP_COMMIT})..."
VITE_APP_ENV=production VITE_APP_VERSION="$APP_VERSION" VITE_APP_COMMIT="$APP_COMMIT" npm run build --prefix frontend

echo "[4/9] Resolving rollback backup..."
if [ "${SKIP_BACKUP:-false}" = true ]; then
  echo "WARNING: creating a new pre-deploy backup was explicitly skipped."
  BACKUP_ID="none"
elif [ -n "${PREVERIFIED_BACKUP_ID:-}" ]; then
  BACKUP_ID="$PREVERIFIED_BACKUP_ID"
  for file in database.dump scoring-data.dump database.contents.txt scoring-data.contents.txt backup-manifest.txt; do
    test -s "$PROJECT_DIR/backups/production/$BACKUP_ID/$file"
  done
  echo "Using verified backup: $BACKUP_ID"
else
  VPS_IP="$VPS_IP" VPS_DIR="$VPS_DIR" BACKUP_ID="$BACKUP_ID" "$PROJECT_DIR/scripts/backup-production.sh"
fi

echo "[5/9] Uploading immutable release ${RELEASE_DIR}..."
sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "mkdir -p '$RELEASE_DIR'"
sshpass -p "$VPS_PASSWORD" rsync -az --delete -e "ssh ${SSH_OPTIONS[*]}" \
  --exclude='node_modules' --exclude='frontend/node_modules' --exclude='.git' --exclude='.env' --exclude='backups' \
  --exclude='voice_clone_env' --exclude='voice_clone_models' --exclude='tts_env' --exclude='asset' --exclude='src/models' \
  --exclude='public/cleaned-audio' --exclude='public/local_audio' --exclude='public/local_voices' --exclude='public/tmp_local' \
  --exclude='public/dialogues' --exclude='public/custom_voices' \
  "$PROJECT_DIR/" root@"$VPS_IP":"$RELEASE_DIR/"

echo "[6/9] Linking shared data and installing dependencies..."
sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  set -e
  ln -s '$VPS_DIR/.env' '$RELEASE_DIR/.env'
  for path in tts_env voice_clone_env voice_clone_models asset; do
    if [ -e '$VPS_DIR/'\"\$path\" ]; then ln -s '$VPS_DIR/'\"\$path\" '$RELEASE_DIR/'\"\$path\"; fi
  done
  mkdir -p '$RELEASE_DIR/src' '$RELEASE_DIR/public'
  if [ -d '$VPS_DIR/src/models' ]; then ln -s '$VPS_DIR/src/models' '$RELEASE_DIR/src/models'; fi
  for path in cleaned-audio local_audio local_voices tmp_local dialogues custom_voices; do
    mkdir -p '$VPS_DIR/public/'\"\$path\"
    ln -s '$VPS_DIR/public/'\"\$path\" '$RELEASE_DIR/public/'\"\$path\"
  done
  cd '$RELEASE_DIR'
  npm ci --omit=dev
  npm run check:syntax
  test \"\$(node -p \"require('./package.json').version\")\" = '$APP_VERSION'
"

echo "[7/9] Activating release with automatic rollback..."
sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  set -e
  previous=\$(readlink -f '$CURRENT_LINK' 2>/dev/null || printf '%s' '$VPS_DIR')
  ln -sfn '$RELEASE_DIR' '${CURRENT_LINK}.next'
  mv -Tf '${CURRENT_LINK}.next' '$CURRENT_LINK'
  sed 's#/opt/ai-scoring/#${CURRENT_LINK}/#g' '$RELEASE_DIR/deploy/nginx-ai-scoring.conf' > /etc/nginx/sites-available/ai-scoring
  ln -sfn /etc/nginx/sites-available/ai-scoring /etc/nginx/sites-enabled/ai-scoring
  nginx -t
  systemctl reload nginx
  pm2 delete ai-scoring >/dev/null 2>&1 || true
  cd '$CURRENT_LINK'
  APP_ENV=production APP_VERSION='$APP_VERSION' APP_COMMIT='$APP_COMMIT' NODE_ENV=production pm2 start src/server.js --name ai-scoring --cwd '$CURRENT_LINK'
  printf '%s\n' \"\$previous\" > '$RELEASE_DIR/.previous-release'
"

echo "[8/9] Verifying exact production build identity..."
if ! sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  for attempt in 1 2 3 4 5 6 7 8; do
    response=\$(curl -fsS http://127.0.0.1:5005/health 2>/dev/null || true)
    if RESPONSE=\"\$response\" node -e \"const x=JSON.parse(process.env.RESPONSE);process.exit(x.status==='ok'&&x.build?.environment==='production'&&x.build?.version==='$APP_VERSION'&&x.build?.commit==='$APP_COMMIT'?0:1)\" 2>/dev/null; then
      echo \"\$response\"; exit 0
    fi
    sleep 2
  done
  exit 1
"; then
  echo "Health verification failed; rolling back..." >&2
  sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
    set -e
    previous=\$(cat '$RELEASE_DIR/.previous-release')
    ln -sfn \"\$previous\" '${CURRENT_LINK}.rollback'
    mv -Tf '${CURRENT_LINK}.rollback' '$CURRENT_LINK'
    pm2 delete ai-scoring >/dev/null 2>&1 || true
    cd '$CURRENT_LINK'
    APP_ENV=production NODE_ENV=production pm2 start src/server.js --name ai-scoring --cwd '$CURRENT_LINK'
    systemctl reload nginx
    curl -fsS --retry 5 --retry-delay 2 http://127.0.0.1:5005/health
  "
  exit 1
fi

echo "[9/9] Cleaning old releases..."
sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  current=\$(readlink -f '$CURRENT_LINK')
  find '$RELEASES_DIR' -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null | sort -nr | awk 'NR>3{print \$2}' | while read -r old; do
    if [ \"\$old\" != \"\$current\" ]; then rm -rf -- \"\$old\"; fi
  done
  pm2 save >/dev/null
"

echo "Deployment completed: Production v${APP_VERSION} (${APP_COMMIT})."
echo "Rollback backup: ${BACKUP_ID}."
