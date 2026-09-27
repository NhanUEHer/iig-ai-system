#!/usr/bin/env bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

APP_VERSION="$(node -p "require('./package.json').version")"
FRONTEND_VERSION="$(node -p "require('./frontend/package.json').version")"
APP_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || printf 'no-git')"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DIRTY=false
DIRTY_SUFFIX=""
if test -n "$(git status --porcelain 2>/dev/null || true)"; then
  DIRTY=true
  DIRTY_SUFFIX="-dirty-$(date -u +%Y%m%dT%H%M%SZ)"
fi
RELEASE_ID="ai-scoring-admin-v${APP_VERSION}-${APP_COMMIT}${DIRTY_SUFFIX}"
OUTPUT_DIR="$PROJECT_DIR/releases"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-scoring-release.XXXXXX")/$RELEASE_ID"

cleanup() {
  rm -rf -- "$(dirname "$STAGE_DIR")"
}
trap cleanup EXIT

test "$APP_VERSION" = "$FRONTEND_VERSION" || {
  echo "Root version ($APP_VERSION) and frontend version ($FRONTEND_VERSION) do not match." >&2
  exit 1
}

echo "[1/5] Running production checks..."
npm run check

echo "[2/5] Building frontend with production identity..."
VITE_APP_ENV=production VITE_APP_VERSION="$APP_VERSION" VITE_APP_COMMIT="$APP_COMMIT" npm run build --prefix frontend
npm run build --prefix mobile-web
mkdir -p "$PROJECT_DIR/frontend/dist/events"
rsync -a --delete "$PROJECT_DIR/mobile-web/dist/" "$PROJECT_DIR/frontend/dist/events/"
test -s "$PROJECT_DIR/frontend/dist/events/index.html"

echo "[3/5] Staging runtime files..."
mkdir -p "$STAGE_DIR/frontend" "$STAGE_DIR/public" "$STAGE_DIR/scripts" "$STAGE_DIR/docs" "$OUTPUT_DIR"
rsync -a \
  --exclude='._*' \
  --exclude='models/**/*.onnx' \
  --exclude='models/**/*.bin' \
  --exclude='models/**/*.pt' \
  --exclude='models/**/*.pth' \
  --exclude='models/**/*.npy' \
  --exclude='models/**/*.safetensors' \
  "$PROJECT_DIR/src/" "$STAGE_DIR/src/"
rsync -a --exclude='._*' "$PROJECT_DIR/tests/" "$STAGE_DIR/tests/"
rsync -a "$PROJECT_DIR/frontend/dist/" "$STAGE_DIR/frontend/dist/"
cp "$PROJECT_DIR/package.json" "$PROJECT_DIR/package-lock.json" "$PROJECT_DIR/.env.production.example" "$PROJECT_DIR/README.md" "$STAGE_DIR/"
cp "$PROJECT_DIR/frontend/package.json" "$PROJECT_DIR/frontend/package-lock.json" "$STAGE_DIR/frontend/"
cp "$PROJECT_DIR/deploy/nginx-ai-scoring.conf" "$STAGE_DIR/deploy-nginx-ai-scoring.conf"
cp "$PROJECT_DIR/scripts/run-migrations.js" "$PROJECT_DIR/scripts/backup-production.sh" "$PROJECT_DIR/scripts/restore-production-backup.sh" "$STAGE_DIR/scripts/"
cp "$PROJECT_DIR/docs/PRODUCTION_RELEASE_CHECKLIST.md" "$STAGE_DIR/docs/"
mkdir -p "$STAGE_DIR/public/cleaned-audio" "$STAGE_DIR/public/local_audio" "$STAGE_DIR/public/local_voices" "$STAGE_DIR/public/tmp_local" "$STAGE_DIR/public/dialogues" "$STAGE_DIR/public/custom_voices" "$STAGE_DIR/public/question-bank-media"

cat > "$STAGE_DIR/RELEASE-MANIFEST.txt" <<EOF
application=ai-scoring-admin
version=$APP_VERSION
commit=$APP_COMMIT
built_at_utc=$BUILD_TIME
node_required=>=22.13.0
latest_migration=099_exam_candidate_management.sql
working_tree_dirty=$DIRTY
frontend_prebuilt=true
candidate_mobile_prebuilt=true
runtime_media_included=false
environment_secrets_included=false
model_weights_included=false
EOF

echo "[4/5] Creating checksums and archive..."
(
  cd "$STAGE_DIR"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
)
COPYFILE_DISABLE=1 tar -C "$(dirname "$STAGE_DIR")" -czf "$OUTPUT_DIR/$RELEASE_ID.tar.gz" "$RELEASE_ID"
shasum -a 256 "$OUTPUT_DIR/$RELEASE_ID.tar.gz" > "$OUTPUT_DIR/$RELEASE_ID.tar.gz.sha256"

echo "[5/5] Release package ready."
echo "$OUTPUT_DIR/$RELEASE_ID.tar.gz"
echo "$OUTPUT_DIR/$RELEASE_ID.tar.gz.sha256"
