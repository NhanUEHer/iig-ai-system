#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VPS_IP="${VPS_IP:-178.105.45.146}"
VPS_DIR="${VPS_DIR:-/opt/ai-scoring}"
BACKUP_ID="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
REMOTE_BACKUP_DIR="$VPS_DIR/backups/$BACKUP_ID"
LOCAL_BACKUP_DIR="$PROJECT_DIR/backups/production/$BACKUP_ID"

if [ -z "${VPS_PASSWORD:-}" ]; then
  echo "VPS_PASSWORD is required."
  exit 1
fi

mkdir -p "$LOCAL_BACKUP_DIR"

sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no root@"$VPS_IP" "
  set -e
  mkdir -p '$REMOTE_BACKUP_DIR'
  cd '$VPS_DIR'
  DB_URL=\$(node -e \"require('dotenv').config({quiet:true}); process.stdout.write(process.env.DATABASE_URL || '')\")
  if [ -z \"\$DB_URL\" ]; then echo 'DATABASE_URL missing on production.' >&2; exit 1; fi
  mkdir -p public/cleaned-audio public/local_audio public/local_voices
  pg_dump --format=custom --no-owner --no-acl --file='$REMOTE_BACKUP_DIR/database.dump' \"\$DB_URL\"
  pg_dump --format=custom --no-owner --no-acl --data-only \
    --table=keycode_mappings \
    --table=mocktest_submissions \
    --table=submission_answers \
    --table=ai_evaluation_results \
    --file='$REMOTE_BACKUP_DIR/scoring-data.dump' \"\$DB_URL\"
  psql \"\$DB_URL\" -Atc \"SELECT 'keycode_mappings=' || COUNT(*) FROM keycode_mappings UNION ALL SELECT 'mocktest_submissions=' || COUNT(*) FROM mocktest_submissions UNION ALL SELECT 'submission_answers=' || COUNT(*) FROM submission_answers UNION ALL SELECT 'ai_evaluation_results=' || COUNT(*) FROM ai_evaluation_results\" > '$REMOTE_BACKUP_DIR/counts.txt'
  tar -czf '$REMOTE_BACKUP_DIR/media.tar.gz' public/cleaned-audio public/local_audio public/local_voices
  tar -czf '$REMOTE_BACKUP_DIR/code.tar.gz' --exclude=node_modules --exclude=backups --exclude=.env .
  test -s '$REMOTE_BACKUP_DIR/database.dump'
  test -s '$REMOTE_BACKUP_DIR/scoring-data.dump'
  test -s '$REMOTE_BACKUP_DIR/counts.txt'
  pg_restore --list '$REMOTE_BACKUP_DIR/database.dump' > '$REMOTE_BACKUP_DIR/database.contents.txt'
  pg_restore --list '$REMOTE_BACKUP_DIR/scoring-data.dump' > '$REMOTE_BACKUP_DIR/scoring-data.contents.txt'
"

for backup_file in database.dump scoring-data.dump counts.txt media.tar.gz database.contents.txt scoring-data.contents.txt; do
  sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no \
    root@"$VPS_IP":"$REMOTE_BACKUP_DIR/$backup_file" "$LOCAL_BACKUP_DIR/$backup_file"
done

test -s "$LOCAL_BACKUP_DIR/database.dump"
test -s "$LOCAL_BACKUP_DIR/scoring-data.dump"
test -s "$LOCAL_BACKUP_DIR/database.contents.txt"
test -s "$LOCAL_BACKUP_DIR/scoring-data.contents.txt"

echo "Backup verified: $LOCAL_BACKUP_DIR"
echo "Old code rollback archive retained on server: $REMOTE_BACKUP_DIR/code.tar.gz"
cat "$LOCAL_BACKUP_DIR/counts.txt"
