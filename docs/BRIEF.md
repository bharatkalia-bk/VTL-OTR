# Build Brief: VTL OTR (One Time Registration) Platform

You are building a production-grade **One Time Registration (OTR) platform** as a product of **Vensysco Technologies Limited (VTL)**. It is a government examination registration system: a candidate registers once, gets a permanent **OTR ID**, and reuses that verified profile to apply for any number of recruitment / entrance exams without re-entering data.

Read this whole brief first. Then produce a written implementation plan (`docs/PLAN.md`) with phases, folder structure, data model and API list, and wait for my go-ahead before writing application code. After approval, build phase by phase, and at the end of each phase run the app, run the tests, and give me a short summary of what works.

---

## 1. Branding (VTL brand guidelines)

The logo file is at `./brand/vtl-logo.png` (I will place it there; if it's missing, ask me). Use it in the header, login screens, admit card, emails, PDF receipts and the favicon (crop the "VTL" mark for the favicon / app icon).

**Product name:** VTL OTR, full name "VTL One Time Registration Platform". Footer: "A product of Vensysco Technologies Limited".

**Colour tokens** (sampled from the logo; define once as CSS variables / Tailwind theme, never hard-code hex in components):

| Token | Hex | Use |
|---|---|---|
| `--vtl-navy` | `#07102D` | Primary: header, sidebar, headings, primary text |
| `--vtl-orange` | `#EC4119` | Accent: primary CTAs, active states, progress, focus ring |
| `--vtl-navy-700` | `#1A2350` | Hover / secondary surfaces on navy |
| `--vtl-orange-50` | `#FDEDE8` | Light accent backgrounds, selected rows |
| `--vtl-surface` | `#F6F7FB` | Page background |
| `--vtl-border` | `#E3E6EF` | Borders, dividers |
| `--success` `#16803C`, `--warning` `#B45309`, `--danger` `#B91C1C`, `--info` `#1D4ED8` | | Status only |

Rules:
- Navy dominates, orange is used sparingly (one primary CTA per screen). Orange text on white must meet WCAG AA, so use it for buttons/icons, not body text.
- Typography: **Plus Jakarta Sans** for headings, **Inter** for body and forms, **Noto Sans Devanagari** for Hindi. Tabular numerals for IDs, fees and dates.
- Clean, institutional, trustworthy look (government-grade, not startup-flashy). 8px spacing grid, 8px radius on cards and inputs, subtle shadows only.
- Logo: keep clear space equal to the height of the "V"; never stretch, recolour or place on a busy background. On navy backgrounds use a white-text version (generate it by recolouring the navy wordmark to white while keeping the orange "T").
- Dark mode is not required; light theme only.

---

## 2. Tech stack

- **Monorepo** (pnpm workspaces): `apps/candidate-web`, `apps/admin-web`, `apps/api`, `packages/ui` (shared VTL design system), `packages/shared` (types, Zod schemas, validators).
- **Frontend:** React 18 + TypeScript + Vite, Tailwind CSS with the VTL tokens, shadcn/ui components themed to VTL, React Hook Form + Zod, TanStack Query, React Router, i18next (English + Hindi).
- **Backend:** Node.js + TypeScript, NestJS, Prisma ORM, PostgreSQL, Redis (OTP, rate limits, sessions, queues via BullMQ), MinIO (S3-compatible) for photos and documents.
- **PDFs:** server-side generation for application form, payment receipt and admit card (with QR code).
- **Dev environment:** `docker-compose up` brings up Postgres, Redis, MinIO, Mailpit (email catcher), API and both web apps. Seed script creates sample exams, an admin user and test candidates.
- External integrations are built as **adapter interfaces with mock implementations** (configurable via env) so the system runs end-to-end without real credentials: SMS gateway, email, payment gateway (Razorpay/PayU/SBI ePay style), Aadhaar e-KYC, DigiLocker, APAAR.

---

## 3. Live photo capture (critical feature)

Candidate photograph **must be captured live through the device camera inside the web app**. No file upload, no gallery picker for the photo. Build this as a reusable `<LivePhotoCapture />` component in `packages/ui`.

**Camera handling**
- Use `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })`.
- Show a pre-permission explainer screen ("We need your camera to take your photograph") before the browser prompt.
- Handle every failure state with a clear branded message and recovery steps: permission denied (show browser-specific steps to re-enable), no camera found, camera in use by another app, insecure context (non-HTTPS), unsupported browser.
- If multiple cameras exist, allow switching (`enumerateDevices`). Default to the front camera on mobile.
- Always stop all media tracks when the component unmounts, the user navigates away, or capture completes.
- Works on Chrome, Edge, Firefox, Safari (iOS 15+ and macOS) and Android Chrome. Add `playsInline` and `muted` on the `<video>` for iOS.

**Capture UX**
- Live mirrored preview with an oval face guide overlay and real-time guidance text: "Move closer", "Centre your face", "Too dark", "Hold still", "Only one face should be visible".
- Use **MediaPipe Face Detection (tasks-vision, running in the browser)** for checks before enabling the capture button:
  - exactly one face detected
  - face centred inside the guide and occupying a sensible portion of the frame
  - adequate brightness (average luminance check on the canvas)
  - not blurry (Laplacian variance check)
- Basic liveness: ask the candidate to blink or turn head slightly, detected via landmarks, before capture is allowed. Keep it light and fast.
- 3-2-1 countdown, then capture the frame to a canvas (un-mirrored for the saved image).
- Review screen: show the captured photo with "Retake" and "Use this photo". Limit retakes to a configurable number (default 5) and log each attempt.

**Output spec** (configurable per exam body, these are defaults):
- Crop to passport ratio 3.5 : 4.5, face centred, resize to 350 x 450 px.
- JPEG, compressed in-browser to **20 KB to 50 KB** (iterate quality until within range).
- Overlay a small strip at the bottom with candidate name and capture date (configurable on/off), as many boards require.
- Send to API with metadata: capture timestamp, device/user-agent, liveness result, face-check scores, attempt count.

**Server-side validation** (never trust the client):
- Verify MIME type and real JPEG headers, dimensions, size range, strip EXIF.
- Store in MinIO with a SHA-256 hash; store metadata in DB.
- Flag duplicate photo hashes across candidates for admin review.
- Photo is locked after final submission of OTR; changes only via the admin-approved correction workflow.

**Signature:** capture via either a draw-on-screen signature pad or upload of a scanned signature (JPEG, 140 x 60 px, 10 KB to 20 KB, auto-cropped and compressed). Same validation rules on the server.

Write unit tests for the compression/cropping utilities and a Playwright E2E test that runs Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` (and a fake video file of a face) to exercise the full capture flow.

---

## 4. Functional scope

### 4.1 Candidate portal (`apps/candidate-web`), mobile-first

1. **Landing page:** VTL branding, active exam notifications, how OTR works (3 steps), important dates, FAQs, helpdesk contact, language toggle (EN/HI).
2. **Registration:** name, DOB, gender, mobile, email. Mobile OTP + email OTP verification. Captcha. Duplicate check on mobile, email, and (name + DOB + father's name).
3. **Identity (optional, adapter-based):** Aadhaar e-KYC (store only masked Aadhaar / reference token, never the full number), DigiLocker fetch for class 10/12 certificates, APAAR ID.
4. **Profile wizard** with a step progress bar, auto-save of every step, resume later:
   - Personal details (name as per class 10 certificate, father's/mother's name, DOB, gender, nationality, marital status, identification marks)
   - Category & reservation (Gen/EWS/OBC/SC/ST, PwD with type and percentage, ex-serviceman, domicile state) with certificate uploads
   - Contact & address (permanent and correspondence, "same as" toggle, state/district/PIN masters)
   - Education (class 10, 12, graduation, PG, other; board/university, year, marks/CGPA, roll no.) with document upload (PDF, size limits)
   - **Live photo** (section 3) and signature
   - Declaration and preview
5. **Final submission** generates a unique **OTR ID** (format configurable, e.g. `VTL-OTR-2026-0000123`, with check digit), shown on screen, SMS'd and emailed, and a downloadable OTR registration slip PDF.
6. **Edit/correction rules:** after submission, core fields (name, DOB, photo, category) are locked; candidate raises a correction request with supporting document, admin approves/rejects. Limited non-core edits allowed (address, email) with OTP re-verification. Full audit trail of every change.
7. **Apply for exams using OTR:** list of open exams with eligibility auto-checked against the profile (age as on cut-off date with category relaxation, qualification, domicile). Exam-specific fields (post preferences, exam centre city choices) added on top of OTR data. Fee calculated by category/gender/PwD rules.
8. **Payment:** mock gateway flow with success, failure, pending; reconciliation job; downloadable receipt.
9. **Dashboard:** profile completion, applications with status timeline, admit cards, results, notifications, correction requests.
10. **Admit card** download (when released by admin): photo, signature, OTR ID, roll no., centre, reporting time, QR code containing a signed payload for verification.
11. **Helpdesk:** raise ticket with category and attachment, track status.
12. Forgot OTR ID / password via mobile or email OTP.

### 4.2 Admin portal (`apps/admin-web`), desktop-first

1. Role-based access: Super Admin, Exam Admin, Verifier, Helpdesk Agent, Read-only Auditor. 2FA (TOTP) mandatory for admins.
2. **Dashboard:** registrations today/total, profile completion funnel, applications per exam, payments collected, pending verifications, charts by state/category/gender.
3. **Exam management:** create exam/notification, posts, eligibility rules (age limits, relaxations, qualifications), fee matrix, important dates, centre cities and capacity, custom application fields, publish/unpublish.
4. **Candidate management:** search by OTR ID, mobile, email, name; full profile view with photo and capture metadata; document verification (approve/reject with reason); duplicate-photo and duplicate-identity flags review; block/unblock.
5. **Correction requests** queue with approve/reject and audit.
6. **Payments:** transaction list, reconciliation status, manual verification, refunds marker.
7. **Admit card generation:** roll number allocation, centre allocation (auto by city preference and capacity, with manual override), bulk generate and release.
8. **Communication:** bulk SMS/email by filters with templates.
9. **Reports & exports:** Excel/CSV exports, applicant lists, category-wise counts, payment reports.
10. **Audit logs:** every admin and candidate action with actor, IP, timestamp, before/after values.
11. Masters: states, districts, boards, universities, categories, qualifications.

---

## 5. Non-functional requirements

- **Security (OWASP Top 10, CERT-In audit-ready):** Argon2 password hashing, JWT access + refresh tokens in httpOnly secure cookies, CSRF protection, rate limiting on OTP/login, account lockout, input validation with shared Zod schemas, parameterised queries only, Helmet security headers, strict CSP, signed URLs for file access (no public buckets), encryption at rest for PII fields, no PII in logs.
- **Compliance:** DPDP Act 2023 (consent capture, purpose statement, data retention settings), GIGW 3.0 guidelines, WCAG 2.1 AA accessibility (keyboard navigation, labels, contrast, screen-reader text, skip links).
- **Performance:** designed for peak load of lakhs of registrations near deadlines. Stateless API, Redis caching, queued SMS/email/PDF jobs, pagination everywhere, DB indexes on lookup fields. Candidate pages under 2.5s LCP on a 4G mobile.
- **Reliability:** idempotent payment callbacks, retries with backoff for integrations, health check endpoints, structured logging.
- **Bilingual:** all candidate-facing text in i18n files (English + Hindi); no hard-coded strings.
- **Responsive:** candidate app fully usable on a 360px wide Android phone.

---

## 6. Deliverables and quality bar

- `docs/PLAN.md` (before coding), `README.md` with setup, `docs/API.md` (or OpenAPI/Swagger at `/api/docs`), `docs/ARCHITECTURE.md` with a data model diagram (Mermaid).
- Prisma schema with migrations and realistic seed data (at least 3 exams, 50 candidates with photos in various states).
- Tests: unit tests for business rules (eligibility, age relaxation, fee calculation, OTR ID generation, photo processing), API integration tests, Playwright E2E for: register → OTP → full profile → live photo → submit → apply → pay → download admit card.
- ESLint + Prettier, strict TypeScript, no `any` in shared types.
- A `/styleguide` route in the candidate app showcasing the VTL design system components (buttons, inputs, cards, stepper, alerts, the camera component) so I can review branding quickly.

## 7. Working agreement

- Plan first, then build in phases: (1) foundation, design system, auth/OTP; (2) profile wizard with live photo and signature; (3) OTR submission, ID, PDFs; (4) exams, eligibility, applications, payments; (5) admin portal; (6) admit cards, reports, audit, hardening.
- After each phase: run the app, run tests, fix failures, and report what's done and what's next.
- If something in this brief is ambiguous, make the most reasonable assumption for an Indian government recruitment context, note it in `docs/ASSUMPTIONS.md`, and keep going.
- Do not remove or weaken the live-capture-only rule for the photograph.
