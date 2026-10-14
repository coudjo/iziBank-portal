import { expect, test } from '@playwright/test';
import { expectNoAxeViolations } from './support';

test('the app opens on the sign-in page with one h1', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page).toHaveTitle('Sign in - iziBank');
  await expectNoAxeViolations(page);
});
