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
