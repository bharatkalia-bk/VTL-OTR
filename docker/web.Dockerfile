# Builds a candidate or admin SPA and serves it with nginx (strict CSP, /api reverse proxy).
ARG APP=candidate-web
FROM node:22-alpine AS build
ARG APP
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages packages
COPY apps/${APP} apps/${APP}
COPY scripts scripts
RUN pnpm install --frozen-lockfile --filter @vtl/${APP}... && pnpm --filter @vtl/${APP} build

FROM nginx:1.27-alpine
ARG APP
COPY --from=build /app/apps/${APP}/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
