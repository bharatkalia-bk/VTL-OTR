#!/usr/bin/env bash
# One-time setup when the codespace is created: dependencies, keys, database, demo data, builds.
set -euo pipefail
cd "$(dirname "$0")/.."
sudo corepack enable && corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile
ENV=apps/api/.env
if [[ ! -f $ENV ]]; then
  cat > $ENV <<EOT
NODE_ENV=development
DATABASE_URL=postgresql://vtl:vtl@postgres:5432/vtl_otr?schema=public
REDIS_URL=redis://redis:6379
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
PII_ENC_KEY=$(openssl rand -base64 32)
PII_INDEX_KEY=$(openssl rand -base64 32)
FILE_URL_SECRET=$(openssl rand -hex 32)
STORAGE_DRIVER=fs
STORAGE_FS_ROOT=./.storage
EMAIL_DRIVER=mock
SMS_DRIVER=mock
DEV_EXPOSE_SECRETS=true
DEMO_MODE=true
DEMO_FIXED_OTP=123456
RUN_WORKER_IN_API=true
SWAGGER_ENABLED=true
EOT
fi
pnpm --filter @vtl/shared build
(cd apps/api && npx prisma generate && npx prisma migrate deploy && npx tsc -p tsconfig.build.json)
(cd apps/api && set -a && . ./.env && set +a && node dist/prisma/seed/index.js)
pnpm --filter @vtl/candidate-web build
pnpm --filter @vtl/admin-web build
# Chromium for server-side PDFs (OTR slip, receipts, admit cards). Not fatal: the sites work without it.
pnpm --filter @vtl/candidate-web exec playwright install --with-deps chromium \
  || echo "WARNING: Chromium could not be installed; PDF downloads will fail until you run: pnpm --filter @vtl/candidate-web exec playwright install --with-deps chromium"
echo "Setup complete."
