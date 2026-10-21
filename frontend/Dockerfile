# syntax=docker/dockerfile:1.7
FROM node:22.13.1-alpine AS build
WORKDIR /workspace
COPY package.json ./package.json
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --ignore-scripts
COPY frontend/ ./frontend/
WORKDIR /workspace/frontend
ARG VITE_APP_ENV=production
ARG VITE_APP_VERSION=unknown
ARG VITE_APP_COMMIT=unknown
ENV VITE_APP_ENV=$VITE_APP_ENV \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_APP_COMMIT=$VITE_APP_COMMIT
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /workspace/frontend/dist /usr/share/nginx/html
COPY deploy/docker/admin.nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/docker/proxy_params /etc/nginx/proxy_params
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8080/health >/dev/null || exit 1
