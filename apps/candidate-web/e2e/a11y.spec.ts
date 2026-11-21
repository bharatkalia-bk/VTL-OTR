import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** WCAG 2.1 AA automated checks on public pages (axe-core). */
for (const path of ['/', '/register', '/login', '/helpdesk', '/forgot-otr', '/legal/privacy', '/helpline']) {
  test(`no serious a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.locator('main h1').first().waitFor();
    await page.waitForTimeout(500);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
}
