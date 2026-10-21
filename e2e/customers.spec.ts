import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, signIn } from './support';

async function mock(page: Page, hook: string, ...args: unknown[]) {
  await page.waitForFunction(() => '__ibMock' in window);
  await page.evaluate(
    ([name, values]) =>
      (window as unknown as { __ibMock: Record<string, (...input: unknown[]) => void> }).__ibMock[
        name as string
      ](...(values as unknown[])),
    [hook, args] as const,
  );
}

async function openCustomers(page: Page) {
  await signIn(page, USERS.teller);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
}

test.describe('Customers list (F5-01)', () => {
  test('lists customers with chips and masked IDs, and filters survive navigation', async ({
    page,
  }, info) => {
    await openCustomers(page);
    await expect(page.getByText('Akosua Darko')).toBeVisible();
    await expect(page.getByText('Darko Farms Limited')).toBeVisible();
    await expect(page.getByText('GHA-700000001-1')).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole('combobox', { name: 'Type' }).selectOption('BUSINESS');
    await expect(page.getByText('Akosua Darko')).toHaveCount(0);
    await expect(page.getByText('Darko Farms Limited')).toBeVisible();

    if (isPhone(info)) {
      await page.getByRole('link', { name: 'Home' }).click();
      await page.getByRole('link', { name: 'Customers' }).click();
    } else {
      await page.getByRole('link', { name: 'Dashboard' }).click();
      await page.getByRole('link', { name: 'Customers' }).click();
    }
    await expect(page.getByRole('combobox', { name: 'Type' })).toHaveValue('BUSINESS');
    await expect(page.getByText('Akosua Darko')).toHaveCount(0);

    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(page.getByText('Akosua Darko')).toBeVisible();
  });

  test('a search with no match explains why and offers the next action', async ({ page }) => {
    await openCustomers(page);
    await page.getByRole('searchbox', { name: /^Search/ }).fill('Nobody Here');
    await expect(page.getByRole('heading', { name: 'No customers match' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New customer' }).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.getByText('Akosua Darko')).toBeVisible();
  });

  test('finds a customer by mobile typed in local format', async ({ page }) => {
    await openCustomers(page);
    await page.getByRole('searchbox', { name: /^Search/ }).fill('024 400 0103');
    await expect(page.getByText('Esi Quaye')).toBeVisible();
    await expect(page.getByText('Akosua Darko')).toHaveCount(0);
  });

  test('staff without customer access see neither the menu item nor the page', async ({ page }) => {
    await signIn(page, USERS.auditor);
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByRole('link', { name: 'Customers' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Search customers/ })).toHaveCount(0);
    await page.goto('/customers');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });
});

test.describe('Customer record (F5-04, F5-05 read only)', () => {
  test('header, overview checklist and masked details', async ({ page }) => {
    await page.clock.install();
    await openCustomers(page);
    await page
      .getByRole('link', { name: /Akosua Darko|0000000101/ })
      .first()
      .click();

    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();
    await expect(page).toHaveTitle('Customer - iziBank');
    await expect(page.getByRole('button', { name: 'Verified' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approved' })).toBeVisible();
    await expect(page.getByText('Credit officer: Kojo Antwi')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Complete the profile \(7 of 7 done\)/ })).toBeVisible();
    await expect(page.getByText('Viewing this record is logged.')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Details' }).click();
    await expect(page).toHaveURL(/\/customers\/101\/details$/);
    const id = page.getByTestId('masked-value').first();
    await expect(id).toHaveText('****01-1');
    await page.getByRole('button', { name: 'Show ID number' }).click();
    await expect(id).toHaveText('GHA-700000001-1');
    await expectNoAxeViolations(page);

    await page.clock.fastForward(31_000);
    await expect(id).toHaveText('****01-1');
  });

  test('missing checklist items link to the tab that completes them', async ({ page }) => {
    await openCustomers(page);
    await page
      .getByRole('link', { name: /Esi Quaye|0000000103/ })
      .first()
      .click();
    await expect(page.getByText('PEP')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Complete the profile \(4 of 7 done\)/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add At least one next of kin' })).toHaveAttribute(
      'href',
      /\/customers\/103\/next-of-kin$/,
    );
  });

  test('a record the API cannot log is not shown', async ({ page }) => {
    await openCustomers(page);
    await mock(page, 'setOverviewFailure', 'audit.activity-log-unavailable');
    await page.goto('/customers/101');
    await expect(page.getByText('We could not open this record safely. Try again.')).toBeVisible();
    await expect(page.getByText('Akosua Darko')).toHaveCount(0);
    await expect(page.getByText('Viewing this record is logged.')).toHaveCount(0);
  });
});

test.describe('Global search (F3-04)', () => {
  test('opens from the keyboard, groups results, masks IDs and opens the record', async ({ page }, info) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);

    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Search customers or accounts' }).click();
    } else {
      await page.keyboard.press('/');
    }
    const dialog = page.getByRole('dialog', { name: 'Search' });
    const box = dialog.getByRole('combobox', { name: 'Search customers or accounts' });
    await expect(box).toBeFocused();

    await box.fill('Darko');
    const results = dialog.getByRole('listbox', { name: 'Search results' });
    const customers = results.getByRole('group', { name: 'Customers' });
    await expect(customers.getByRole('option')).toHaveCount(2);
    await expect(customers).toContainText('****01-1');
    await expect(results).not.toContainText('GHA-700000001-1');
    const accounts = results.getByRole('group', { name: 'Accounts' });
    await expect(accounts).toContainText('1000000000001');
    await expect(dialog.getByText(/2 customers and \d+ accounts found\./)).toBeVisible();
    await expectNoAxeViolations(page);

    await box.press('ArrowDown');
    await box.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/customers\/10[14]\/overview$/);
  });

  test('finds an account by number and opens it; the arrow keys move across both groups (P12)', async ({
    page,
  }, info) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Search customers or accounts' }).click();
    } else {
      await page.keyboard.press('Control+k');
    }
    const dialog = page.getByRole('dialog', { name: 'Search' });
    const box = dialog.getByRole('combobox', { name: 'Search customers or accounts' });

    await box.fill('2000000000003');
    const accounts = dialog.getByRole('group', { name: 'Accounts' });
    await expect(accounts.getByRole('option')).toHaveCount(1);
    await expect(dialog.getByRole('group', { name: 'Customers' })).toHaveCount(0);
    await expect(accounts).toContainText('Business current');
    await expect(dialog.getByText('0 customers and 1 account found.')).toBeVisible();
    await expectNoAxeViolations(page);

    await box.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/accounts\/203(\/|$)/);
  });

  test('without account access only customers are searched (deny by default)', async ({ page }, info) => {
    await signIn(page, USERS.kyc);
    await expect(page).toHaveURL(/\/dashboard$/);
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Search customers or accounts' }).click();
    } else {
      await page.keyboard.press('/');
    }
    const dialog = page.getByRole('dialog', { name: 'Search' });
    await expect(
      dialog.getByText('Customer number, name, mobile or ID number.', { exact: false }),
    ).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Search customers or accounts' }).fill('Darko');
    await expect(dialog.getByRole('group', { name: 'Customers' }).getByRole('option')).toHaveCount(2);
    await expect(dialog.getByRole('group', { name: 'Accounts' })).toHaveCount(0);
    await expect(dialog.getByText('2 customers found.')).toBeVisible();
  });

  test('Ctrl+K opens search and ? lists the shortcuts', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Search' })).toBeHidden();

    await page.keyboard.press('Shift+?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(help).toContainText('Search customers or accounts');
    await expectNoAxeViolations(page);
  });
});
