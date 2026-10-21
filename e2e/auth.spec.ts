import { expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, openUserMenu, signIn } from './support';

test.describe('Sign in', () => {
  test('wrong password shows the generic message', async ({ page }) => {
    await signIn(page, { code: USERS.teller.code, secret: 'nope' });
    await expect(page.getByText('Check your staff code and password.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    await expectNoAxeViolations(page);
  });

  test('a locked code says when to try again', async ({ page }) => {
    await signIn(page, USERS.locked);
    await expect(page.getByText('Too many attempts. Try again in 12 minutes.')).toBeVisible();
  });

  test('teller lands on the dashboard and sees only their areas', async ({ page }, info) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
    await expect(page).toHaveTitle('Dashboard - iziBank');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Customers' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Accounts', exact: true })).toBeVisible();
    if (!isPhone(info)) {
      await expect(nav.getByRole('link', { name: 'Staff' })).toHaveCount(0);
    }
    await expectNoAxeViolations(page);
  });

  test('a page outside the role groups shows the not-allowed page', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/admin/staff');
    // A reload drops in-memory state; the session is restored from the tab's storage.
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });

  test('administrator must change the password first, then reaches administration', async ({
    page,
  }, info) => {
    await signIn(page, USERS.admin);
    await expect(page).toHaveURL(/\/change-password$/);
    await expect(page.getByText('You need a new password before you continue.')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/change-password$/);

    await page.getByRole('textbox', { name: /^Current password/ }).fill(USERS.admin.secret);
    await page.getByRole('textbox', { name: /^New password/ }).fill('Admin-Pass2');
    await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Confirm new password/ }).fill('Admin-Pass2');
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'More' }).click();
      await expect(page.getByRole('menuitem', { name: 'Staff' })).toBeVisible();
    } else {
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Staff' }),
      ).toBeVisible();
    }
  });

  test('the account menu works by keyboard: arrows move, Esc closes and returns focus', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    const trigger = page.getByRole('button', { name: /Account menu/ });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Account menu' });
    await expect(menu).toContainText('Ama Mensah (TELLER1)');
    await expect(menu.getByRole('menuitem', { name: 'Change password' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.getByRole('menuitem', { name: 'Change password' })).toBeFocused();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('signing out in one tab signs out the other', async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await signIn(first, USERS.teller);
    await signIn(second, USERS.kyc);
    await expect(first).toHaveURL(/\/dashboard$/);
    await expect(second).toHaveURL(/\/dashboard$/);

    await openUserMenu(first);
    await first.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(first).toHaveURL(/\/login$/);

    await expect(second).toHaveURL(/\/login$/);
    await expect(second.getByText('You have been signed out.')).toBeVisible();
  });
});
