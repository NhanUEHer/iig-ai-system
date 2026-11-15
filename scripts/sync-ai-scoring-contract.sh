#!/usr/bin/env bash
# A3: The AI Scoring Admin API contract is owned by iig-ai-scoring-backend.
# This repository vendors a byte-identical copy. Usage:
#   scripts/sync-ai-scoring-contract.sh /path/to/iig-ai-scoring-backend
set -euo pipefail
src="${1:?path to a checkout of iig-ai-scoring-backend is required}/contracts/ai-scoring-admin-api-v1.json"
dst="contracts/ai-scoring-admin-api-v1.json"
test -s "$src" || { echo "Contract not found: $src" >&2; exit 1; }
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$src"
cp "$src" "$dst"
echo "Synced $dst ($(sha256sum "$dst" | cut -d" " -f1)). Run npm test, commit, and merge before releasing Scoring."
