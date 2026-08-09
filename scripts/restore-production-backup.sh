#!/bin/bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <backup.dump> <target-database-url>"
  exit 1
fi

BACKUP_FILE="$1"
TARGET_DATABASE_URL="$2"

if [ ! -s "$BACKUP_FILE" ]; then
  echo "Backup file does not exist or is empty: $BACKUP_FILE"
  exit 1
fi

echo "Restore target: the explicitly supplied PostgreSQL database"
echo "Backup: $BACKUP_FILE"
echo "This script does not drop or create the target database."

pg_restore --exit-on-error --no-owner --no-acl --clean --if-exists \
  --dbname="$TARGET_DATABASE_URL" "$BACKUP_FILE"

echo "Restore completed. Start the application once to apply newer additive migrations."
