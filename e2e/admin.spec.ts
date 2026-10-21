import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, signIn, signInAdmin } from './support';

/** A toast's text; the live announcer repeats it off screen. */
const toast = (page: Page, text: string) => page.locator('.cdk-overlay-container').getByText(text);

async function action(page: Page, name: string) {
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}

test.describe('Staff (F11, UX 6.10)', () => {
  test('a new staff member gets a first password, a till, then role groups sent for approval', async ({
    page,
  }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/admin/staff');
    await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible();
    await page.getByRole('searchbox', { name: /^Search/ }).fill('teller');
    await expect(page.getByText('Ama Mensah').first()).toBeVisible();
    await expect(page.getByText('Kofi Asante')).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'New staff member' }).click();
    await expect(page.getByText('They must change this password the first time they sign in.')).toBeVisible();
    await page.getByRole('textbox', { name: /^Staff code/ }).fill('TELLER2');
    await page.getByRole('textbox', { name: /^Full name/ }).fill('Abena Owusu');
    await page.getByRole('combobox', { name: /^Home branch/ }).selectOption({ label: '001 Head Office' });
    await page.getByRole('textbox', { name: /^First password/ }).fill('short');
    await expect(page.getByRole('list', { name: 'Password rules' })).toContainText('At least 8 characters');
    await page.getByRole('switch', { name: /^Teller/ }).click();
    await page.getByRole('button', { name: 'Create staff member' }).click();
    await expect(page.getByText('The password does not meet the rules below.').first()).toBeVisible();
    await expect(page.getByText("Choose the teller's till account.").first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('textbox', { name: /^First password/ }).fill('Welcome-2026');
    await page
      .getByRole('combobox', { name: /^Till account/ })
      .selectOption({ label: '1001001 Teller cash - Head Office' });
    await page.getByRole('button', { name: 'Create staff member' }).click();

    await expect(toast(page, 'Staff member created. Now choose their role groups.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Abena Owusu' })).toBeVisible();
    await expect(page.getByText('Must change password').first()).toBeVisible();
    await expect(page.getByRole('definition').first()).toHaveText('None');

    await page.getByRole('checkbox', { name: /^Teller/ }).check();
    const summary = page.getByText('What changes for Abena Owusu in Head Office').locator('..');
    await expect(summary).toContainText('Adds View, Add on Party and KYC › Party');
    const matrix = page.getByRole('table', { name: /Permissions in Head Office/ });
    await expect(matrix.getByRole('row', { name: /Accounts › Account/ })).toContainText(
      'Teller: View, Add, Edit',
    );
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Send for approval' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.locator('.cdk-overlay-container').getByText(/^Sent for approval\./)).toBeVisible();
    await expect(page.getByText('A change for Head Office is awaiting approval: Teller.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /^Teller/ })).toBeDisabled();
  });

  test('disable and reset password are in the actions menu; your own record cannot be changed', async ({
    page,
  }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/admin/staff/1');
    await expect(page.getByText('This is your own record.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);

    await page.goto('/admin/staff/2');
    await expect(page.getByRole('heading', { level: 1, name: 'Ama Mensah' })).toBeVisible();
    await action(page, 'Reset password');
    const dialog = page.getByRole('dialog', { name: 'Reset password for Ama Mensah' });
    await dialog.getByRole('textbox', { name: /^Temporary password/ }).fill('teller1');
    await dialog.getByRole('button', { name: 'Reset password' }).click();
    await expect(dialog.getByText('The password does not meet the rules below.')).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog.getByRole('textbox', { name: /^Temporary password/ }).fill('Reset-2026x');
    await dialog.getByRole('button', { name: 'Reset password' }).click();
    await expect(toast(page, 'Password reset. They choose a new one at next sign-in.')).toBeVisible();
    await expect(page.getByText('Must change password').first()).toBeVisible();

    await action(page, 'Disable');
    await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
    await expect(toast(page, 'Staff member disabled.')).toBeVisible();
    await expect(page.getByText('Disabled').first()).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Staff record' })
      .getByRole('link', { name: 'Sessions' })
      .click();
    await page.getByRole('checkbox', { name: 'Signed in now only' }).uncheck();
    await expect(page.getByText('Password changed,', { exact: false }).first()).toBeVisible();
  });
});

test.describe('Role groups (F11, UX 6.10 step 3, 7.7)', () => {
  test('editing a group says what changes for how many people, and waits for approval', async ({ page }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/admin/role-groups');
    // Table rows on desktop, cards on tablet and phone: the same words either way.
    await expect(page.getByText('Change awaiting approval').first()).toBeVisible();
    await expect(
      page
        .getByRole('main')
        .getByText(/System/)
        .first(),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Teller', exact: true }).click();
    await expect(page.getByText('A change to this role group is awaiting approval.')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Members' })).toContainText('Ama Mensah');

    await page.goto('/admin/role-groups');
    await page.getByRole('link', { name: 'Auditor', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Auditor' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Approve on Reference data › Lookups' }).check();
    await expect(page.getByRole('checkbox', { name: 'View on Reference data › Lookups' })).toBeChecked();
    await expect(page.getByText('Adds View, Approve on Reference data › Lookups')).toBeVisible();
    await expect(page.getByText(/What changes for \d+ (people|person)/)).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Send for approval' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send for approval' }).click();
    await expect(page.getByText('A change to this role group is awaiting approval.')).toBeVisible();
  });

  test('a new role group waits for approval and shows in the approvals inbox', async ({ page }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/admin/role-groups/new');
    await expect(page.getByRole('button', { name: 'Send for approval' })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Code/ }).fill('LOAN_OFFICER');
    await page.getByRole('textbox', { name: /^Name/ }).fill('Loan officer');
    await page.getByRole('checkbox', { name: 'Add on Party and KYC › Party' }).check();
    await expect(page.getByText('Adds View, Add on Party and KYC › Party')).toBeVisible();
    await page.getByRole('button', { name: 'Send for approval' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Send for approval' }).click();
    await expect(page).toHaveURL(/\/admin\/role-groups$/);

    await page.goto('/approvals/security');
    await expect(page.getByRole('link', { name: 'Loan officer' })).toBeVisible();
  });
});

test.describe('Sessions (F11, UX 7.7)', () => {
  test('an administrator signs someone out; the session shows why it ended', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/admin/sessions');
    await expect(page.getByRole('heading', { level: 1, name: 'Sessions' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Force sign-out Kofi Asante' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Force sign-out' }).click();
    await expect(toast(page, 'Signed out.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Force sign-out Kofi Asante' })).toHaveCount(0);
    await page.getByRole('checkbox', { name: 'Signed in now only' }).uncheck();
    await expect(page.getByText('Signed out by an administrator', { exact: false }).first()).toBeVisible();
  });

  test('an auditor reads staff and sessions but changes nothing', async ({ page }) => {
    await signIn(page, USERS.auditor);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/admin/staff/2');
    await expect(page.getByRole('heading', { level: 1, name: 'Ama Mensah' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Staff record' });
    await expect(tabs.getByRole('link', { name: 'Role groups' })).toHaveCount(0);
    await tabs.getByRole('link', { name: 'Sessions' }).click();
    await expect(page.getByText('Chrome on Windows').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Force sign-out/ })).toHaveCount(0);
    await page.goto('/admin/role-groups');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });
});
