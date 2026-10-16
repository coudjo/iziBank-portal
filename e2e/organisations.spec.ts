import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, signIn } from './support';

async function customers(page: Page, user = USERS.field) {
  await signIn(page, user);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
}

async function newCustomer(page: Page, kind: 'Individual' | 'Business' | 'Group') {
  await page.getByRole('button', { name: 'New customer' }).click();
  await page.getByRole('menuitem', { name: kind }).click();
}

async function pick(page: Page, label: string, term: string, name: string) {
  await page.getByRole('searchbox', { name: new RegExp(`^${label}`) }).fill(term);
  await page.getByRole('button', { name: `Choose ${name}` }).click();
}

test.describe('New customer menu (F6)', () => {
  test('shows each kind only with its add permission and works by keyboard', async ({ page }) => {
    await customers(page, USERS.teller);
    const trigger = page.getByRole('button', { name: 'New customer' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'New customer' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Individual', 'Business']);
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});

test.describe('Business onboarding (F6, UX 6.3)', () => {
  test('two steps, the one-number rule, then the record with the owners tab', async ({ page }) => {
    await customers(page);
    await newCustomer(page, 'Business');
    await expect(page.getByRole('heading', { level: 1, name: 'New business customer' })).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    const summary = page.getByRole('alert').filter({ hasText: 'There is a problem' });
    await expect(summary).toContainText('Enter the business name.');
    await expect(summary).toContainText('Choose the legal form.');

    await page.getByRole('textbox', { name: /^Business name/ }).fill('Asare Cold Stores');
    await page.getByRole('textbox', { name: /^Registration number/ }).fill('cs 987654321');
    await page.getByRole('combobox', { name: /^Legal form/ }).selectOption({ label: 'Limited company' });
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('textbox', { name: /^Address line 1/ }).fill('Kaneshie, Accra');
    await page.getByRole('combobox', { name: /^Source of funds/ }).fill('Business income');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toContainText(
      'Enter a mobile or phone number.',
    );
    await page.getByRole('textbox', { name: /^Phone/ }).fill('030 222 3333');
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Asare Cold Stores' })).toBeVisible();
    await expect(page.getByText('Saved. This customer is awaiting approval by a supervisor.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Beneficial owners' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add At least one beneficial owner' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('a registration number already in use names that business', async ({ page }) => {
    await customers(page);
    await newCustomer(page, 'Business');
    await page.getByRole('textbox', { name: /^Business name/ }).fill('Darko Farms');
    await page.getByRole('textbox', { name: /^Registration number/ }).fill('CS123456789');
    await page.getByRole('combobox', { name: /^Legal form/ }).selectOption({ label: 'Limited company' });
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('textbox', { name: /^Mobile/ }).fill('024 111 2222');
    await page.getByRole('textbox', { name: /^Address line 1/ }).fill('Techiman');
    await page.getByRole('combobox', { name: /^Source of funds/ }).fill('Farming');
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(
      page.getByText(
        'A business with this registration number already exists: Darko Farms Limited (0000000104).',
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open that customer' })).toBeVisible();
  });
});

test.describe('Beneficial owners (F6)', () => {
  test('the running total blocks more than 100 percent', async ({ page }) => {
    await customers(page);
    await page.goto('/customers/104/owners');
    await expect(page.getByRole('cell', { name: /Akosua Darko/ })).toBeVisible();
    await page.getByRole('button', { name: 'Edit owners' }).click();

    await pick(page, 'Find an individual', 'Yaw', 'Yaw Ofori');
    const share = page.getByRole('textbox', { name: 'Share for Yaw Ofori, percent' });
    await expect(share).toBeFocused();
    await share.fill('50');
    await expect(page.getByText('110% (more than 100)')).toBeVisible();
    await page.getByRole('button', { name: 'Save owners' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toContainText(
      'Ownership adds up to more than 100 percent.',
    );
    await expectNoAxeViolations(page);

    await share.fill('40');
    await expect(page.getByText(/^\s*100%/)).toBeVisible();
    await page.getByRole('button', { name: 'Save owners' }).click();
    await expect(page.getByRole('link', { name: 'Yaw Ofori' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '40%' })).toBeVisible();
  });

  test('a person who is not a customer yet is added inline', async ({ page }) => {
    await customers(page);
    await page.goto('/customers/104/owners');
    await page.getByRole('button', { name: 'Edit owners' }).click();
    await page.getByRole('button', { name: 'Add new individual' }).click();

    const dialog = page.getByRole('dialog', { name: 'New individual customer' });
    await dialog.getByRole('textbox', { name: /^First name/ }).fill('Kwabena');
    await dialog.getByRole('textbox', { name: /^Last name/ }).fill('Darko');
    await dialog.getByRole('combobox', { name: /^Gender/ }).selectOption({ label: 'Male' });
    await dialog.getByRole('textbox', { name: /^Date of birth/ }).fill('02/02/1975');
    await dialog.getByRole('combobox', { name: /^ID type/ }).selectOption({ label: 'Passport' });
    await dialog.getByRole('textbox', { name: /^ID number/ }).fill('G7654321');
    await dialog.getByRole('textbox', { name: /^Mobile/ }).fill('024 333 4444');
    await dialog.getByRole('textbox', { name: /^Address line 1/ }).fill('Techiman');
    await dialog.getByRole('combobox', { name: /^Source of funds/ }).fill('Farming');
    await dialog.getByRole('textbox', { name: /^Occupation or sector/ }).fill('Farmer');
    await expectNoAxeViolations(page);
    await dialog.getByRole('button', { name: 'Create customer' }).click();

    await expect(dialog).toBeHidden();
    await expect(page.getByRole('textbox', { name: 'Share for Kwabena Darko, percent' })).toBeVisible();
  });
});

test.describe('Group onboarding and members (F6, UX 6.4)', () => {
  test('the chairperson is required, must be free of other groups, and becomes the first member', async ({
    page,
  }) => {
    await customers(page);
    await newCustomer(page, 'Group');
    await expect(page.getByRole('heading', { level: 1, name: 'New group' })).toBeVisible();
    await page.getByRole('textbox', { name: /^Group name/ }).fill('Adom Farmers Group');
    await page.getByRole('combobox', { name: /^Meeting frequency/ }).fill('Monthly');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toContainText(
      'Choose the chairperson.',
    );

    await pick(page, 'Find the chairperson', 'Akosua', 'Akosua Darko');
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(
      page.getByText('This person is already an active member of another group (0000000105).'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Change chairperson' }).click();
    await pick(page, 'Find the chairperson', 'Yaw', 'Yaw Ofori');
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Adom Farmers Group' })).toBeVisible();
    await expect(page).toHaveURL(/\/members$/);
    const members = page.getByRole('list', { name: 'Active members' });
    await expect(members).toContainText('Yaw Ofori');
    await expect(members).toContainText('Chairperson');
    await expectNoAxeViolations(page);
  });

  test('add a member, then mark them as left', async ({ page }) => {
    await customers(page);
    await page.goto('/customers/105/members');
    await page.getByRole('button', { name: 'Add member' }).click();
    await pick(page, 'Find an individual', 'Esi', 'Esi Quaye');
    await page.getByRole('button', { name: 'Add member' }).click();

    const members = page.getByRole('list', { name: 'Active members' });
    await expect(members).toContainText('Esi Quaye');
    await expect(page.getByRole('heading', { name: 'Members (2)' })).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Esi Quaye' }).click();
    await page.getByRole('menuitem', { name: 'Mark as left the group' }).click();
    await page
      .getByRole('dialog', { name: 'Mark as left?' })
      .getByRole('button', { name: 'Mark as left' })
      .click();
    await expect(page.getByRole('heading', { name: 'Members (1)' })).toBeVisible();
    await expect(page.getByText('Former members (1)')).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('tellers cannot start a group', async ({ page }) => {
    await customers(page, USERS.teller);
    await page.goto('/customers/new/group');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });
});

test.describe('Business and group details (F6)', () => {
  test('a business is edited in place and the TIN is masked', async ({ page }) => {
    await customers(page);
    await page.goto('/customers/104/details');
    await expect(page.getByTestId('masked-value').first()).toHaveText('****4567');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByRole('textbox', { name: /^Sector/ }).fill('Poultry');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('definition').filter({ hasText: 'Poultry' })).toBeVisible();
  });

  test('a group shows its chairperson and member count', async ({ page }) => {
    await customers(page);
    await page.goto('/customers/105/details');
    await expect(page.getByRole('definition').filter({ hasText: 'Akosua Darko' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Members' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Documents' })).toHaveCount(0);
  });
});
