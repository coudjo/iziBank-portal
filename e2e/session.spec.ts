import { expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, openUserMenu, signIn } from './support';

const ROAMER = { code: 'ROAMER', secret: 'Roamer-Pass1' };

test.describe('Session handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install();
  });

  test('an idle user is warned 2 minutes before sign-out and can stay signed in', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.clock.fastForward('13:31');
    const dialog = page.getByRole('dialog', { name: 'Are you still there?' });
    await expect(dialog.getByText(/You will be signed out in 1:\d\d\./).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await dialog.getByRole('button', { name: 'Stay signed in' }).click();
    await expect(dialog).toBeHidden();
    await page.clock.fastForward('10:00');
    await expect(page.getByRole('dialog', { name: 'Sign in again' })).toBeHidden();
  });

  test('when the session runs out the page stays and the same user signs back in over it', async ({
    page,
  }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click();
    await expect(page).toHaveURL(/\/customers$/);

    await page.clock.fastForward('15:05');
    const dialog = page.getByRole('dialog', { name: 'Sign in again' });
    await expect(dialog.getByText('You were signed out after a period of inactivity.')).toBeVisible();
    await expectNoAxeViolations(page);

    await dialog.getByRole('textbox', { name: /^Password/ }).fill(USERS.teller.secret);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/customers$/);
  });

  test('a different person signing in over the page discards the previous work', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click();

    await page.clock.fastForward('15:05');
    const dialog = page.getByRole('dialog', { name: 'Sign in again' });
    await dialog.getByRole('textbox', { name: /^Staff code/ }).fill(USERS.kyc.code);
    await dialog.getByRole('textbox', { name: /^Password/ }).fill(USERS.kyc.secret);
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page
        .locator('.ant-message')
        .getByText('Your previous work was discarded because a different user signed in.'),
    ).toBeVisible();
  });

  test('choosing Sign out in the dialog returns to sign-in with the reason', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.clock.fastForward('15:05');
    await page
      .getByRole('dialog', { name: 'Sign in again' })
      .getByRole('button', { name: 'Sign out' })
      .click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText('You were signed out after a period of inactivity.')).toBeVisible();
  });
});

test.describe('Branch switching', () => {
  test('switching branch changes the header and the permissions', async ({ page }, info) => {
    await signIn(page, ROAMER);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Head Office').first()).toBeVisible();

    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Switch branch' }).click();
    const dialog = page.getByRole('dialog', { name: 'Switch branch' });
    await dialog.getByRole('radio', { name: /Kumasi/ }).check();
    await dialog.getByRole('button', { name: 'Switch' }).click();

    await expect(page.locator('.ant-message').getByText('You are now working in Kumasi.')).toBeVisible();
    await expect(
      page.getByRole('paragraph').filter({ hasText: 'Signed in as Yaw Boateng, Kumasi' }),
    ).toBeVisible();
    if (!isPhone(info)) {
      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link', { name: 'Sessions' })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Customers' })).toHaveCount(0);
    }
  });

  test('a GET that hit a forced logout is replayed after the same user signs back in', async ({ page }) => {
    await signIn(page, ROAMER);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.evaluate(() =>
      (window as unknown as { __ibMock: { endSessions(reason: string): void } }).__ibMock.endSessions(
        'auth.session-forced',
      ),
    );

    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Switch branch' }).click();
    const switchDialog = page.getByRole('dialog', { name: 'Switch branch' });
    await switchDialog.getByRole('radio', { name: /Kumasi/ }).check();
    await switchDialog.getByRole('button', { name: 'Switch' }).click();

    const reauth = page.getByRole('dialog', { name: 'Sign in again' });
    await expect(reauth.getByText('An administrator ended your session.')).toBeVisible();
    await reauth.getByRole('textbox', { name: /^Password/ }).fill(ROAMER.secret);
    await reauth.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.locator('.ant-message').getByText('You are now working in Kumasi.')).toBeVisible();
  });
});
