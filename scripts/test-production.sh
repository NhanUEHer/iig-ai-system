#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${PROD_BASE_URL:-https://admin.iigvn.site}"
EXPECTED_VERSION="${EXPECTED_VERSION:-}"
ACCESS_TOKEN="${PROD_ACCESS_TOKEN:-}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ai-scoring-prod-test.XXXXXX")"

cleanup() {
  rm -rf -- "$TMP_DIR"
}
trap cleanup EXIT

pass=0

assert_status() {
  local expected="$1"
  local path="$2"
  shift 2
  local actual
  actual="$(curl -sS -o "$TMP_DIR/response" -w '%{http_code}' "$@" "$BASE_URL$path" || true)"
  if [ "$actual" != "$expected" ]; then
    echo "FAIL $path: expected HTTP $expected, got ${actual:-connection-error}" >&2
    test ! -s "$TMP_DIR/response" || head -c 500 "$TMP_DIR/response" >&2
    echo >&2
    exit 1
  fi
  pass=$((pass + 1))
  echo "PASS $path -> HTTP $actual"
}

echo "Production smoke test: $BASE_URL"

assert_status 200 /health
node - "$TMP_DIR/response" "$EXPECTED_VERSION" <<'NODE'
const fs = require('fs');
const [file, expectedVersion] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
if (payload.status !== 'ok') throw new Error(`Unexpected health status: ${payload.status}`);
if (payload.build?.environment !== 'production') {
  throw new Error(`Unexpected environment: ${payload.build?.environment}`);
}
if (expectedVersion && payload.build?.version !== expectedVersion) {
  throw new Error(`Expected version ${expectedVersion}, got ${payload.build?.version}`);
}
console.log(`PASS build identity -> ${payload.build.version} (${payload.build.commit})`);
NODE
pass=$((pass + 1))

for path in / /question-bank /question-groups /exams /exams/new /exam-events /exam-events/new; do
  assert_status 200 "$path"
  grep -qi '<!doctype html' "$TMP_DIR/response" || {
    echo "FAIL $path: response is not the frontend document" >&2
    exit 1
  }
done

index_html="$(curl -fsS "$BASE_URL/")"
asset_path="$(printf '%s' "$index_html" | sed -n 's/.*src="\([^\"]*\/assets\/index-[^\"]*\.js\)".*/\1/p' | head -1)"
test -n "$asset_path" || { echo 'FAIL /: could not find built JavaScript asset' >&2; exit 1; }
assert_status 200 "$asset_path"

api_paths=(
  /api/question-bank/questions
  /api/question-bank/question-groups
  /api/exams
  /api/exam-events
)

if [ -n "$ACCESS_TOKEN" ]; then
  for path in "${api_paths[@]}"; do
    assert_status 200 "$path" -H "Authorization: Bearer $ACCESS_TOKEN"
  done
  echo 'Authenticated read-only API smoke tests completed.'
else
  for path in "${api_paths[@]}"; do
    assert_status 401 "$path"
  done
  echo 'PROD_ACCESS_TOKEN is not set; authenticated API tests were skipped.'
fi

for path in /api/.env /api/v1/.env; do
  assert_status 404 "$path"
done

echo "Production smoke test passed: $pass checks."
