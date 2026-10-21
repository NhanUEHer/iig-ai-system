# syntax=docker/dockerfile:1.7
FROM node:22.13.1-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3001

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg gosu python3 tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY src ./src
COPY scripts/run-migrations.js ./scripts/run-migrations.js
COPY deploy/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint

RUN mkdir -p \
      public/cleaned-audio \
      public/local_audio \
      public/local_voices \
      public/tmp_local \
      public/dialogues \
      public/custom_voices \
      public/question-bank-media \
    && chmod 755 /usr/local/bin/api-entrypoint \
    && chown -R node:node /app

EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD curl --fail --silent http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/api-entrypoint"]
CMD ["node", "src/server.js"]
