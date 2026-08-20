#!/bin/bash

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VPS_IP="${VPS_IP:-178.105.45.146}"
VPS_DIR="${VPS_DIR:-/opt/ai-scoring}"
BACKUP_ID="${BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
REMOTE_PARTIAL="$VPS_DIR/backups/.partial-$BACKUP_ID"
REMOTE_FINAL="$VPS_DIR/backups/$BACKUP_ID"
LOCAL_PARTIAL="$PROJECT_DIR/backups/production/.partial-$BACKUP_ID"
LOCAL_FINAL="$PROJECT_DIR/backups/production/$BACKUP_ID"
SSH_OPTIONS=(-o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StrictHostKeyChecking=yes)

cleanup() {
  rm -rf -- "$LOCAL_PARTIAL"
  sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "rm -rf -- '$REMOTE_PARTIAL'" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if [ -z "${VPS_PASSWORD:-}" ]; then echo "VPS_PASSWORD is required." >&2; exit 1; fi
test ! -e "$LOCAL_FINAL" || { echo "Backup already exists: $LOCAL_FINAL" >&2; exit 1; }
mkdir -p "$LOCAL_PARTIAL"

sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  set -e
  rm -rf -- '$REMOTE_PARTIAL'
  mkdir -p '$REMOTE_PARTIAL'
  cd '$VPS_DIR'
  DB_URL=\$(node -e \"require('dotenv').config({quiet:true});process.stdout.write(process.env.DATABASE_URL||'')\")
  test -n \"\$DB_URL\"
  pg_dump --format=custom --no-owner --no-acl --file='$REMOTE_PARTIAL/database.dump' \"\$DB_URL\"
  pg_dump --format=custom --no-owner --no-acl --data-only --table=keycode_mappings --table=mocktest_submissions --table=submission_answers --table=ai_evaluation_results --file='$REMOTE_PARTIAL/scoring-data.dump' \"\$DB_URL\"
  psql \"\$DB_URL\" -Atc \"SELECT 'keycode_mappings='||COUNT(*) FROM keycode_mappings UNION ALL SELECT 'mocktest_submissions='||COUNT(*) FROM mocktest_submissions UNION ALL SELECT 'submission_answers='||COUNT(*) FROM submission_answers UNION ALL SELECT 'ai_evaluation_results='||COUNT(*) FROM ai_evaluation_results\" > '$REMOTE_PARTIAL/counts.txt'
  tar -czf '$REMOTE_PARTIAL/media.tar.gz' public/cleaned-audio public/local_audio public/local_voices
  pg_restore --list '$REMOTE_PARTIAL/database.dump' > '$REMOTE_PARTIAL/database.contents.txt'
  pg_restore --list '$REMOTE_PARTIAL/scoring-data.dump' > '$REMOTE_PARTIAL/scoring-data.contents.txt'
  version=\$(node -p \"require('./package.json').version\")
  commit=\$(curl -fsS http://127.0.0.1:5005/health 2>/dev/null | node -e \"let s='';process.stdin.on('data',d=>s+=d).on('end',()=>process.stdout.write(JSON.parse(s).build?.commit||''))\" || true)
  cd '$REMOTE_PARTIAL'
  sha256sum database.dump scoring-data.dump media.tar.gz > SHA256SUMS
  printf 'environment=production\nhost=%s\ncreated_at=%s\nversion=%s\ncommit=%s\n' '$VPS_IP' '$BACKUP_ID' \"\$version\" \"\$commit\" > '$REMOTE_PARTIAL/backup-manifest.txt'
  for file in database.dump scoring-data.dump counts.txt media.tar.gz database.contents.txt scoring-data.contents.txt SHA256SUMS backup-manifest.txt; do test -s '$REMOTE_PARTIAL/'\"\$file\"; done
"

for file in database.dump scoring-data.dump counts.txt media.tar.gz database.contents.txt scoring-data.contents.txt SHA256SUMS backup-manifest.txt; do
  # The production host exposes legacy SCP over SSH but does not enable the
  # SFTP subsystem used by modern scp by default.
  sshpass -p "$VPS_PASSWORD" scp -O "${SSH_OPTIONS[@]}" root@"$VPS_IP":"$REMOTE_PARTIAL/$file" "$LOCAL_PARTIAL/$file"
done
(cd "$LOCAL_PARTIAL" && shasum -a 256 -c SHA256SUMS)
mv "$LOCAL_PARTIAL" "$LOCAL_FINAL"
sshpass -p "$VPS_PASSWORD" ssh "${SSH_OPTIONS[@]}" root@"$VPS_IP" "
  mv '$REMOTE_PARTIAL' '$REMOTE_FINAL'
  find '$VPS_DIR/backups' -mindepth 1 -maxdepth 1 -type d ! -name '.partial-*' -printf '%T@ %p\n' | sort -nr | awk 'NR>3{print \$2}' | while read -r old; do rm -rf -- \"\$old\"; done
"
trap - EXIT INT TERM
echo "Backup verified: $LOCAL_FINAL"
cat "$LOCAL_FINAL/counts.txt"
