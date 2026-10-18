import { expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, signIn, signInAdmin } from './support';

test.describe('Approvals (F8, F3-05)', () => {
  test('the badge counts what this user can approve, and the inbox has a tab per type', async ({
    page,
  }, info) => {
    await signInAdmin(page);
    // Customers awaiting approval (seeded: 5 of 7), 1 new account, 1 new product, 2 chart of accounts items,
    // 1 security change (the other is mine).
    const badge = page.getByTestId('approvals-badge').first();
    await expect(badge).toContainText('10');

    if (isPhone(info)) {
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: /Approvals/ })
        .click();
    } else {
      await page
        .getByRole('link', { name: /^Approvals 10 waiting$/ })
        .first()
        .click();
    }
    await expect(page).toHaveURL(/\/approvals\/customers$/);
    const tabs = page.getByRole('navigation', { name: 'Approvals by type' });
    await expect(tabs.getByRole('link', { name: 'Customers (5)' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Accounts (1)' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Products (1)' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Chart of accounts (2)' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Security (1)' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Yaw Ofori' })).toHaveAttribute(
      'href',
      /\/customers\/102\/kyc$/,
    );
    await expectNoAxeViolations(page);
  });

  test('a security change shows each field before and after; approving moves on', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/approvals/security');
    await expect(page.getByText(/yours, another approver needed/i).first()).toBeVisible();
    await page.getByRole('link', { name: 'Teller' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Role group change' })).toBeVisible();
    const changes = page.getByRole('table', { name: 'Changes waiting for approval' });
    await expect(changes.getByRole('row', { name: /Description/ })).toContainText('Counter staff');
    await expect(changes.getByRole('list', { name: 'Added' })).toContainText('PTY / DOCUMENTS: view, add');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL(/\/approvals\/security$/);
    await expect(page.getByRole('link', { name: 'Security (0)' })).toBeVisible();
  });

  test('your own request cannot be approved by you', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/approvals/review/change/702');
    await expect(page.getByRole('heading', { level: 1, name: 'Staff role groups' })).toBeVisible();
    await expect(
      page.getByText('A different supervisor must approve this, because you created or changed it.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve' })).toBeDisabled();
  });

  test('chart of accounts: a rename is rejected with a reason, then the next item opens', async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto('/approvals/ledger');
    await page.getByRole('link', { name: '2001001 Customer savings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Ledger account rename' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Changes waiting for approval' })).toContainText(
      'Savings deposits',
    );

    await page.getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject?' });
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('Keep the current name');
    await dialog.getByRole('button', { name: 'Reject' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'New ledger account' })).toBeVisible();
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page).toHaveURL(/\/approvals\/ledger$/);
    await expect(page.getByRole('heading', { name: 'Nothing waiting' })).toBeVisible();
  });

  test('KYC officers see only customers; tellers see no approvals at all', async ({ page }) => {
    await signIn(page, USERS.kyc);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/approvals');
    await expect(page).toHaveURL(/\/approvals\/customers$/);
    await expect(page.getByRole('navigation', { name: 'Approvals by type' }).getByRole('link')).toHaveCount(
      1,
    );
    await page.goto('/approvals/ledger');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });

  test('tellers have no approvals entry', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('link', { name: /Approvals/ })).toHaveCount(0);
    await page.goto('/approvals');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });
});
