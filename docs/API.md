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

226 operations, grouped by tag. Field roles (centre superintendent, observer, agency, interview panel) reach only their own workspace routes.

### Health

| Method | Path |
|---|---|
| GET | `/health/live` |
| GET | `/health/ready` |

### Public

| Method | Path |
|---|---|
| GET | `/captcha` |
| GET | `/public/config` |
| GET | `/public/exams` |
| GET | `/public/masters/{type}` |
| GET | `/verify/admit/{token}` |
| GET | `/verify/public-key` |
| GET | `/files` |

### Candidate auth

| Method | Path |
|---|---|
| GET | `/auth/csrf` |
| POST | `/auth/register/start` |
| POST | `/auth/register/resend` |
| POST | `/auth/register/verify` |
| POST | `/auth/register/password` |
| POST | `/auth/login` |
| POST | `/auth/login/otp/request` |
| POST | `/auth/login/otp/verify` |
| POST | `/auth/forgot/otr-id` |
| POST | `/auth/forgot/password/request` |
| POST | `/auth/forgot/password/reset` |
| POST | `/auth/refresh` |
| POST | `/auth/logout` |
| GET | `/auth/me` |

### Candidate profile

| Method | Path |
|---|---|
| GET | `/me/profile` |
| PUT | `/me/profile/personal` |
| PUT | `/me/profile/category` |
| PUT | `/me/profile/address` |
| PUT | `/me/profile/education` |
| PUT | `/me/profile/declaration` |
| POST | `/me/documents` |
| GET | `/me/documents/{id}/url` |
| DELETE | `/me/documents/{id}` |
| POST | `/me/photo/session` |
| POST | `/me/photo/attempts` |
| POST | `/me/photo` |
| POST | `/me/signature` |
| POST | `/me/identity/aadhaar/initiate` |
| POST | `/me/identity/aadhaar/verify` |
| POST | `/me/identity/digilocker/connect` |
| POST | `/me/identity/apaar` |
| POST | `/me/submit` |
| GET | `/me/otr-slip.pdf` |
| POST | `/me/contact/change/request` |
| POST | `/me/contact/change/verify` |
| GET | `/me/corrections` |
| POST | `/me/corrections` |
| GET | `/me/notifications` |
| POST | `/me/notifications/read-all` |
| POST | `/me/language` |

### Exams & applications

| Method | Path |
|---|---|
| GET | `/exams` |
| GET | `/exams/{id}` |
| GET | `/applications` |
| POST | `/applications` |
| GET | `/applications/{id}` |
| DELETE | `/applications/{id}` |
| POST | `/applications/{id}/submit` |
| GET | `/applications/{id}/form.pdf` |
| GET | `/applications/{id}/admit-card.pdf` |

### Payments

| Method | Path |
|---|---|
| POST | `/applications/{id}/payments` |
| GET | `/payments/by-txn/{txn}` |
| GET | `/payments/{id}/receipt.pdf` |
| POST | `/payments/callback/{gateway}` |

### Helpdesk

| Method | Path |
|---|---|
| POST | `/helpdesk/public-tickets` |
| POST | `/helpdesk/attachments` |
| GET | `/helpdesk/tickets` |
| POST | `/helpdesk/tickets` |
| GET | `/helpdesk/tickets/{id}` |
| POST | `/helpdesk/tickets/{id}/messages` |

### Admin auth

| Method | Path |
|---|---|
| POST | `/admin/auth/login` |
| POST | `/admin/auth/totp/enrol` |
| POST | `/admin/auth/totp/verify` |
| POST | `/admin/auth/refresh` |
| POST | `/admin/auth/logout` |
| POST | `/admin/auth/password` |
| GET | `/admin/auth/me` |

### Admin users

| Method | Path |
|---|---|
| GET | `/admin/users` |
| POST | `/admin/users` |
| PUT | `/admin/users/{id}` |
| POST | `/admin/users/{id}/reset-totp` |

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
| POST | `/admin/exams/{id}/status` |
| POST | `/admin/exams/{id}/posts` |
| PUT | `/admin/exams/{id}/posts/{postId}` |
| DELETE | `/admin/exams/{id}/posts/{postId}` |
| PUT | `/admin/exams/{id}/fee-rules` |
| POST | `/admin/exams/{id}/centre-cities` |
| PUT | `/admin/exams/{id}/centre-cities/{cityId}` |
| GET | `/admin/exams/{id}/admit-cards/summary` |
| GET | `/admin/exams/{id}/admit-cards` |
| POST | `/admin/exams/{id}/admit-cards/allocate` |
| POST | `/admin/exams/{id}/admit-cards/generate` |
| POST | `/admin/exams/{id}/admit-cards/release` |

### Admin admit cards

| Method | Path |
|---|---|
| PUT | `/admin/admit-cards/{id}/centre` |

### Admin candidates

| Method | Path |
|---|---|
| GET | `/admin/candidates` |
| GET | `/admin/candidates/{id}` |
| POST | `/admin/candidates/{id}/block` |
| POST | `/admin/candidates/{id}/unblock` |
| GET | `/admin/documents` |
| GET | `/admin/documents/{id}/url` |
| POST | `/admin/documents/{id}/approve` |
| POST | `/admin/documents/{id}/reject` |
| GET | `/admin/duplicates` |
| POST | `/admin/duplicates/{id}/resolve` |
| GET | `/admin/corrections` |
| POST | `/admin/corrections/{id}/approve` |
| POST | `/admin/corrections/{id}/reject` |

### Admin payments

| Method | Path |
|---|---|
| GET | `/admin/payments` |
| GET | `/admin/payments/{id}` |
| POST | `/admin/payments/reconcile` |
| POST | `/admin/payments/{id}/verify` |
| POST | `/admin/payments/{id}/refund-marker` |

### Admin communication

| Method | Path |
|---|---|
| GET | `/admin/comms/templates` |
| PUT | `/admin/comms/templates` |
| GET | `/admin/comms/campaigns` |
| POST | `/admin/comms/campaigns` |
| POST | `/admin/comms/campaigns/preview` |

### Admin reports

| Method | Path |
|---|---|
| GET | `/admin/reports` |
| POST | `/admin/reports` |
| GET | `/admin/reports/{id}/download` |

### Admin audit

| Method | Path |
|---|---|
| GET | `/admin/audit-logs` |
| GET | `/admin/audit-logs/{id}` |

### Admin masters

| Method | Path |
|---|---|
| POST | `/admin/masters/{type}` |
| DELETE | `/admin/masters/{type}/{id}` |

### Admin settings

| Method | Path |
|---|---|
| GET | `/admin/settings` |
| PUT | `/admin/settings` |

### Admin helpdesk

| Method | Path |
|---|---|
| GET | `/admin/tickets` |
| GET | `/admin/tickets/{id}` |
| POST | `/admin/tickets/{id}/reply` |
| POST | `/admin/tickets/{id}/status` |
| POST | `/admin/tickets/{id}/assign` |

### Admin results

| Method | Path |
|---|---|
| POST | `/admin/exams/{id}/results` |

### Exam day

| Method | Path |
|---|---|
| GET | `/admin/exams/{id}/shifts` |
| POST | `/admin/exams/{id}/shifts` |
| PUT | `/admin/exams/{id}/shifts/{shiftId}` |
| POST | `/admin/exams/{id}/shifts/assign` |
| GET | `/admin/centre/centres` |
| POST | `/admin/centre/lookup` |
| POST | `/admin/centre/attendance` |
| GET | `/admin/centre/centres/{centreId}/roster` |
| POST | `/admin/centre/centres/{centreId}/close` |
| GET | `/admin/centre/centres/{centreId}/roll-sheet` |
| POST | `/admin/centre/centres/{centreId}/exceptions` |
| POST | `/admin/centre/biometric-alerts` |
| GET | `/admin/biometric-alerts` |
| POST | `/admin/biometric-alerts/{id}/review` |
| GET | `/admin/tech-exceptions` |
| POST | `/admin/exams/{id}/tech-exceptions` |
| POST | `/admin/tech-exceptions/{id}/decision` |

### Observers

| Method | Path |
|---|---|
| GET | `/admin/exams/{id}/observers` |
| POST | `/admin/exams/{id}/observers` |
| POST | `/admin/observer-assignments/{id}/waive` |
| DELETE | `/admin/observer-assignments/{id}` |
| GET | `/admin/observer/me` |
| POST | `/admin/observer/assignments/{id}/coi` |
| POST | `/admin/observer/sync` |

### Agency

| Method | Path |
|---|---|
| GET | `/admin/agency/exams` |
| GET | `/admin/agency/keys` |
| POST | `/admin/agency/keys` |
| DELETE | `/admin/agency/keys/{id}` |
| POST | `/admin/agency/exams/{id}/upload` |
| GET | `/admin/agency/submissions` |

### Agency gateway (API key)

| Method | Path |
|---|---|
| GET | `/agency/v1/ping` |
| POST | `/agency/v1/exams/{code}/submissions` |

### Answer keys

| Method | Path |
|---|---|
| GET | `/admin/exams/{id}/papers` |
| PUT | `/admin/shifts/{shiftId}/paper` |
| POST | `/admin/papers/{id}/provisional-key` |
| POST | `/admin/papers/{id}/final-key` |
| GET | `/admin/exams/{id}/objections` |
| POST | `/admin/papers/{id}/questions/{qno}/pre-review` |
| POST | `/admin/papers/{id}/questions/{qno}/decision` |

### Results

| Method | Path |
|---|---|
| GET | `/admin/exams/{id}/result-runs` |
| POST | `/admin/exams/{id}/result-runs` |
| GET | `/admin/exams/{id}/result-runs/{stage}` |
| POST | `/admin/exams/{id}/result-runs/{stage}/submit` |
| POST | `/admin/exams/{id}/result-runs/{stage}/decision` |
| POST | `/admin/exams/{id}/result-runs/{stage}/publish` |
| POST | `/admin/exams/{id}/stage-marks/TIER2` |

### Debarment

| Method | Path |
|---|---|
| GET | `/admin/debarments` |
| POST | `/admin/debarments` |
| POST | `/admin/debarments/{id}/decision` |
| POST | `/admin/debarments/{id}/revoke` |

### Selection

| Method | Path |
|---|---|
| POST | `/admin/exams/{id}/shortlist` |
| GET | `/admin/exams/{id}/stage-calls` |
| POST | `/admin/exams/{id}/stage-calls/{stage}/release` |
| GET | `/admin/exams/{id}/panels` |
| POST | `/admin/exams/{id}/panels` |
| POST | `/admin/exams/{id}/panels/schedule` |
| GET | `/admin/panel/me` |
| POST | `/admin/panel/calls/{id}/marks` |
| POST | `/admin/panel/calls/{id}/absent` |
| GET | `/admin/panel/calls/{id}/brief` |
| GET | `/admin/exams/{id}/vacancies` |
| PUT | `/admin/exams/{id}/vacancies` |
| POST | `/admin/exams/{id}/allotment/run` |
| GET | `/admin/exams/{id}/allotments` |
| POST | `/admin/exams/{id}/dv/schedule` |
| GET | `/admin/exams/{id}/dv` |
| POST | `/admin/dv/{id}/checks` |
| PUT | `/admin/dv/{id}` |

### Helpdesk channels

| Method | Path |
|---|---|
| GET | `/admin/ivr-calls` |
| POST | `/admin/tickets/phone` |
| GET | `/admin/journey/{term}` |
| POST | `/chat` |
| POST | `/chat/{id}/escalate` |
| POST | `/ivr` |

### Staff directory

| Method | Path |
|---|---|
| GET | `/admin/staff` |

### Candidate: exam, results and selection

| Method | Path |
|---|---|
| POST | `/me/media/thumb` |
| POST | `/me/media/declaration` |
| GET | `/me/applications/{id}/response-sheet` |
| POST | `/me/applications/{id}/omr-carbon` |
| POST | `/me/applications/{id}/objections` |
| DELETE | `/me/objections/{id}` |
| POST | `/me/objections/{id}/pay` |
| GET | `/me/results` |
| GET | `/me/applications/{id}/results` |
| GET | `/me/applications/{id}/selection` |
| GET | `/me/applications/{id}/preferences` |
| PUT | `/me/applications/{id}/preferences` |
| POST | `/me/applications/{id}/allotment/accept` |
| POST | `/me/applications/{id}/allotment/decline` |
| GET | `/me/debarments` |
| GET | `/me/applications/{id}/call-letter/{stage}` |

### Agency gateway (server to server)

Agencies authenticate with an `X-Agency-Key` header (created by an AGENCY or EXAM_ADMIN user under *Agency gateway*, shown once, stored as an HMAC). No cookies or CSRF token are used on `/agency/v1/*`.

```bash
curl -X POST https://<api-host>/api/v1/agency/v1/exams/VTL-CHSL-2026/submissions \
  -H "X-Agency-Key: vtl_ak_…" -H "Content-Type: application/json" \
  -d '{"kind":"CBT_RESPONSES","records":[{"rollNo":"CHS260100001","responses":{"1":"A","2":null},"activeMinutes":70}]}'
```

`kind` is one of `CBT_RESPONSES`, `OMR_READS`, `ATTENDANCE`, `BIOMETRIC_ALERTS`, and must be in the key's scopes. The response reports accepted and rejected rows with row-level errors. Sending the same payload again returns the earlier result with `duplicate: true`.
