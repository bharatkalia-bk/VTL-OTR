# VTL OTR · One Time Registration Platform

**VTL One Time Registration Platform**, a product of **Vensysco Technologies Limited**.

Candidates register once, verify mobile and email with OTP, complete a profile with a **live camera photograph**, signature and certificates, and get a permanent **OTR ID** (for example `VTL-OTR-2026-00001236`, with a Verhoeff check digit). They then apply for any exam: eligibility, age relaxation and fees are calculated automatically.

The platform then runs the rest of the recruitment cycle:

- **Exam day:** shifts, centre-desk QR entry and roll sheets, observers, biometric alerts and technical exceptions.
- **Conducting agencies:** a data gateway (file upload or API key) for CBT responses, OMR reads, attendance and biometric alerts.
- **Assessment:** answer keys with paid objections and an item-analysis pre-review, scoring with negative marking, normalisation across shifts, and cut-offs.
- **Results:** anomaly flags, maker-checker approval and publishing.
- **Selection:** debarment, interview panels and 80:20 final merit, then preference-based allotment and document verification.
- **Helpdesk:** web tickets, a chat assistant, an IVR menu and logged phone calls, plus a full journey trace for every candidate.

| Part | Path | Stack |
|---|---|---|
| Candidate portal (mobile-first, EN/HI) | `apps/candidate-web` | React 18, Vite, Tailwind, TanStack Query, RHF + Zod, i18next |
| Staff console (RBAC + TOTP; field workspaces are mobile-friendly) | `apps/admin-web` | React 18, Vite, Recharts, jsQR |
| API + worker | `apps/api` | NestJS 11, Prisma 6, PostgreSQL 16, Redis 7, BullMQ, MinIO/S3, Chromium PDFs |
| Design system | `packages/ui` | VTL tokens, components, `LivePhotoCapture` (MediaPipe), `SignaturePad` |
| Shared rules | `packages/shared` | Zod schemas, eligibility, age relaxation, fee matrix, OTR ID |

Screenshots of the lifecycle screens: [`docs/screenshots/lifecycle`](docs/screenshots/lifecycle).

Docs: **[Try it in GitHub Codespaces](docs/CODESPACES.md)** · **[Deploy on a server](docs/DEPLOYMENT.md)** · [Plan](docs/PLAN.md) · [Architecture and data model](docs/ARCHITECTURE.md) · [API](docs/API.md) (live OpenAPI at `/api/docs`) · [Assumptions](docs/ASSUMPTIONS.md) · [Brief](docs/BRIEF.md)

---

## Quick start with Docker (run it on your own computer)

You need **Git** and **Docker Desktop** (Windows or macOS) or Docker Engine with the Compose plugin (Linux). Give Docker at least 4 GB of memory. Nothing else is required.

```bash
git clone https://github.com/bharatkalia-bk/VTL-OTR.git
```

```bash
cd VTL-OTR
```

```bash
git checkout claude/intelligent-wright-gsglml
```

```bash
docker compose up --build -d
```

The first build downloads and compiles everything (about 5 to 15 minutes). Then load the demo data:

```bash
docker compose --profile seed run --rm seed
```

| Service | URL |
|---|---|
| Homepage and candidate portal | http://localhost:5173 |
| Staff console (all staff roles) | http://localhost:5174 |
| API docs (Swagger) | http://localhost:4000/api/docs |
| Mailpit (all emails sent) | http://localhost:8025 |
| OTPs for new registrations | http://localhost:5173/demo-inbox |

No `.env` file is needed: the local stack uses built-in development-only keys. Files are stored in a Docker volume. Stop with `docker compose down`; add `-v` to also delete the data. To update later: `git pull`, then the `up --build -d` command again (re-run the seed only if you want fresh demo data; it erases everything).

The camera needs a **secure context**. `localhost` counts as secure. To test on a phone over the LAN, serve the app over HTTPS (for example behind a TLS reverse proxy).

## Local development (without Docker)

Requirements: Node 22, pnpm 10, PostgreSQL 16, Redis 7, Python 3 (only to regenerate the E2E camera clip).

```bash
pnpm install
```

```bash
cp .env.example apps/api/.env   # then fill the five secrets with `openssl rand -base64 32`
```

```bash
pnpm --filter @vtl/api prisma:migrate && pnpm --filter @vtl/api build && pnpm db:seed
```

```bash
pnpm dev   # API :4000 (with in-process worker), candidate :5173, admin :5174
```

Without MinIO, `STORAGE_DRIVER=fs` stores files under `apps/api/.storage` and serves them through HMAC-signed, expiring URLs. With MinIO or S3 (`STORAGE_DRIVER=s3`) the bucket stays private and the API issues pre-signed URLs.

### Seeded accounts (development only)

| Who | Login | Password | 2FA |
|---|---|---|---|
| Super Admin | `superadmin@vtl-otr.local` | `Admin@12345` | TOTP secret `KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD` |
| Exam Admin / Verifier / Helpdesk / Auditor | `examadmin@` `verifier@` `helpdesk@` `auditor@` (`vtl-otr.local`) | `Admin@12345` | same secret |
| Second Exam Admin (approves results: maker-checker) | `examadmin2@vtl-otr.local` | `Admin@12345` | same secret |
| Centre Superintendent (CHSL centres in Patna) | `centre@vtl-otr.local` | `Admin@12345` | same secret |
| Observer (CHSL, one centre declared, one pending) | `observer@vtl-otr.local` | `Admin@12345` | same secret |
| Conducting Agency | `agency@vtl-otr.local` | `Admin@12345` | same secret |
| Interview Panel members | `panel@vtl-otr.local`, `panel2@vtl-otr.local` | `Admin@12345` | same secret |
| New verifier (shows mandatory TOTP enrolment) | `newverifier@vtl-otr.local` | `Admin@12345` | enrols on first login |
| Candidates 01 to 50 | `candidate01@example.in` … `candidate50@example.in` | `Candidate@123` | n/a |

Add the TOTP secret to any authenticator app, or print the current code with `node -e "console.log(require('otplib').authenticator.generate('KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD'))"` (run it from `apps/api`).

The seed creates 5 exams:

| Exam | State |
|---|---|
| CGL | Open |
| Women-only UP-domicile exam | Open |
| CHSL | Exam held, provisional answer key published, objection window open (one question has a planted wrong key that the pre-review flags) |
| Junior Engineer 2025 | Complete: Tier 1, interview and 80:20 final merit published, allotment done, DV in progress |
| Section Officer 2026 | Tier 1 published, today's interviews waiting for panel marks |

The seed also creates 50 candidates in different states (drafts at each wizard step, submitted, blocked, one duplicate-photo pair), applications with paid, failed and pending payments, correction requests and helpdesk tickets.

In development, `DEV_EXPOSE_SECRETS=true` lets you read OTPs, captcha answers and mock messages at `/api/v1/dev/*`. The API refuses to boot with this flag in production.

## Tests

| Command | What |
|---|---|
| `pnpm test` | Unit tests (shared rules including scoring, normalisation, merit, allotment, anomaly detection; image pipeline; face checks; JPEG handling) and API integration tests against real Postgres and Redis, including the whole exam lifecycle end to end (`vtl_otr_test` database; queues run inline) |
| `pnpm test:e2e` | Playwright: full journey register → OTP → profile → **live photo via fake camera** → submit → apply → pay → admin releases → download admit card; axe WCAG 2.1 AA scans; 360px layout; Hindi toggle |
| `pnpm lint` / `pnpm typecheck` | ESLint (no `any`), strict TypeScript |
| `node scripts/check-i18n.mjs apps/candidate-web` | EN/HI key parity and no undefined keys |

The camera E2E test runs Chromium with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=face.y4m`. The clip is generated by `scripts/make_face_video.py` from a public-domain NASA portrait and simulates a slight head turn, so the real MediaPipe face checks and head-turn liveness run end to end. The E2E environment restricts liveness to `HEAD_TURN` because the synthetic clip cannot blink.

## Roles and where they sign in

The homepage has a **Sign in to your portal** section. Candidates use the candidate portal. Every staff role signs in to the staff console and lands on its own workspace:

| Role | Lands on | Can do |
|---|---|---|
| Super Admin, Exam Admin, Auditor | Dashboard | Everything in the console (Auditor read-only); results need a second officer to approve |
| Verifier | Dashboard | Documents, corrections, duplicates, debarment proposals, DV desk |
| Helpdesk Agent | Dashboard | Tickets (web, chat, IVR, phone), IVR log, journey trace |
| Centre Superintendent | Centre desk | Scan admit-card QR, compare photo, mark attendance, roll sheet PDF, close gate, report exceptions (only their centres) |
| Observer | Observer app | Conflict-of-interest declaration, checklist and incident reports that queue offline and sync later |
| Conducting Agency | Agency gateway | Upload CSVs, manage API keys, see submission results (only their exams) |
| Interview Panel | Interview panel | Their candidates only, with no category data; award marks, AI brief |

Field staff scopes (centres, exams, home district) are set by a Super Admin under *Staff users → Scope*.

## AI assist

`AI_PROVIDER=mock` (default) gives deterministic, rule-based results with no network calls:

| Feature | Rule-based result |
|---|---|
| Chat assistant | Answers from the helpdesk knowledge base |
| Objection pre-review | Classical item analysis: top vs bottom scorers, difficulty, discrimination |
| DV checks | Discrepancy checks |
| Interview brief | Neutral brief from the education record |

`AI_PROVIDER=claude` with `ANTHROPIC_API_KEY` adds Claude-written summaries on top, through the official Anthropic SDK. The model is set by `AI_MODEL` and defaults to `claude-opus-5-5`. If a request fails, the rule-based result is used. AI output is always advisory: a person makes every decision.

## Live photo capture (non-negotiable rule)

The photograph is taken **only** through the device camera (`<LivePhotoCapture />` in `packages/ui`). There is no file input anywhere in the photo path. The browser runs the MediaPipe FaceLandmarker (self-hosted WASM and model, no CDN) and checks for exactly one face, centring, face size, brightness, a Laplacian blur check, and a blink or head-turn liveness challenge. It then counts down 3-2-1 and crops to 3.5:4.5 at 350×450, compressing to 20 to 50 KB, with an optional name/date strip.

The server only accepts a photo that comes with a single-use capture session token, issued when the camera started. It checks the real JPEG magic bytes, decodes the image, checks dimensions and size, strips EXIF and other metadata without re-encoding, and stores the photo with a SHA-256 hash. Photo hashes reused across candidates are flagged. The retake limit is enforced server-side. After OTR submission the photo is locked and can only be changed through an approved correction.

## Brand

Colours are defined once in `packages/ui/src/styles/tokens.css` and exposed through the Tailwind preset; components never hard-code hex. Brand orange `#EC4119` with white text is 3.9:1, below WCAG AA for body-size text, so filled CTAs use the derived `orange-600` (5.3:1) and pure orange is used for accents, focus rings and progress. `/styleguide` in the candidate app shows every component, including the camera. Logo variants and favicons are generated by `scripts/brand_assets.py`.
