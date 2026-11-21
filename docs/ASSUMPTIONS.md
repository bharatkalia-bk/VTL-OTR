# Assumptions

Reasonable defaults for an Indian government recruitment context, made where the brief is silent or ambiguous. Each one is configurable unless noted.

| # | Area | Assumption |
|---|---|---|
| 1 | Logo | `brand/vtl-logo.png` (497x123 px) is taken from the image supplied with the brief. A higher-resolution or SVG master is preferred for print (admit card, PDFs). |
| 2 | OTR ID | Format `VTL-OTR-{YEAR}-{7-digit sequence}{Verhoeff check digit}`, e.g. `VTL-OTR-2026-00001236`. Verhoeff is chosen because it catches all single-digit and adjacent-transposition errors (same scheme as Aadhaar). The year is the year of final submission. |
| 3 | Candidate login | Password login (OTR ID, mobile or email + password + captcha) plus an OTP-only login option. Password is set after mobile and email OTP verification during registration. |
| 4 | Captcha | Self-hosted SVG captcha (no third-party service, so no candidate data leaves the system). OTP verification is the primary bot barrier; captcha protects OTP send and login endpoints. |
| 5 | OTP | 6 digits, 10 minute validity, max 5 verify attempts, max 3 sends per 15 minutes per target, 30 s resend cooldown. Stored hashed in Redis. |
| 6 | Account lockout | 5 failed logins lock the account for 30 minutes; admins can unlock. |
| 7 | Categories | GEN (UR), EWS, OBC (Non-Creamy Layer), SC, ST. PwD is an attribute, not a category (types per RPwD Act 2016 benchmark disabilities, minimum 40%). |
| 8 | Default age relaxation | OBC 3 years, SC/ST 5, PwD 10 (13 for OBC, 15 for SC/ST), ex-serviceman: military service + 3 years. Overridable per post. Age computed as on the exam's cut-off date, boundaries inclusive. |
| 9 | Default fee | GEN/EWS/OBC male: Rs 100. Women, SC, ST, PwD, ex-servicemen: exempt. Seeded as a fee matrix, editable per exam. Fees treated as inclusive of charges. |
| 10 | Photo | Defaults from the brief (350x450, 20 to 50 KB, JPEG, name/date strip on). Liveness is a single random challenge (blink or slight head turn). Retake limit 5. The live-capture-only rule is enforced client side (no file input) and server side (single-use capture session token plus metadata). |
| 11 | Signature | 140x60 px, 10 to 20 KB JPEG, drawn or uploaded. Signature upload is allowed because the brief allows it; photo upload is not. |
| 12 | Documents | PDF only for certificates, max 500 KB each (configurable); JPEG allowed for helpdesk attachments. |
| 13 | Locked fields after submission | Name, father's/mother's name, DOB, gender, category/PwD/ex-serviceman, photo, signature. Address and email editable with OTP; mobile change needs a correction request. |
| 14 | Aadhaar | Only a masked number (last 4 digits) and the e-KYC reference token are stored. Aadhaar verification is optional and never mandatory for registration. |
| 15 | Name search in admin | Names are encrypted at rest; admin name search uses a normalised, salted token index (exact and prefix on tokens), not full-text over plaintext. |
| 16 | Results | Only display of a published status/score per application. Result processing (marks, merit lists) is out of scope. |
| 17 | Exam centres | Allocation by candidate's city preference order, then capacity, ordered by application submission time; ties broken by application number. Manual override always wins. |
| 18 | SMS | Templates carry a DLT template id field (TRAI requirement) even though the mock adapter ignores it. |
| 19 | Data retention | Draft (unsubmitted) registrations purged after 180 days of inactivity; submitted OTR profiles retained until withdrawn; audit logs 7 years. All configurable. |
| 20 | Hindi | UI strings fully translated; candidate-entered data (names, addresses) captured in English (Roman script) as recruitment boards typically require, with Hindi labels. |
| 21 | Browsers | Latest two versions of Chrome, Edge, Firefox; Safari iOS/macOS 15+; Android Chrome. |
| 22 | Time zone | All dates shown and computed in IST (Asia/Kolkata); stored as UTC. |
| 23 | Brand contrast | Brand orange `#EC4119` with white text is 3.9:1 (fails WCAG AA for body text). Filled CTAs use the derived `orange-600` `#C9330F` (5.3:1); pure brand orange is kept for accents, focus rings, progress and icons. Status badges use darker `*-700` text tokens for AA. |
| 24 | Duplicate identity | Exact name + DOB + father's-name matches are **blocked at registration** (with Forgot OTR ID guidance). Matches created later by profile edits are **flagged** for admin review rather than blocked. |
| 25 | Liveness | One random challenge per capture from the configured set (`BLINK`, `HEAD_TURN`; setting `livenessMethods`). The E2E environment uses `HEAD_TURN` only because the synthetic camera clip cannot blink. Liveness is a deterrent, not proof; the server also requires a single-use capture session issued when the camera starts. |
| 26 | Minimum file size | A 140×60 signature is naturally under 10 KB. To meet the 10 to 20 KB rule the client encodes at quality 1.0 (4:4:4 chroma) and, only if still undersized, adds a faint per-channel paper grain (≤12/255). The server enforces the size range on the stored bytes after lossless metadata stripping. |
| 27 | Post-submission edits | Education stays editable after submission (results are often declared later) and is audited. Email changes need OTP on the registered mobile and the new email. Address changes after submission go through the contact-change flow (OTP). Mobile number changes need an approved correction request. |
| 28 | Photo/signature correction | Approving a PHOTO or SIGNATURE correction unlocks one new live capture (30 days); the new image replaces the old one and both are kept in history. |
| 29 | Admin language | The admin console is English-only (staff-facing). All candidate-facing text is bilingual (581 keys, parity checked in CI). |
| 30 | Payments | Fees are inclusive of charges. Abandoned checkouts are marked FAILED after 24 hours by reconciliation. A second successful payment for an already-paid application is recorded and flagged `DUPLICATE_PAYMENT` for refund. |
| 31 | Roll numbers | `<rollNoPrefix><YY><city index 2d><serial 5d>`, allocated in submission order; manual centre overrides survive re-allocation; released cards are never re-numbered. |
| 32 | Results | Results are computed in the platform from response sheets and the final key (see 37 to 40). The older JSON publish endpoint remains for exams whose marks are processed elsewhere. |
| 33 | Districts master | Seed includes all 36 States/UTs (EN/HI) with principal districts. The complete LGD district list can be loaded through the admin masters API. |
| 34 | Dev-only conveniences | Seeded admins share a documented TOTP secret, and `/api/v1/dev/*` exposes OTPs and captcha answers when `DEV_EXPOSE_SECRETS=true`. The API refuses to start with that flag in production. |
| 35 | Storage without MinIO | `STORAGE_DRIVER=fs` (default for local runs) stores files on disk and serves them through HMAC-signed expiring URLs; `s3` is used with MinIO in Docker and S3-compatible storage in production. |
| 36 | Test camera fixture | `scripts/make_face_video.py` builds the Chromium fake-camera clip from a public-domain NASA portrait (Eileen Collins, via scikit-image) with a simulated head turn. The generated `.y4m` (≈40 MB) is not committed; it is regenerated on demand. |
| 37 | Normalisation | Equipercentile across shifts of a stage: each raw score maps to the base-shift score at the same percentile (linear interpolation). The base shift is the largest unless chosen. Percentile = share of candidates at or below, 7 decimals. |
| 38 | Negative marking and keys | Per-shift scheme (marks per correct, deduction per wrong). Multiple correct options allowed. A dropped question gives everyone full marks. |
| 39 | Objections | Fee per question (exam setting, default ₹100) paid through the same gateway and reconciliation as fees. It is marked refundable when the objection is accepted. Decisions are per question and apply to all objections on it. |
| 40 | Cut-offs and merit | Cut-offs are entered per category (PwD overrides category). Ties are broken by higher written score, then older candidate, then name. Final merit = written% × written weight + interview% × interview weight (default 80:20 when an interview stage exists). |
| 41 | Maker-checker | Results and debarments need a second officer: whoever computed or proposed cannot approve. Publishing, key publication, allotment and agency keys need TOTP step-up. |
| 42 | Withheld results | Withheld when a biometric alert is confirmed, a debarment is active, or a re-exam is pending for the candidate. |
| 43 | Shortlisting | For each category: seats × multiplier (default 3). The unreserved list is on merit across all categories first, then each reserved list by category rank. |
| 44 | Allotment | Merit-cum-preference: reserved-category candidates take an unreserved seat on merit when one is available, otherwise a seat of their category. Accepted seats are kept between rounds; declined seats return to the pool. |
| 45 | Observers | Conflict of interest is screened automatically (home district equal to centre district; candidates at the centre sharing the observer's surname). Reports are blocked until the observer declares. Offline reports carry a client id, so re-sync never duplicates. |
| 46 | Agency data | CSV header `rollNo` plus `Q1…Qn` columns for responses. A payload identical to an earlier one (same SHA-256) is not imported again. Rows with unknown roll numbers are rejected individually. |
| 47 | Interview panels | Panel members see their own candidates only: name, photo and education, never category. Marks lock once the interview result leaves draft. The interview score is the mean of member totals. |
| 48 | Thumb impression and declaration | Optional scanned JPEG uploads (unlike the photo, these may be scans). Thumb 200 to 800 px, 10 to 100 KB. Handwritten declaration 600×300 to 2400×1600 px, 50 to 300 KB. |
| 49 | Local language | A post may require knowledge of listed languages; candidates domiciled in listed states are deemed to know it. Candidates declare languages in the Category step. |
| 50 | IVR | `/api/v1/ivr` is the webhook a telephony provider calls per keypress (caller number + digits). Callers are identified by the mobile blind index. The public *Helpline* page lets anyone try the same menu. |
| 51 | AI | AI output is advisory and logged. With `AI_PROVIDER=mock` no data leaves the server. With `claude`, only the text needed for the task is sent, never Aadhaar, contact details or documents. |
