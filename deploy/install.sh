#!/usr/bin/env bash
# VTL OTR one-command installer for a fresh Ubuntu 22.04 / 24.04 server.
# Usage (as root or with sudo), from the cloned repository:
#   sudo bash deploy/install.sh
# Re-running is safe: secrets in deploy/.env are kept, data volumes are kept, images are rebuilt.
set -euo pipefail
cd "$(dirname "$0")"
ENV_FILE=.env

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
ask() { local v; read -r -p "$1 " v; echo "$v"; }
rand() { openssl rand -hex "${1:-24}"; }

if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

if [[ ! -f $ENV_FILE ]]; then
  say "First-time configuration"
  CANDIDATE_DOMAIN=$(ask "Candidate portal domain (e.g. otr.example.gov.in):")
  ADMIN_DOMAIN=$(ask "Admin console domain (e.g. admin.otr.example.gov.in):")
  ACME_EMAIL=$(ask "Email for Let's Encrypt certificate notices:")
  MODE=$(ask "Mode: 'demo' (test data, OTPs shown in a demo inbox) or 'production' [demo]:")
  MODE=${MODE:-demo}
  {
    echo "CANDIDATE_DOMAIN=$CANDIDATE_DOMAIN"
    echo "ADMIN_DOMAIN=$ADMIN_DOMAIN"
    echo "ACME_EMAIL=$ACME_EMAIL"
    echo "POSTGRES_PASSWORD=$(rand 18)"
    echo "REDIS_PASSWORD=$(rand 18)"
    echo "JWT_ACCESS_SECRET=$(rand 32)"
    echo "JWT_REFRESH_SECRET=$(rand 32)"
    echo "PII_ENC_KEY=$(openssl rand -base64 32)"
    echo "PII_INDEX_KEY=$(openssl rand -base64 32)"
    echo "FILE_URL_SECRET=$(rand 32)"
    echo "PAYMENT_WEBHOOK_SECRET=$(rand 24)"
  } > $ENV_FILE
  if [[ $MODE == production ]]; then
    ADMIN_EMAIL=$(ask "First Super Admin email:")
    ADMIN_PW="Vtl@$(rand 6)"
    {
      echo "DEMO_MODE=false"
      echo "SEED_ADMIN_EMAIL=$ADMIN_EMAIL"
      echo "SEED_ADMIN_PASSWORD=$ADMIN_PW"
      echo "# Real SMS gateway (mobile OTP is mandatory). Placeholders {to} {text} {dlt}:"
      echo "SMS_DRIVER=http"
      echo "SMS_HTTP_URL=$(ask 'SMS gateway URL template (from your provider, with API key):')"
      echo "EMAIL_DRIVER=smtp"
      echo "SMTP_HOST=$(ask 'SMTP host:')"
      echo "SMTP_PORT=$(ask 'SMTP port [587]:')"
      echo "SMTP_USER=$(ask 'SMTP username:')"
      echo "SMTP_PASS=$(ask 'SMTP password:')"
      echo "EMAIL_FROM=VTL OTR <no-reply@$CANDIDATE_DOMAIN>"
    } >> $ENV_FILE
    sed -i 's/^SMTP_PORT=$/SMTP_PORT=587/' $ENV_FILE
  else
    { echo "DEMO_MODE=true"; echo "SMS_DRIVER=mock"; echo "EMAIL_DRIVER=mock"; } >> $ENV_FILE
  fi
  chmod 600 $ENV_FILE
  echo "Saved configuration to deploy/$ENV_FILE (keep a secure backup: it holds the encryption keys)."
fi
set -a; source $ENV_FILE; set +a

say "Building and starting containers (first build takes several minutes)"
docker compose -f docker-compose.prod.yml --env-file $ENV_FILE up -d --build

say "Waiting for the API to become healthy"
for i in $(seq 1 60); do
  if docker compose -f docker-compose.prod.yml --env-file $ENV_FILE exec -T api node -e "fetch('http://localhost:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then break; fi
  sleep 5
done

MARKER=.seeded
if [[ ! -f $MARKER ]]; then
  if [[ ${DEMO_MODE:-false} == true ]]; then
    say "Loading demo data (3 exams, 50 candidates, admins)"
    docker compose -f docker-compose.prod.yml --env-file $ENV_FILE exec -T api node dist/prisma/seed/index.js
  else
    say "Loading master data and creating the first Super Admin"
    docker compose -f docker-compose.prod.yml --env-file $ENV_FILE exec -T api node dist/prisma/seed/index.js --minimal
  fi
  touch $MARKER
fi

say "Done"
echo "Candidate portal: https://$CANDIDATE_DOMAIN"
echo "Admin console:    https://$ADMIN_DOMAIN"
if [[ ${DEMO_MODE:-false} == true ]]; then
  echo "Demo logins: candidate01@example.in / Candidate@123 ; superadmin@vtl-otr.local / Admin@12345"
  echo "Admin TOTP secret (add to an authenticator app): KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD"
  echo "OTPs for new registrations: https://$CANDIDATE_DOMAIN/demo-inbox"
else
  echo "Super Admin: $SEED_ADMIN_EMAIL  password: $SEED_ADMIN_PASSWORD  (change it; set up 2FA on first login)"
fi
