import path from 'node:path';
import { fileURLToPath as __f2p } from 'node:url';
const __dirname = path.dirname(__f2p(import.meta.url));
import { expect, type APIRequestContext, type Page } from '@playwright/test';


export const CERT = path.join(__dirname, 'fixtures/certificate.pdf');

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

/** Staff API session (password + emailed one-time code) using the same-origin proxy. */
export async function adminApi(request: APIRequestContext) {
  await request.get('/api/v1/auth/csrf');
  const state = await request.storageState();
  const csrf = state.cookies.find((c) => c.name === 'vtl_csrf')!.value;
  const h = { 'X-CSRF-Token': csrf };
  const email = 'examadmin@vtl-otr.local';
  const code = async () => (await (await request.get(`/api/v1/dev/otp?target=${encodeURIComponent(email)}`)).json()).otp as string;
  const login = await request.post('/api/v1/admin/auth/login', { headers: h, data: { email, password: 'Admin@12345' } });
  expect(login.ok()).toBeTruthy();
  const { challengeId } = await login.json();
  expect((await request.post('/api/v1/admin/auth/otp/verify', { headers: h, data: { challengeId, code: await code() } })).ok()).toBeTruthy();
  return {
    post: async (url: string, data: object = {}, stepUp = false) => {
      const first = await request.post(`/api/v1${url}`, { headers: h, data });
      if (!stepUp || first.status() !== 403) return first;
      return request.post(`/api/v1${url}`, { headers: { ...h, 'X-OTP-Code': await code() }, data });
    },
    get: (url: string) => request.get(`/api/v1${url}`),
  };
}
