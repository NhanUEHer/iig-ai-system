#!/bin/sh
set -eu

for path in \
  /app/public/cleaned-audio \
  /app/public/local_audio \
  /app/public/local_voices \
  /app/public/tmp_local \
  /app/public/dialogues \
  /app/public/custom_voices \
  /app/public/question-bank-media
do
  if [ -d "$path" ]; then chown node:node "$path"; fi
done

exec gosu node "$@"
