# VTL OTR API

Base URL: `/api/v1`. Interactive docs (Swagger UI) at **`/api/docs`**; the machine-readable spec is committed as [`openapi.json`](./openapi.json) and served at `/api/docs/openapi.json`.

## Conventions

- **Auth**: httpOnly cookies. Candidates: `vtl_at` (15 min JWT) + `vtl_rt` (rotating refresh, path `/api/v1/auth`). Admins: `vtl_adm_at` + `vtl_adm_rt`. Refresh-token reuse revokes the whole session family.
- **CSRF**: double-submit. `GET /auth/csrf` sets `vtl_csrf`; every non-GET request must send the same value in `X-CSRF-Token`. Gateway callbacks are exempt and verified by HMAC signature instead.
- **Admin 2FA**: sessions are partial until `POST /admin/auth/totp/verify`. Sensitive actions (correction approval, admit-card release, manual payment verification, refund marker, bulk campaigns, exports, settings, user management) also need `X-TOTP-Code` (step-up, valid 5 minutes).
- **Validation**: bodies are validated with the shared Zod schemas from `packages/shared`. Errors: `{ code, message, issues?: [{ path, message }], requestId }`.
- **Pagination**: list endpoints are keyset-paginated: `?cursor=<id>&limit=<1..100>` → `{ items, nextCursor }`.
- **Rate limits** (Redis): OTP sends 3 per 15 min per target with a 30 s cooldown, 5 verify attempts; login 50 per 15 min per IP and 20 per identifier; account lockout after 5 failures for 30 min.
- **Files**: never public. Downloads go through short-lived signed URLs (MinIO/S3 pre-signed, or HMAC-signed `/files` for the filesystem driver) after an ownership or role check.
- **Dev only**: `/dev/otp`, `/dev/captcha/:id`, `/dev/ekyc/:txn`, `/dev/messages` exist only with `DEV_EXPOSE_SECRETS=true`, which the API refuses in production.

## Endpoints

### Health

| Method | Path |
|---|---|
| GET | `/health/live` |
| GET | `/health/ready` |

### Public

| Method | Path |
|---|---|
| GET | `/captcha` |
| GET | `/files` |
| GET | `/public/config` |
| GET | `/public/exams` |
| GET | `/public/masters/{type}` |
| GET | `/verify/admit/{token}` |
| GET | `/verify/public-key` |

### Candidate auth

| Method | Path |
|---|---|
| GET | `/auth/csrf` |
| POST | `/auth/forgot/otr-id` |
| POST | `/auth/forgot/password/request` |
| POST | `/auth/forgot/password/reset` |
| POST | `/auth/login` |
| POST | `/auth/login/otp/request` |
| POST | `/auth/login/otp/verify` |
| POST | `/auth/logout` |
| GET | `/auth/me` |
| POST | `/auth/refresh` |
| POST | `/auth/register/password` |
| POST | `/auth/register/resend` |
| POST | `/auth/register/start` |
| POST | `/auth/register/verify` |

### Candidate profile

| Method | Path |
|---|---|
| POST | `/me/contact/change/request` |
| POST | `/me/contact/change/verify` |
| GET | `/me/corrections` |
| POST | `/me/corrections` |
| POST | `/me/documents` |
| DELETE | `/me/documents/{id}` |
| GET | `/me/documents/{id}/url` |
| POST | `/me/identity/aadhaar/initiate` |
| POST | `/me/identity/aadhaar/verify` |
| POST | `/me/identity/apaar` |
| POST | `/me/identity/digilocker/connect` |
| POST | `/me/language` |
| GET | `/me/notifications` |
| POST | `/me/notifications/read-all` |
| GET | `/me/otr-slip.pdf` |
| POST | `/me/photo` |
| POST | `/me/photo/attempts` |
| POST | `/me/photo/session` |
| GET | `/me/profile` |
| PUT | `/me/profile/address` |
| PUT | `/me/profile/category` |
| PUT | `/me/profile/declaration` |
| PUT | `/me/profile/education` |
| PUT | `/me/profile/personal` |
| POST | `/me/signature` |
| POST | `/me/submit` |

### Exams & applications

| Method | Path |
|---|---|
| GET | `/applications` |
| POST | `/applications` |
| GET | `/applications/{id}` |
| DELETE | `/applications/{id}` |
| GET | `/applications/{id}/admit-card.pdf` |
| GET | `/applications/{id}/form.pdf` |
| POST | `/applications/{id}/submit` |
| GET | `/exams` |
| GET | `/exams/{id}` |

### Payments

| Method | Path |
|---|---|
| POST | `/applications/{id}/payments` |
| GET | `/payments/by-txn/{txn}` |
| POST | `/payments/callback/{gateway}` |
| GET | `/payments/{id}/receipt.pdf` |

### Helpdesk

| Method | Path |
|---|---|
| POST | `/helpdesk/attachments` |
| POST | `/helpdesk/public-tickets` |
| GET | `/helpdesk/tickets` |
| POST | `/helpdesk/tickets` |
| GET | `/helpdesk/tickets/{id}` |
| POST | `/helpdesk/tickets/{id}/messages` |

### Admin admit cards

| Method | Path |
|---|---|
| PUT | `/admin/admit-cards/{id}/centre` |

### Admin audit

| Method | Path |
|---|---|
| GET | `/admin/audit-logs` |
| GET | `/admin/audit-logs/{id}` |

### Admin auth

| Method | Path |
|---|---|
| POST | `/admin/auth/login` |
| POST | `/admin/auth/logout` |
| GET | `/admin/auth/me` |
| POST | `/admin/auth/refresh` |
| POST | `/admin/auth/totp/enrol` |
| POST | `/admin/auth/totp/verify` |

### Admin candidates

| Method | Path |
|---|---|
| GET | `/admin/candidates` |
| GET | `/admin/candidates/{id}` |
| POST | `/admin/candidates/{id}/block` |
| POST | `/admin/candidates/{id}/unblock` |
| GET | `/admin/corrections` |
| POST | `/admin/corrections/{id}/approve` |
| POST | `/admin/corrections/{id}/reject` |
| GET | `/admin/documents` |
| POST | `/admin/documents/{id}/approve` |
| POST | `/admin/documents/{id}/reject` |
| GET | `/admin/documents/{id}/url` |
| GET | `/admin/duplicates` |
| POST | `/admin/duplicates/{id}/resolve` |

### Admin communication

| Method | Path |
|---|---|
| GET | `/admin/comms/campaigns` |
| POST | `/admin/comms/campaigns` |
| POST | `/admin/comms/campaigns/preview` |
| GET | `/admin/comms/templates` |
| PUT | `/admin/comms/templates` |

### Admin dashboard

| Method | Path |
|---|---|
| GET | `/admin/dashboard` |

### Admin exams

| Method | Path |
|---|---|
| GET | `/admin/exams` |
| POST | `/admin/exams` |
| GET | `/admin/exams/{id}` |
| PUT | `/admin/exams/{id}` |
| GET | `/admin/exams/{id}/admit-cards` |
| POST | `/admin/exams/{id}/admit-cards/allocate` |
| POST | `/admin/exams/{id}/admit-cards/generate` |
| POST | `/admin/exams/{id}/admit-cards/release` |
| GET | `/admin/exams/{id}/admit-cards/summary` |
| POST | `/admin/exams/{id}/centre-cities` |
| PUT | `/admin/exams/{id}/centre-cities/{cityId}` |
| PUT | `/admin/exams/{id}/fee-rules` |
| POST | `/admin/exams/{id}/posts` |
| PUT | `/admin/exams/{id}/posts/{postId}` |
| DELETE | `/admin/exams/{id}/posts/{postId}` |
| POST | `/admin/exams/{id}/status` |

### Admin helpdesk

| Method | Path |
|---|---|
| GET | `/admin/tickets` |
| GET | `/admin/tickets/{id}` |
| POST | `/admin/tickets/{id}/assign` |
| POST | `/admin/tickets/{id}/reply` |
| POST | `/admin/tickets/{id}/status` |

### Admin masters

| Method | Path |
|---|---|
| POST | `/admin/masters/{type}` |
| DELETE | `/admin/masters/{type}/{id}` |

### Admin payments

| Method | Path |
|---|---|
| GET | `/admin/payments` |
| POST | `/admin/payments/reconcile` |
| GET | `/admin/payments/{id}` |
| POST | `/admin/payments/{id}/refund-marker` |
| POST | `/admin/payments/{id}/verify` |

### Admin reports

| Method | Path |
|---|---|
| GET | `/admin/reports` |
| POST | `/admin/reports` |
| GET | `/admin/reports/{id}/download` |

### Admin results

| Method | Path |
|---|---|
| POST | `/admin/exams/{id}/results` |

### Admin settings

| Method | Path |
|---|---|
| GET | `/admin/settings` |
| PUT | `/admin/settings` |

### Admin users

| Method | Path |
|---|---|
| GET | `/admin/users` |
| POST | `/admin/users` |
| PUT | `/admin/users/{id}` |
| POST | `/admin/users/{id}/reset-totp` |

## Typical flows

**Registration**: `GET /captcha` → `POST /auth/register/start` (sends mobile + email OTP) → `POST /auth/register/verify` → `POST /auth/register/password` (session issued).

**Live photo**: `POST /me/photo/session` (single-use capture token, issued when the camera starts) → `POST /me/photo/attempts` per capture → `POST /me/photo` (multipart `file` + `meta` JSON with the session id, liveness and face scores). The server checks the JPEG magic bytes, decodes the image, checks dimensions and the 20 to 50 KB size range, strips EXIF losslessly, stores a SHA-256 hash and flags duplicates.

**OTR**: complete the `PUT /me/profile/*` steps (`{ data, final }`; `final:false` auto-saves) → `PUT /me/profile/declaration` → `POST /me/submit` → `{ otrId }`; slip at `GET /me/otr-slip.pdf`.

**Apply and pay**: `GET /exams` (eligibility per post) → `POST /applications` (draft) → `POST /applications/:id/submit` → `POST /applications/:id/payments` → gateway redirect → signed S2S `POST /payments/callback/:gateway` (idempotent) → `GET /payments/by-txn/:txn`. Pending payments are reconciled every 5 minutes.

**Admit cards**: `POST /admin/exams/:id/admit-cards/allocate` → `/generate` (queued PDFs) → `/release` (step-up) → candidate `GET /applications/:id/admit-card.pdf`. The QR code links to `GET /verify/admit/:token` (Ed25519-signed; public key at `GET /verify/public-key`).
