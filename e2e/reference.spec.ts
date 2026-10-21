import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, signIn, signInAdmin } from './support';

/** A toast's text; the live announcer repeats it off screen. */
const toast = (page: Page, text: string) => page.locator('.cdk-overlay-container').getByText(text);

test.describe('Reference data (F11, UX 6.11, 7.7)', () => {
  test('the hub lists each screen the user may open', async ({ page }) => {
    await signInAdmin(page);
    await page.goto('/reference');
    const screens = page.getByRole('list', { name: 'Reference data' });
    for (const label of [
      'Business day',
      'Institution',
      'Branches',
      'Currencies',
      'Holidays',
      'Lookups',
      'Credit officers',
    ]) {
      await expect(screens.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await expectNoAxeViolations(page);
  });

  test('staff without reference permissions see neither the menu items nor the pages', async ({
    page,
  }, info) => {
    // Tellers hold no reference data permission. (A KYC officer does see the hub: customer access covers credit officers.)
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    if (!isPhone(info)) {
      const nav = page.getByRole('navigation', { name: 'Main' });
      await expect(nav.getByRole('link', { name: 'Reference data' })).toHaveCount(0);
      await expect(nav.getByRole('link', { name: 'Business day' })).toHaveCount(0);
    }
    await page.goto('/reference/currencies');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });

  test('closing the day warns that end of day is not in this phase; opening proposes the next working day', async ({
    page,
  }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/business-day');
    await expect(page.getByRole('heading', { level: 2, name: 'Head Office', exact: true })).toBeVisible();
    await expect(page.getByText('Working date 14/10/2026').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Close day' }).click();
    const dialog = page.getByRole('dialog', { name: 'Close the day of 14/10/2026?' });
    await expect(dialog).toContainText('End-of-day processing is not part of this phase');
    await dialog.getByRole('button', { name: 'Close day' }).click();
    await expect(toast(page, 'Business day 14/10/2026 is closed.')).toBeVisible();

    const date = page.getByRole('textbox', { name: /^Date to open/ });
    await expect(date).toHaveValue('15/10/2026');
    await date.fill('17/10/2026');
    await expect(page.getByText('17/10/2026 is a Saturday, not a working day.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open day' })).toBeDisabled();
    await date.fill('14/10/2026');
    await expect(page.getByText('The date must be after the last business day, 14/10/2026.')).toBeVisible();
    await expectNoAxeViolations(page);

    await date.fill('15/10/2026');
    await page.getByRole('button', { name: 'Open day' }).click();
    await expect(toast(page, 'Business day 15/10/2026 is open.')).toBeVisible();
    await expect(page.getByText('Working date 15/10/2026').first()).toBeVisible();
  });

  test('holidays are added and removed; a date a branch already worked cannot be', async ({ page }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/reference/holidays');
    await expect(page.getByRole('heading', { level: 2, name: 'Holidays in 2026' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Christmas Day' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('textbox', { name: /^Date/ }).fill('14/10/2026');
    await page.getByRole('button', { name: 'Add holiday' }).click();
    await expect(
      page.getByText('A branch has already worked on that date, so it cannot be changed.'),
    ).toBeVisible();

    await page.getByRole('textbox', { name: /^Date/ }).fill('03/03/2027');
    await page.getByRole('textbox', { name: /^Name or remarks/ }).fill('Staff training day');
    await page.getByRole('button', { name: 'Add holiday' }).click();
    await expect(toast(page, 'Holiday added for 03/03/2027.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Holidays in 2027' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Staff training day' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove 03/03/2027' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
    await expect(toast(page, 'Holiday removed.')).toBeVisible();
    await expect(page.getByText('No holidays in 2027 yet.')).toBeVisible();
  });

  test('one local currency is enforced and explained; branches and the institution are kept here', async ({
    page,
  }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/reference/currencies');
    await expect(page.getByText('GHS Ghana cedi is the local currency.')).toBeVisible();
    await page.getByRole('button', { name: 'Edit USD' }).first().click();
    const edit = page.getByRole('dialog', { name: 'Edit USD' });
    await edit.getByRole('switch', { name: /^Local currency/ }).click();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      edit.getByText('Products already exist, so the local currency can no longer change.'),
    ).toBeVisible();
    await edit.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'New currency' }).click();
    const create = page.getByRole('dialog', { name: 'New currency' });
    await create.getByRole('textbox', { name: /^Currency code/ }).fill('eur');
    await create.getByRole('textbox', { name: /^Currency name/ }).fill('Euro');
    await create.getByRole('button', { name: 'Create currency' }).click();
    await expect(create.getByText('Enter the exchange rate.')).toBeVisible();
    await expectNoAxeViolations(page);
    await create.getByRole('textbox', { name: /^Exchange rate/ }).fill('17.25');
    await create.getByRole('button', { name: 'Create currency' }).click();
    await expect(toast(page, 'Currency created.')).toBeVisible();
    await expect(page.getByText('Euro').first()).toBeVisible();

    await page.goto('/reference/branches');
    await page.getByRole('button', { name: 'New branch' }).click();
    const branch = page.getByRole('dialog', { name: 'New branch' });
    await branch.getByRole('textbox', { name: /^Branch code/ }).fill('003');
    await branch.getByRole('textbox', { name: /^Branch name/ }).fill('Takoradi');
    await branch.getByRole('textbox', { name: /^Clearing days/ }).fill('45');
    await branch.getByRole('button', { name: 'Create branch' }).click();
    await expect(branch.getByText('Enter a number of days from 0 to 30.')).toBeVisible();
    await branch.getByRole('textbox', { name: /^Clearing days/ }).fill('3');
    await branch.getByRole('button', { name: 'Create branch' }).click();
    await expect(toast(page, 'Branch created.')).toBeVisible();
    await expect(page.getByText('Takoradi').first()).toBeVisible();

    await page.goto('/reference/institution');
    await expect(page.getByText('The profile is not complete.')).toBeVisible();
    await page.getByRole('textbox', { name: /^Licence number/ }).fill('BOG-SL-2019-044');
    await page.getByRole('textbox', { name: /^Incorporation date/ }).fill('12/03/2019');
    await page.getByRole('textbox', { name: /^Head office address/ }).fill('12 Independence Avenue, Accra');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Institution profile saved.')).toBeVisible();
    await expect(page.getByText('The profile is not complete.')).toHaveCount(0);
  });

  test('lookups: one list at a time, no delete, system values cannot be deactivated', async ({ page }) => {
    test.slow();
    await signInAdmin(page);
    await page.goto('/reference/lookups');
    await page.getByRole('combobox', { name: 'List' }).selectOption({ label: 'Account close reasons' });
    await expect(page).toHaveURL(/\/reference\/lookups\/close-reasons$/);
    await expect(page.getByText('Customer request').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Edit Customer request' }).first().click();
    const system = page.getByRole('dialog', { name: 'Edit Customer request' });
    await expect(system.getByRole('switch', { name: /^Active/ })).toBeDisabled();
    await expect(system.getByText('A system value: it cannot be deactivated.')).toBeVisible();
    await system.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Add value' }).click();
    const add = page.getByRole('dialog', { name: 'Add to Account close reasons' });
    await add.getByRole('textbox', { name: /^Code/ }).fill('branch_closed');
    await add.getByRole('textbox', { name: /^Name/ }).fill('Branch closed');
    await add.getByRole('button', { name: 'Add value' }).click();
    await expect(toast(page, 'Value added.')).toBeVisible();

    await page.getByRole('button', { name: 'Edit Branch closed' }).first().click();
    const own = page.getByRole('dialog', { name: 'Edit Branch closed' });
    await own.getByRole('switch', { name: /^Active/ }).click();
    await own.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Value saved.')).toBeVisible();
    await expect(page.getByText('Inactive').first()).toBeVisible();
  });

  test('credit officers are designated from the staff list, and disabled rather than removed', async ({
    page,
  }) => {
    await signInAdmin(page);
    await page.goto('/reference/credit-officers');
    await expect(page.getByText('Kojo Antwi').first()).toBeVisible();
    await page.getByRole('button', { name: 'Designate credit officer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Designate credit officer' });
    await dialog.getByRole('searchbox', { name: /^Search staff/ }).fill('field');
    await dialog
      .getByRole('combobox', { name: /^Staff member/ })
      .selectOption({ label: 'Efua Sarpong (FIELD1, 001)' });
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Designate' }).click();
    await expect(toast(page, 'Credit officer designated.')).toBeVisible();
    await expect(page.getByText('Efua Sarpong').first()).toBeVisible();

    await page.getByRole('button', { name: 'Disable Kojo Antwi' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Disable' }).click();
    await expect(toast(page, 'Credit officer disabled.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable Kojo Antwi' }).first()).toBeVisible();
  });
});
