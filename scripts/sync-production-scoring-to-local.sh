#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VPS_IP="${VPS_IP:-178.105.45.146}"
VPS_DIR="${VPS_DIR:-/opt/ai-scoring}"
SYNC_ID="${SYNC_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
SYNC_DIR="$PROJECT_DIR/backups/production/$SYNC_ID"
LOCAL_BACKUP_DIR="$PROJECT_DIR/backups/local-before-production-sync/$SYNC_ID"

if [ -z "${VPS_PASSWORD:-}" ]; then
  echo "VPS_PASSWORD is required."
  exit 1
fi

cd "$PROJECT_DIR"
LOCAL_DATABASE_URL="$(node -e "require('dotenv').config({quiet:true}); process.stdout.write(process.env.DATABASE_URL || '')")"
if [ -z "$LOCAL_DATABASE_URL" ]; then
  echo "Local DATABASE_URL is missing."
  exit 1
fi

mkdir -p "$SYNC_DIR" "$LOCAL_BACKUP_DIR"

echo "Backing up the complete local database before replacement..."
pg_dump --format=custom --no-owner --no-acl \
  --file="$LOCAL_BACKUP_DIR/database.dump" "$LOCAL_DATABASE_URL"
test -s "$LOCAL_BACKUP_DIR/database.dump"

echo "Exporting production scoring data as portable column INSERT statements..."
REMOTE_SQL="$VPS_DIR/backups/$SYNC_ID/scoring-data.sql"
sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$VPS_IP" "
  set -e
  mkdir -p '$VPS_DIR/backups/$SYNC_ID'
  cd '$VPS_DIR'
  DB_URL=\$(node -e \"require('dotenv').config({quiet:true}); process.stdout.write(process.env.DATABASE_URL || '')\")
  pg_dump --data-only --column-inserts --no-owner --no-acl \
    --table=keycode_mappings \
    --table=mocktest_submissions \
    --table=submission_answers \
    --table=ai_evaluation_results \
    --file='$REMOTE_SQL' \"\$DB_URL\"
  test -s '$REMOTE_SQL'
"
sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no \
  root@"$VPS_IP":"$REMOTE_SQL" "$SYNC_DIR/scoring-data.sql"

echo "Replacing local scoring data in one transaction..."
psql --set=ON_ERROR_STOP=1 --single-transaction "$LOCAL_DATABASE_URL" \
  --command="TRUNCATE TABLE ai_evaluation_results, submission_answers, mocktest_submissions, keycode_mappings CASCADE" \
  --file="$SYNC_DIR/scoring-data.sql"

psql "$LOCAL_DATABASE_URL" -Atc "
  SELECT 'keycode_mappings=' || COUNT(*) FROM keycode_mappings
  UNION ALL SELECT 'mocktest_submissions=' || COUNT(*) FROM mocktest_submissions
  UNION ALL SELECT 'submission_answers=' || COUNT(*) FROM submission_answers
  UNION ALL SELECT 'ai_evaluation_results=' || COUNT(*) FROM ai_evaluation_results
" | tee "$SYNC_DIR/local-counts-after.txt"

echo "Production scoring data is now available in the local development database."
echo "Local rollback dump: $LOCAL_BACKUP_DIR/database.dump"
