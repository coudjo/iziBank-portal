import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, signIn, signInAdmin } from './support';

/** Today plus `days` as the portal shows it (dd/mm/yyyy), in the browser's time zone (same machine). */
function shown(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** A toast's text; the live announcer repeats it off screen. */
const toast = (page: Page, text: string) => page.locator('.cdk-overlay-container').getByText(text);

async function openAs(page: Page, user: { code: string; secret: string } | 'admin', path: string) {
  if (user === 'admin') {
    await signInAdmin(page);
  } else {
    await signIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await page.goto(path);
}

test.describe('Products and chart of accounts (F10, UX 6.9, 7.6)', () => {
  test('tellers read products and rates but change nothing', async ({ page }) => {
    await openAs(page, USERS.teller, '/products');
    await expect(page.getByRole('heading', { level: 1, name: 'Products' })).toBeVisible();
    await expect(page.getByText('Regular savings').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'New product' })).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.goto('/products/1/rates');
    await expect(page.getByRole('heading', { level: 2, name: 'Rates', exact: true })).toBeVisible();
    const credit = page.getByRole('list', { name: /^Credit interest/ });
    await expect(credit.getByRole('listitem')).toHaveCount(2);
    await expect(credit).toContainText('3.00%');
    await expect(credit).toContainText('Current');
    await expect(credit).toContainText('Ended');
    await expect(page.getByRole('heading', { name: 'Add a rate' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Close/ })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: /^Product name/ })).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('a supervisor filters products and approves one someone else created', async ({ page }) => {
    await openAs(page, 'admin', '/products');
    await page.getByRole('combobox', { name: 'Approval' }).selectOption('PENDING');
    await expect(page.getByText('Regular savings')).toHaveCount(0);
    await page
      .getByRole('link', { name: /Fixed deposit 12 months|FD01/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { level: 1, name: 'Fixed deposit 12 months' })).toBeVisible();
    await expect(page.getByText('Approving lets accounts be opened on this product.')).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(toast(page, 'Product approved.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  });

  test('a new product waits for another supervisor, with the control account picked from the chart', async ({
    page,
  }) => {
    test.slow();
    await openAs(page, 'admin', '/products');
    await page.getByRole('link', { name: 'New product' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'New product' })).toBeVisible();
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Enter the product code.').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('textbox', { name: /^Product code/ }).fill('SAV09');
    await page.getByRole('textbox', { name: /^Product name/ }).fill('Susu savings');
    await page.getByRole('combobox', { name: /^Product type/ }).selectOption({ label: 'Savings' });
    await page.getByRole('textbox', { name: /^Account prefix/ }).fill('19');
    await page.getByRole('combobox', { name: /^Currency/ }).selectOption({ label: 'GHS Ghana cedi' });
    const control = page.getByRole('combobox', { name: /^Control ledger account/ });
    await expect(control.getByRole('option', { name: '2010001 Customer savings control' })).toBeAttached();
    await expect(control.getByRole('option', { name: '1300001 Loans to customers' })).toHaveCount(0);
    await control.selectOption({ label: '2010001 Customer savings control' });
    await page.getByRole('button', { name: 'Create product' }).click();

    await expect(toast(page, 'Product saved. It is awaiting approval by a supervisor.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Susu savings' })).toBeVisible();
    await expect(
      page.getByText('A different supervisor must approve this, because you created or changed it.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  });

  test('changing an approved product waits for approval and shows the before and after', async ({ page }) => {
    await openAs(page, 'admin', '/products/2/details');
    await expect(page.getByText('cannot change', { exact: false }).first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Account prefix/ })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Product name/ }).fill('SME current');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(toast(page, 'Change saved. It waits for a supervisor to approve it.')).toBeVisible();
    const changes = page.getByRole('table', { name: 'Changes waiting for approval' });
    await expect(changes.getByRole('row', { name: /Product name/ })).toContainText('SME current');
    await expect(page.getByRole('heading', { level: 1, name: 'Business current' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
    await expectNoAxeViolations(page);
  });

  test('adding a rate shows the rate it ends, refuses overlaps, and scheduled rates can be removed', async ({
    page,
  }) => {
    test.slow();
    await openAs(page, 'admin', '/products/1/rates');
    const credit = page.getByRole('list', { name: /^Credit interest/ });
    await expect(credit.getByRole('listitem')).toHaveCount(2);

    const form = page.getByRole('region', { name: 'Add a rate' });
    await form.getByRole('combobox', { name: /^Rate type/ }).selectOption({ label: 'Credit' });
    await form.getByRole('textbox', { name: /^Rate/ }).fill('3.5');
    await form.getByRole('textbox', { name: /^Starts on/ }).fill(shown(10));
    await expect(
      form.getByText(`ends the current rate of 3.00% on ${shown(9)}`, { exact: false }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
    await form.getByRole('button', { name: 'Add rate' }).click();
    await expect(toast(page, `Rate added. The previous rate ends on ${shown(9)}.`)).toBeVisible();
    await expect(credit.getByRole('listitem')).toHaveCount(3);
    await expect(credit).toContainText('Scheduled');

    await form.getByRole('combobox', { name: /^Rate type/ }).selectOption({ label: 'Credit' });
    await form.getByRole('textbox', { name: /^Rate/ }).fill('4');
    await form.getByRole('textbox', { name: /^Starts on/ }).fill(shown(5));
    await form.getByRole('textbox', { name: /^Ends on/ }).fill(shown(20));
    await expect(form.getByText('This overlaps the rate of', { exact: false })).toBeVisible();
    await expect(form.getByRole('button', { name: 'Add rate' })).toBeDisabled();

    await page.getByRole('button', { name: 'Remove rate 3.50%' }).click();
    const confirm = page.getByRole('dialog');
    await confirm.getByRole('button', { name: /^Remove/ }).click();
    await expect(toast(page, 'Rate removed.')).toBeVisible();
    await expect(credit.getByRole('listitem')).toHaveCount(2);

    await page.getByRole('button', { name: 'Close rate 3.00%' }).click();
    // Adding the 3.50% rate ended this one on day 9; removing that rate does not reopen it.
    await page.getByRole('textbox', { name: /^Last day of this rate/ }).fill(shown(30));
    await page.getByRole('button', { name: 'Close rate', exact: true }).click();
    await expect(page.getByText('Choose a date in the range shown.')).toBeVisible();
    await page.getByRole('textbox', { name: /^Last day of this rate/ }).fill(shown(5));
    await page.getByRole('button', { name: 'Close rate', exact: true }).click();
    await expect(toast(page, 'Rate closed.')).toBeVisible();
    await expect(credit).toContainText(`to ${shown(5)}`);
  });

  test('the chart of accounts lists, creates and renames ledger accounts', async ({ page }) => {
    test.slow();
    await openAs(page, 'admin', '/ledger-accounts');
    await expect(page.getByRole('heading', { level: 1, name: 'Chart of accounts' })).toBeVisible();
    await expect(page.getByText('Customer savings control').first()).toBeVisible();
    await page.getByRole('searchbox', { name: /^Search/ }).fill('teller');
    await expect(page.getByText('Customer savings control')).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'New ledger account' }).click();
    await page.getByRole('textbox', { name: /^Account code/ }).fill('4010001');
    await page.getByRole('textbox', { name: /^Account name/ }).fill('Interest income');
    await page.getByRole('combobox', { name: /^Account type/ }).selectOption({ label: 'Income' });
    await page.getByRole('combobox', { name: /^Currency/ }).selectOption({ label: 'GHS Ghana cedi' });
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(toast(page, 'Ledger account saved. It is awaiting approval by a supervisor.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Interest income' })).toBeVisible();

    await page.goto('/ledger-accounts/503');
    await expect(page.getByRole('combobox', { name: /^Account type/ })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Account name/ }).fill('Teller cash - Accra');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Rename saved. It waits for a supervisor to approve it.')).toBeVisible();
    await expect(page.getByText('Rename to “Teller cash - Accra” is awaiting approval.')).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
