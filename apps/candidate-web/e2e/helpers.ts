import path from 'node:path';
import { fileURLToPath as __f2p } from 'node:url';
const __dirname = path.dirname(__f2p(import.meta.url));
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { authenticator } from 'otplib';


export const CERT = path.join(__dirname, 'fixtures/certificate.pdf');
export const TOTP_SECRET = 'KVKFKRCPNZQUYMLXOVYDSQKJKZDTSRLD';

export async function devOtp(page: Page, target: string): Promise<string> {
  await expect.poll(async () => (await (await page.request.get(`/api/v1/dev/otp?target=${encodeURIComponent(target)}`)).json()).otp, { timeout: 10_000 }).toBeTruthy();
  return (await (await page.request.get(`/api/v1/dev/otp?target=${encodeURIComponent(target)}`)).json()).otp as string;
}

export async function solveCaptcha(page: Page) {
  const img = page.getByTestId('captcha-image');
  await expect(img).toHaveAttribute('data-captcha-id', /.+/);
  const id = await img.getAttribute('data-captcha-id');
  const { text } = await (await page.request.get(`/api/v1/dev/captcha/${id}`)).json();
  await page.getByTestId('captcha-input').fill(text);
}

/** Admin API session (password + TOTP) using the same-origin proxy. */
export async function adminApi(request: APIRequestContext) {
  await request.get('/api/v1/auth/csrf');
  const state = await request.storageState();
  const csrf = state.cookies.find((c) => c.name === 'vtl_csrf')!.value;
  const h = { 'X-CSRF-Token': csrf };
  expect((await request.post('/api/v1/admin/auth/login', { headers: h, data: { email: 'examadmin@vtl-otr.local', password: 'Admin@12345' } })).ok()).toBeTruthy();
  expect((await request.post('/api/v1/admin/auth/totp/verify', { headers: h, data: { code: authenticator.generate(TOTP_SECRET) } })).ok()).toBeTruthy();
  return {
    post: (url: string, data: object = {}, stepUp = false) => request.post(`/api/v1${url}`, { headers: { ...h, ...(stepUp && { 'X-TOTP-Code': authenticator.generate(TOTP_SECRET) }) }, data }),
    get: (url: string) => request.get(`/api/v1${url}`),
  };
}
