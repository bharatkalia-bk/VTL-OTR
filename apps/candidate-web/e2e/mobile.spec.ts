import { expect, test } from '@playwright/test';

/** Candidate pages must be usable on a 360px Android phone without horizontal scrolling. */
for (const path of ['/', '/register', '/login', '/helpdesk', '/styleguide']) {
  test(`no horizontal scroll at 360px: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.locator('main h1').first().waitFor();
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(w).toBeLessThanOrEqual(360);
  });
}

test('Hindi toggle switches language and persists', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('lang-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('सत्यापित प्रोफ़ाइल');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
});
