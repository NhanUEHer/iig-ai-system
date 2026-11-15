#!/bin/sh
set -eu

for path in \
  /app/public/cleaned-audio \
  /app/public/dialogues \
  /app/public/question-bank-media
do
  if [ -d "$path" ]; then chown node:node "$path"; fi
done

exec gosu node "$@"
