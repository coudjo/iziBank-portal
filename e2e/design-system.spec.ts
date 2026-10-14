import { expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, signIn } from './support';

test('component gallery has no accessibility violations', async ({ page }) => {
  await signIn(page, USERS.teller);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { level: 1, name: 'Component gallery' })).toBeVisible();
  await expectNoAxeViolations(page);
});

test('controls are 44px tall on tablet and phone', async ({ page }, info) => {
  await page.goto('/login');
  const height = await page
    .getByRole('button', { name: 'Sign in' })
    .evaluate((element) => element.getBoundingClientRect().height);
  if (info.project.name === 'desktop') {
    expect(height).toBeGreaterThanOrEqual(32);
  } else {
    expect(height).toBeGreaterThanOrEqual(44);
  }
});

test('page does not scroll sideways', async ({ page }) => {
  await signIn(page, USERS.teller);
  await expect(page).toHaveURL(/\/dashboard$/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
