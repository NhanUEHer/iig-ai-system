#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"
VPS_IP="${VPS_IP:-178.105.45.146}"
VPS_DIR="${VPS_DIR:-/opt/ai-scoring}"
APP_VERSION="${APP_VERSION:-$(node -p "require('./package.json').version")}"
APP_COMMIT="${APP_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || true)}"
DEPLOY_ID="$(date -u +%Y%m%dT%H%M%SZ)-v${APP_VERSION}"
BACKUP_ID="${DEPLOY_ID%%-v*}"
STAGE_DIR="${VPS_DIR}.stage-${DEPLOY_ID}"

if [ -z "${VPS_PASSWORD:-}" ]; then
  echo "VPS_PASSWORD is required. Export it in the current shell; never commit it."
  exit 1
fi

echo "[1/7] Running complete local verification..."
npm run check

echo "[2/7] Building Production v${APP_VERSION} (${APP_COMMIT:-no-commit})..."
VITE_APP_ENV=production VITE_APP_VERSION="$APP_VERSION" VITE_APP_COMMIT="$APP_COMMIT" npm run build --prefix frontend

echo "[3/7] Backing up production database, scoring data, media, and old code..."
if [ -n "${PREVERIFIED_BACKUP_ID:-}" ]; then
  BACKUP_ID="$PREVERIFIED_BACKUP_ID"
  test -s "$PROJECT_DIR/backups/production/$BACKUP_ID/database.dump"
  test -s "$PROJECT_DIR/backups/production/$BACKUP_ID/scoring-data.dump"
  test -s "$PROJECT_DIR/backups/production/$BACKUP_ID/database.contents.txt"
  echo "Using verified backup: $BACKUP_ID"
else
  VPS_IP="$VPS_IP" VPS_DIR="$VPS_DIR" BACKUP_ID="$BACKUP_ID" "$PROJECT_DIR/scripts/backup-production.sh"
fi

echo "[4/7] Uploading a release candidate to ${STAGE_DIR}..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$VPS_IP" "mkdir -p '$STAGE_DIR'"
sshpass -p "$VPS_PASSWORD" rsync -az --delete \
  --exclude='node_modules' \
  --exclude='frontend/node_modules' \
  --exclude='.git' \
  --exclude='.env' \
  --exclude='backups' \
  --exclude='voice_clone_env' \
  --exclude='voice_clone_models' \
  --exclude='tts_env' \
  --exclude='asset' \
  --exclude='src/models/**/*.onnx' \
  --exclude='src/models/**/*.bin' \
  --exclude='src/models/**/*.pt' \
  --exclude='src/models/**/*.pth' \
  --exclude='src/models/**/*.npy' \
  --exclude='src/models/**/*.safetensors' \
  --exclude='public/cleaned-audio' \
  --exclude='public/local_audio' \
  --exclude='public/local_voices' \
  --exclude='public/tmp_local' \
  --exclude='public/dialogues' \
  --exclude='public/custom_voices' \
  "$PROJECT_DIR/" root@"$VPS_IP":"$STAGE_DIR/"

echo "[5/7] Installing production dependencies in staging..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$VPS_IP" "
  set -e
  cp '$VPS_DIR/.env' '$STAGE_DIR/.env'
  cd '$STAGE_DIR'
  npm ci --omit=dev
  npm run check:syntax
"

echo "[6/7] Activating the new code while preserving data and media..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$VPS_IP" "
  set -e
  rsync -a --delete \
    --exclude='.env' \
    --exclude='backups' \
    --exclude='public/cleaned-audio' \
    --exclude='public/local_audio' \
    --exclude='public/local_voices' \
    --exclude='public/tmp_local' \
    --exclude='public/dialogues' \
    --exclude='public/custom_voices' \
    --exclude='tts_env' \
    --exclude='voice_clone_env' \
    --exclude='voice_clone_models' \
    --exclude='asset' \
    --exclude='src/models/**/*.onnx' \
    --exclude='src/models/**/*.bin' \
    --exclude='src/models/**/*.pt' \
    --exclude='src/models/**/*.pth' \
    --exclude='src/models/**/*.npy' \
    --exclude='src/models/**/*.safetensors' \
    '$STAGE_DIR/' '$VPS_DIR/'
  cd '$VPS_DIR'
  install -m 644 deploy/nginx-ai-scoring.conf /etc/nginx/sites-available/ai-scoring
  ln -sfn /etc/nginx/sites-available/ai-scoring /etc/nginx/sites-enabled/ai-scoring
  nginx -t
  systemctl reload nginx
  APP_ENV=production APP_VERSION='$APP_VERSION' APP_COMMIT='$APP_COMMIT' NODE_ENV=production \
    pm2 restart ai-scoring --update-env
  rm -rf '$STAGE_DIR'
"

echo "[7/7] Verifying production health and build identity..."
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$VPS_IP" "
  set -e
  for attempt in 1 2 3 4 5; do
    response=\$(curl -fsS http://127.0.0.1:5005/health 2>/dev/null || true)
    if echo \"\$response\" | grep -q '\"environment\":\"production\"'; then
      echo \"\$response\"
      exit 0
    fi
    sleep 2
  done
  echo 'Production health check failed.' >&2
  exit 1
"

echo "Deployment completed: Production v${APP_VERSION}."
echo "The verified pre-deploy backup is available under backups/production/${BACKUP_ID}."
