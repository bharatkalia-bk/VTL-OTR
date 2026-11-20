import { expect, request as pwRequest, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { adminApi, CERT, devOtp, solveCaptcha } from './helpers';

/**
 * Full candidate journey: register → OTP → full profile → live photo (fake camera) → submit OTR →
 * apply → pay (mock gateway) → admin allocates & releases admit cards → candidate downloads admit card.
 */
test('register → OTP → profile → live photo → submit → apply → pay → admit card', async ({ page, baseURL }) => {
  const n = String(Date.now()).slice(-8);
  const mobile = `7${n}${n.slice(0, 1)}`.slice(0, 10);
  const email = `e2e.${n}@example.in`;

  // 1. Registration with mobile + email OTP
  await page.goto('/');
  await page.getByTestId('cta-register').click();
  await page.getByTestId('reg-fullName').fill('Arjun Test Kumar');
  await page.getByTestId('reg-fatherName').fill('Ramesh Kumar');
  await page.getByTestId('reg-dob').fill('2001-06-15');
  await page.getByLabel('Male', { exact: true }).check();
  await page.getByTestId('reg-mobile').fill(mobile);
  await page.getByTestId('reg-email').fill(email);
  await page.getByTestId('reg-consent').check();
  await solveCaptcha(page);
  await page.getByTestId('reg-submit').click();
  await expect(page.getByText('Mobile OTP')).toBeVisible();
  const typeOtp = async (prefix: string, code: string) => { for (let i = 0; i < 6; i++) await page.locator(`#${prefix}-${i}`).fill(code[i]!); };
  await typeOtp('motp', await devOtp(page, mobile));
  await typeOtp('eotp', await devOtp(page, email));
  await page.getByTestId('otp-verify').click();
  await page.getByTestId('pw').fill('Strong@Pass1');
  await page.getByTestId('pw2').fill('Strong@Pass1');
  await page.getByTestId('pw-submit').click();

  // 2. Profile wizard
  await expect(page).toHaveURL(/\/profile\/personal/);
  await page.getByTestId('personal-motherName').fill('Sunita Devi');
  await page.getByTestId('personal-maritalStatus').selectOption('UNMARRIED');
  await page.getByTestId('personal-identificationMark1').fill('Mole on left cheek');
  await page.getByTestId('step-continue').click();

  await expect(page).toHaveURL(/\/profile\/category/);
  await page.getByLabel('General (UR)').check();
  await page.getByTestId('cat-domicile').selectOption('UP');
  await page.getByTestId('step-continue').click();

  await expect(page).toHaveURL(/\/profile\/address/);
  await page.getByTestId('permanent-line1').fill('12 MG Road, Hazratganj');
  await page.getByTestId('permanent-state').selectOption('UP');
  await expect(page.getByTestId('permanent-district').locator('option')).not.toHaveCount(1);
  await page.getByTestId('permanent-district').selectOption({ label: 'Lucknow' });
  await page.getByTestId('permanent-city').fill('Lucknow');
  await page.getByTestId('permanent-pin').fill('226001');
  await page.getByTestId('step-continue').click();

  await expect(page).toHaveURL(/\/profile\/education/);
  const e0 = page.getByTestId('edu-0');
  await page.getByTestId('edu-0-qual').fill('Secondary (Class 10)');
  await page.getByTestId('edu-0-board').fill('Central Board of Secondary Education (CBSE)');
  await page.getByTestId('edu-0-year').fill('2017');
  await page.getByTestId('edu-0-marks').fill('84');
  await e0.locator('input[type=file]').setInputFiles(CERT);
  await expect(e0.getByText('certificate.pdf')).toBeVisible();
  await page.getByTestId('edu-add').click();
  const e1 = page.getByTestId('edu-1');
  await e1.getByLabel('Level').selectOption('GRADUATION');
  await page.getByTestId('edu-1-qual').fill('B.Sc.');
  await page.getByTestId('edu-1-board').fill('University of Lucknow');
  await page.getByTestId('edu-1-year').fill('2022');
  await page.getByTestId('edu-1-marks').fill('68');
  await e1.locator('input[type=file]').setInputFiles(CERT);
  await expect(e1.getByText('certificate.pdf')).toBeVisible();
  await page.getByTestId('step-continue').click();

  // 3. Live photo via fake camera (MediaPipe face checks + head-turn liveness) and drawn signature
  await expect(page).toHaveURL(/\/profile\/photo/);
  await page.getByTestId('camera-start').click();
  await expect(page.getByTestId('photo-preview')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('photo-size')).toContainText('350×450');
  await page.getByTestId('photo-accept').click();
  await expect(page.getByTestId('current-photo')).toBeVisible();
  const canvas = page.getByTestId('signature-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) await page.mouse.move(box.x + 30 + i * (box.width - 60) / 30, box.y + box.height * (0.6 - 0.25 * Math.sin(i / 3)));
  await page.mouse.up();
  await page.getByTestId('signature-save').click();
  await expect(page.getByTestId('current-signature')).toBeVisible();
  await page.getByTestId('step-continue').click();

  // 4. Declaration + final submission → OTR ID
  await expect(page).toHaveURL(/\/profile\/declaration/);
  await page.getByTestId('decl-truth').check();
  await page.getByTestId('decl-consent').check();
  await page.getByTestId('decl-place').fill('Lucknow');
  await page.getByTestId('otr-submit').click();
  await page.getByTestId('otr-confirm').click();
  const otrId = (await page.getByTestId('otr-id').textContent())!;
  expect(otrId).toMatch(/^VTL-OTR-\d{4}-\d{8}$/);
  const slip = page.waitForEvent('download');
  await page.getByTestId('download-slip').click();
  expect((await slip).suggestedFilename()).toBe(`OTR-Slip-${otrId}.pdf`);

  // 5. Apply for an open exam (eligibility auto-checked)
  await page.goto('/exams');
  await page.getByTestId('apply-VTL-CGL-2026').click();
  await page.getByTestId('add-post-TA').click();
  await page.getByTestId('city-select').selectOption({ label: 'Lucknow' });
  await page.getByTestId('cf-preferredLanguage').selectOption('EN');
  await page.getByTestId('apply-agree').check();
  await page.getByTestId('apply-submit').click();
  await page.getByTestId('apply-confirm').click();
  await expect(page).toHaveURL(/\/applications\/[0-9a-f-]+$/);
  const appUrl = page.url();

  // 6. Pay via mock gateway
  await page.getByTestId('pay-now').click();
  await expect(page.getByText('Mock Payment Gateway')).toBeVisible();
  await page.getByTestId('pg-success').click();
  await expect(page.getByTestId('payment-status')).toHaveAttribute('data-status', 'SUCCESS');
  await page.getByTestId('back-to-application').click();
  await expect(page.getByText('Fee paid').first()).toBeVisible();
  const receipt = page.waitForEvent('download');
  await page.getByTestId('download-receipt').click();
  expect((await receipt).suggestedFilename()).toMatch(/^Receipt-VTLP/);

  // 7. Admin: allocate roll numbers & centres, generate, release (step-up TOTP)
  const ctx = await pwRequest.newContext({ baseURL });
  const admin = await adminApi(ctx);
  const exams = await (await admin.get('/admin/exams')).json();
  const cgl = exams.find((e: { code: string }) => e.code === 'VTL-CGL-2026');
  expect((await admin.post(`/admin/exams/${cgl.id}/admit-cards/allocate`)).ok()).toBeTruthy();
  expect((await admin.post(`/admin/exams/${cgl.id}/admit-cards/generate`)).ok()).toBeTruthy();
  const rel = await admin.post(`/admin/exams/${cgl.id}/admit-cards/release`, {}, true);
  expect(rel.ok(), await rel.text()).toBeTruthy();
  await ctx.dispose();

  // 8. Candidate downloads the admit card (with QR)
  await page.goto(appUrl);
  const dl = page.waitForEvent('download');
  await page.getByTestId('download-admit').click();
  const file = await (await dl).path();
  expect(readFileSync(file!).subarray(0, 5).toString()).toBe('%PDF-');
});
