# Deploying VTL OTR on a server

One Ubuntu server runs everything: PostgreSQL, Redis, the API, the background worker, both web apps and Caddy. Caddy obtains and renews HTTPS certificates from Let's Encrypt automatically. HTTPS is mandatory, because browsers only allow camera access on secure sites.

## What you need

| Item | Recommendation |
|---|---|
| Server | Ubuntu 22.04 or 24.04, **4 vCPU, 8 GB RAM, 80 GB SSD** (enough for a demo and pilot; scale out for peak recruitment load). Any provider: AWS, Azure, GCP, DigitalOcean, NIC/MeghRaj, on-premise. |
| Domains | Two DNS **A records** pointing to the server's public IP, for example `otr.example.in` (candidates) and `admin.otr.example.in` (admins). |
| Firewall | Inbound **80** and **443** open (and 22 for SSH). Nothing else needs to be public. |
| Production only | An SMS gateway account with DLT-registered templates (MSG91, Gupshup, NIC SMS, etc.) and an SMTP mailbox. |

## Install (about 10 to 15 minutes)

On the server:

```bash
git clone https://github.com/bharatkalia-bk/VTL-OTR.git && cd VTL-OTR
```

```bash
git checkout claude/intelligent-wright-gsglml
```

```bash
sudo bash deploy/install.sh
```

The installer installs Docker if needed, then asks for:

1. the candidate and admin domains,
2. an email for certificate notices,
3. the **mode**:
   - **demo**: loads the test data (3 exams, 50 candidates, admin accounts). SMS/email are simulated, and OTPs for new registrations appear at `https://<candidate-domain>/demo-inbox`. Every page shows a "Demo server" banner. Every OTP (candidates and staff) is `123456`. Use it for reviews and UAT, never with real candidate data.
   - **production**: starts empty except for master data, creates the first Super Admin (it prints a temporary password; change it in *Settings & account*; sign-in codes go to the admin's email, so configure SMTP), and asks for the SMS gateway URL and SMTP details.

It generates all secrets and encryption keys into `deploy/.env` (file mode 600). **Back up `deploy/.env` securely.** It contains the keys that decrypt personal data; losing it means losing that data.

Re-running `sudo bash deploy/install.sh` is safe: it keeps `deploy/.env` and the data, rebuilds the images and restarts the containers. Use it to deploy updates after `git pull`.

## SMS gateway configuration (production)

`SMS_HTTP_URL` is a template from your provider with placeholders `{to}` (10-digit mobile), `{text}` (message) and `{dlt}` (DLT template ID), URL-encoded automatically. Example:

```
SMS_HTTP_URL=https://api.provider.example/send?apikey=YOUR_KEY&sender=VTLOTR&to=91{to}&message={text}&dlt_template_id={dlt}
```

Optional: `SMS_HTTP_METHOD=POST` with `SMS_HTTP_BODY='{"to":"91{to}","text":"{text}"}'`, and `SMS_HTTP_SUCCESS_REGEX` if the provider returns HTTP 200 on failure. Register the DLT templates listed in `apps/api/templates/messages.ts` (OTP, OTR ID, payment, admit card, correction); admins can edit texts and DLT IDs under *Communication*.

## Optional: AI assist

The chat assistant, objection pre-review, DV discrepancy notes and interview briefs work without AI (rule-based). To add Claude-written summaries, set these in `deploy/.env` and re-run the installer:

```
AI_PROVIDER=claude
ANTHROPIC_API_KEY=<your key>
```

## Operations

| Task | Command (run in `deploy/`) |
|---|---|
| Status | `docker compose -f docker-compose.prod.yml --env-file .env ps` |
| Logs | `docker compose -f docker-compose.prod.yml --env-file .env logs -f api worker` |
| Restart | `docker compose -f docker-compose.prod.yml --env-file .env restart` |
| Database backup | `docker compose -f docker-compose.prod.yml --env-file .env exec -T postgres pg_dump -U vtl vtl_otr \| gzip > backup-$(date +%F).sql.gz` |
| Files backup | `docker run --rm -v vtl-otr_storage:/s -v "$PWD":/b alpine tar czf /b/storage-$(date +%F).tgz -C /s .` |

Schedule both backups daily (cron) and copy them off the server together with `deploy/.env`.

## What is and isn't covered yet

- Payments use the **mock gateway**. Plugging in Razorpay, PayU or SBI ePay means implementing the `PaymentGateway` interface in `apps/api/src/integrations/` with the provider's credentials.
- Aadhaar e-KYC, DigiLocker and APAAR are **mock adapters**. The real APIs need agency onboarding (UIDAI AUA/KUA, DigiLocker partner).
- Files are stored on the server's disk (`storage` volume, signed expiring URLs). For multiple servers, switch to S3-compatible storage (`STORAGE_DRIVER=s3`).
- Before a public launch: a CERT-In empanelled security audit, load testing for peak traffic, and a backup-restore drill.
