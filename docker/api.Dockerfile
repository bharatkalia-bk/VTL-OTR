# API + worker image (same image, different command). Uses the official Playwright base for Chromium (PDFs).
FROM mcr.microsoft.com/playwright:v1.63.0-noble AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @vtl/api... --filter @vtl/shared
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @vtl/shared build && cd apps/api && npx prisma generate && npx tsc -p tsconfig.build.json

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
RUN mkdir -p /data/storage && chown -R pwuser /data/storage && chmod -R a+rX /app/apps/api/templates /app/apps/api/dist
USER pwuser
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s CMD node -e "fetch('http://localhost:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
