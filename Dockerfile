# syntax=docker/dockerfile:1.7
FROM node:22.13.1-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM dependencies AS source
COPY src ./src
COPY scripts/run-migrations.js ./scripts/run-migrations.js
COPY deploy/docker/api-entrypoint.sh /usr/local/bin/api-entrypoint

FROM source AS admin-api
ENV NODE_ENV=production PORT=3001 ADMIN_API_PORT=3001
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg gosu python3 tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p public/cleaned-audio public/local_audio public/local_voices public/tmp_local \
       public/dialogues public/custom_voices public/question-bank-media \
    && chmod 755 /usr/local/bin/api-entrypoint \
    && chown -R node:node /app
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD curl --fail --silent http://127.0.0.1:3001/health/ready || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/api-entrypoint"]
CMD ["node", "src/apps/admin/server.js"]

FROM source AS ai-scoring-api
ENV NODE_ENV=production PORT=3002 AI_SCORING_API_PORT=3002
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gosu tini \
    && rm -rf /var/lib/apt/lists/* \
    && chmod 755 /usr/local/bin/api-entrypoint \
    && chown -R node:node /app
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD curl --fail --silent http://127.0.0.1:3002/health/ready || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/api-entrypoint"]
CMD ["node", "src/apps/ai-scoring/server.js"]

FROM source AS ai-scoring-worker
ENV NODE_ENV=production PORT=3003 AI_SCORING_WORKER_HEALTH_PORT=3003
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg gosu python3 tini \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p public/cleaned-audio public/tmp_local public/question-bank-media \
    && chmod 755 /usr/local/bin/api-entrypoint \
    && chown -R node:node /app
EXPOSE 3003
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=4 \
  CMD curl --fail --silent http://127.0.0.1:3003/health/ready || exit 1
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/api-entrypoint"]
CMD ["node", "src/apps/ai-scoring/worker.js"]
