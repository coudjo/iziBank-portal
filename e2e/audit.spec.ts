import { expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, signIn, signInAdmin } from './support';

test.describe('Audit (F11, UX 6.12)', () => {
  test('an auditor filters the activity log, reads each row as a sentence and opens the raw details', async ({
    page,
  }) => {
    await signIn(page, USERS.auditor);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/audit');
    await expect(page).toHaveURL(/\/audit\/activity$/);
    await expect(page.getByText('Viewing the audit log is itself recorded.')).toBeVisible();
    await expect(page.getByText('Opened the account · Account 2000000000003').first()).toBeVisible();
    await expect(page.getByText('Refused', { exact: true }).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Opened the account' });
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Showing 1 to 1 of 1')).toBeVisible();
    await page.getByText('Show details').first().click();
    await expect(page.getByText('"productCode": "CUR01"').first()).toBeVisible();

    // The search above was itself recorded.
    await page.getByRole('combobox', { name: 'Event' }).selectOption({ label: 'Viewed the audit log' });
    await page
      .getByRole('combobox', { name: 'Staff member' })
      .selectOption({ label: 'Adwoa Nyarko (AUDIT1)' });
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Viewed the audit log · Activity log').first()).toBeVisible();
    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(page.getByText('Opened the account · Account 2000000000003').first()).toBeVisible();
  });

  test('the data-change log shows old and new values side by side, and never a secret', async ({ page }) => {
    await signIn(page, USERS.auditor);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/audit/changes');
    const product = page.getByRole('table', { name: 'Changes to Changed · Product 1' }).first();
    await expect(product.getByRole('row', { name: /Product name/ })).toContainText('Savings');
    await expect(product.getByRole('row', { name: /Product name/ })).toContainText('Regular savings');
    const staff = page.getByRole('table', { name: 'Changes to Changed · Staff member 6' }).first();
    await expect(staff.getByRole('row', { name: /Secret key hash/ })).toContainText('Hidden');
    await expect(page.getByText('[redacted]')).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole('combobox', { name: 'Record type' }).selectOption({ label: 'Holiday' });
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByText('Showing 1 to 1 of 1')).toBeVisible();
    await expect(page.getByText('Removed · Holiday 9').first()).toBeVisible();
  });

  test('staff without audit permission see neither the menu item nor the page', async ({ page }, info) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    if (!isPhone(info)) {
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Audit' }),
      ).toHaveCount(0);
    }
    await page.goto('/audit/changes');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });

  test('an account activity tab reads the same log, and shows a refused action as refused', async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto('/accounts/201/activity');
    await expect(page.getByText('Held an amount').first()).toBeVisible();
    await expect(page.getByText('(denied)').first()).toBeVisible();
    await expect(page.getByText('(success)')).toHaveCount(0);
  });
});
