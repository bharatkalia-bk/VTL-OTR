#!/usr/bin/env bash
# Runs on every codespace start: API (with in-process worker) + production builds of both sites.
set -uo pipefail
cd "$(dirname "$0")/.."
LOGS=/tmp/vtl-otr; mkdir -p $LOGS
if [[ -n "${CODESPACE_NAME:-}" ]]; then
  DOMAIN=${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}
  CANDIDATE_URL="https://${CODESPACE_NAME}-5173.${DOMAIN}"
  ADMIN_URL="https://${CODESPACE_NAME}-5174.${DOMAIN}"
else
  CANDIDATE_URL=http://localhost:5173; ADMIN_URL=http://localhost:5174
fi
pkill -f "dist/src/main.js" 2>/dev/null; pkill -f "vite preview" 2>/dev/null; sleep 1
# Rebuild anything missing (for example if the first-time setup was interrupted).
[[ -f apps/api/dist/src/main.js ]] || (pnpm --filter @vtl/shared build && cd apps/api && npx prisma generate && npx prisma migrate deploy && npx tsc -p tsconfig.build.json)
[[ -f apps/candidate-web/dist/index.html ]] || pnpm --filter @vtl/candidate-web build
[[ -f apps/admin-web/dist/index.html ]] || pnpm --filter @vtl/admin-web build
# setsid + nohup: the servers keep running after this script (a Codespaces lifecycle command) exits.
(
  cd apps/api && set -a && . ./.env && set +a
  export PUBLIC_API_URL=$CANDIDATE_URL CANDIDATE_WEB_URL=$CANDIDATE_URL ADMIN_WEB_URL=$ADMIN_URL CORS_ORIGINS="$CANDIDATE_URL,$ADMIN_URL"
  setsid nohup node dist/src/main.js > $LOGS/api.log 2>&1 < /dev/null &
)
(cd apps/candidate-web && setsid nohup npx vite preview --port 5173 --strictPort > $LOGS/candidate.log 2>&1 < /dev/null &)
(cd apps/admin-web && setsid nohup npx vite preview --port 5174 --strictPort > $LOGS/admin.log 2>&1 < /dev/null &)
for i in $(seq 1 45); do curl -sf localhost:4000/api/v1/health/live >/dev/null && curl -sf localhost:5173 >/dev/null && break; sleep 2; done
curl -sf localhost:4000/api/v1/health/live >/dev/null || echo "WARNING: the API did not start. See $LOGS/api.log"
# Make the two sites reachable by anyone with the link (best effort; otherwise set it in the Ports tab).
if [[ -n "${CODESPACE_NAME:-}" ]] && command -v gh >/dev/null; then
  gh codespace ports visibility 5173:public 5174:public -c "$CODESPACE_NAME" >/dev/null 2>&1 || true
fi
cat <<EOT

  VTL OTR is running (demo mode)
  Candidate portal : $CANDIDATE_URL
  Admin console    : $ADMIN_URL
  Demo inbox (OTPs): $CANDIDATE_URL/demo-inbox
  API docs         : $CANDIDATE_URL/api/docs
  Logs             : $LOGS/*.log    Restart: bash .devcontainer/start.sh

EOT
