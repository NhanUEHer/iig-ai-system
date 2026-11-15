#!/bin/sh
# Writes the release identity for the SPA at container start (nginx:alpine runs /docker-entrypoint.d/*).
set -eu
esc() { printf '%s' "${1:-}" | sed 's/[\\"]/\\&/g'; }
cat > /usr/share/nginx/html/runtime-config.js <<JS
window.__APP_CONFIG__ = { env: "$(esc "${APP_ENV:-}")", version: "$(esc "${APP_VERSION:-}")", commit: "$(esc "${APP_COMMIT:-}")" };
JS
