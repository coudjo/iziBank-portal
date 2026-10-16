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

async function start(page: Page, user = USERS.teller) {
  await signIn(page, user);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Customers' }).click();
  await page.getByRole('button', { name: 'New customer' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'New individual customer' })).toBeVisible();
}

interface Person {
  first?: string;
  last?: string;
  dob?: string;
  idNumber?: string;
  mobile?: string;
  address?: string;
}

async function fillIdentity(page: Page, person: Person = {}) {
  await page.getByRole('combobox', { name: 'Title' }).selectOption('Ms');
  await page.getByRole('textbox', { name: /^First name/ }).fill(person.first ?? 'Abena');
  await page.getByRole('textbox', { name: /^Last name/ }).fill(person.last ?? 'Asare');
  await page.getByRole('combobox', { name: /^Gender/ }).selectOption({ label: 'Female' });
  await page.getByRole('textbox', { name: /^Date of birth/ }).fill(person.dob ?? '14/02/1990');
  await page.getByRole('combobox', { name: /^ID type/ }).selectOption({ label: 'Ghana Card' });
  await page.getByRole('textbox', { name: /^ID number/ }).fill(person.idNumber ?? 'gha-711111111-1');
}

async function fillContact(page: Page, person: Person = {}) {
  await page.getByRole('textbox', { name: /^Mobile/ }).fill(person.mobile ?? '024 555 0101');
  await page.getByRole('textbox', { name: /^Address line 1/ }).fill(person.address ?? 'Ring Road, Accra');
}

async function fillFunds(page: Page) {
  await page.getByRole('combobox', { name: /^Source of funds/ }).fill('Trading');
  await page.getByRole('textbox', { name: /^Occupation or sector/ }).fill('Trader');
}

async function next(page: Page) {
  await page.getByRole('button', { name: 'Next' }).click();
}

test.describe('Individual onboarding (F5-02, F5-03)', () => {
  test('happy path: three steps, review, create, land on the record', async ({ page }, info) => {
    await start(page);
    if (isPhone(info)) {
      await expect(page.getByText('Step 1 of 3')).toBeVisible();
    } else {
      await expect(page.getByRole('list', { name: 'Onboarding steps' })).toBeVisible();
    }
    await expectNoAxeViolations(page);

    await fillIdentity(page);
    await next(page);
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await fillContact(page);
    await expectNoAxeViolations(page);
    await next(page);

    await expect(page.getByRole('heading', { name: 'Funds and review' })).toBeVisible();
    await fillFunds(page);
    await expect(page.getByText('Ms Abena Asare')).toBeVisible();
    await expect(page.getByText('****11-1')).toBeVisible();
    await expect(page.getByText('024 555 0101')).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('textbox', { name: /^Mobile/ })).toHaveValue('024 555 0101');
    await next(page);

    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Abena Asare' })).toBeVisible();
    await expect(page.getByText('Saved. This customer is awaiting approval by a supervisor.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Complete the profile/ })).toBeVisible();
    await expect(page).not.toHaveURL(/Abena|GHA/i);
    await expectNoAxeViolations(page);
  });

  test('each step checks its fields before moving on', async ({ page }) => {
    await start(page);
    await next(page);
    const summary = page.getByRole('alert').filter({ hasText: 'There is a problem' });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText('Enter the first name.');
    await expect(summary).toContainText('Choose the ID type.');
    await expectNoAxeViolations(page);

    await summary.getByRole('button', { name: 'Enter the first name.' }).click();
    await expect(page.getByRole('textbox', { name: /^First name/ })).toBeFocused();

    await fillIdentity(page, { dob: '01/01/2015' });
    await next(page);
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toContainText(
      'The customer must be at least 18 years old.',
    );

    await page.getByRole('textbox', { name: /^Date of birth/ }).fill('31/02/1990');
    await next(page);
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toContainText(
      'Enter a real date, for example 27/03/1985.',
    );
  });

  test('a duplicate ID stays on step 1 and offers the existing customer', async ({ page }) => {
    await start(page);
    await fillIdentity(page, { idNumber: 'GHA-700000001-1' });
    await next(page);
    await fillContact(page);
    await next(page);
    await fillFunds(page);
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(
      page.getByText('A customer with this ID already exists: Akosua Darko (0000000101).'),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Identity' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^First name/ })).toHaveValue('Abena');
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Open that customer' }).click();
    const leave = page.getByRole('dialog', { name: 'Leave this page?' });
    await leave.getByRole('button', { name: 'Leave' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();
  });

  test('a server validation error lands on its field and step', async ({ page }) => {
    await start(page);
    await fillIdentity(page);
    await next(page);
    await fillContact(page, { address: 'SERVER-ERROR' });
    await next(page);
    await fillFunds(page);
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Address line 1/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByText('The address could not be accepted.').first()).toBeVisible();
    await expect(page.getByRole('textbox', { name: /^Address line 1/ })).toHaveValue('SERVER-ERROR');
  });

  test('a dropped connection on Create: Check now finds the saved customer', async ({ page }) => {
    await start(page);
    await fillIdentity(page, { first: 'Kofi', last: 'Mensah', idNumber: 'GHA-722222222-2' });
    await next(page);
    await fillContact(page);
    await next(page);
    await fillFunds(page);
    await mock(page, 'dropNextCreate');
    await page.getByRole('button', { name: 'Create customer' }).click();

    await expect(page.getByRole('heading', { name: 'We could not confirm this was saved' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Check now' }).click();
    await expect(page.getByText(/This customer was saved: Kofi Mensah/)).toBeVisible();
    await page.getByRole('button', { name: 'Open the customer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Kofi Mensah' })).toBeVisible();
  });

  test('the session ends mid-form: the data stays and the same user creates after signing in', async ({
    page,
  }) => {
    await page.clock.install();
    await start(page);
    await fillIdentity(page);
    await next(page);
    await fillContact(page);
    await next(page);
    await fillFunds(page);

    await page.clock.fastForward('15:05');
    const dialog = page.getByRole('dialog', { name: 'Sign in again' });
    await dialog.getByRole('textbox', { name: /^Password/ }).fill(USERS.teller.secret);
    await dialog.getByRole('button', { name: 'Sign in' }).click();
    await expect(dialog).toBeHidden();

    await expect(page.getByRole('textbox', { name: /^Occupation or sector/ })).toHaveValue('Trader');
    await page.getByRole('button', { name: 'Create customer' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Abena Asare' })).toBeVisible();
  });

  test('leaving with entered data asks first', async ({ page }) => {
    await start(page);
    await page.getByRole('textbox', { name: /^First name/ }).fill('Abena');
    await page.getByRole('button', { name: 'Cancel' }).click();
    const leave = page.getByRole('dialog', { name: 'Leave this page?' });
    await expect(leave).toContainText('The details you entered will be lost.');
    await leave.getByRole('button', { name: 'Stay' }).click();
    await expect(page.getByRole('textbox', { name: /^First name/ })).toHaveValue('Abena');
  });
});

test.describe('Details edit (F5-05)', () => {
  test("editing an approved customer's name warns first, and cancelling changes nothing", async ({
    page,
  }) => {
    await signIn(page, USERS.field);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/customers/101/details');
    await page.getByRole('button', { name: 'Edit details' }).click();

    await page.getByRole('textbox', { name: /^Last name/ }).fill('Darko-Mensah');
    await page.getByRole('button', { name: 'Save changes' }).click();
    const warning = page.getByRole('dialog', { name: 'Send back for approval?' });
    await expect(warning).toContainText(
      'Changing this will send the customer back for approval and reset KYC to pending.',
    );
    await expectNoAxeViolations(page);
    await warning.getByRole('button', { name: 'Go back' }).click();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approved' })).toBeVisible();
  });

  test('saving a controlled change sends the customer back for approval', async ({ page }) => {
    await signIn(page, USERS.field);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/customers/101/details');
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByRole('textbox', { name: /^Last name/ }).fill('Darko-Mensah');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page
      .getByRole('dialog', { name: 'Send back for approval?' })
      .getByRole('button', { name: 'Save changes' })
      .click();

    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko-Mensah' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Awaiting approval' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'KYC pending' })).toBeVisible();
  });

  test('tellers cannot edit details', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/customers/101/details');
    await expect(page.getByRole('heading', { name: 'Identity' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit details' })).toHaveCount(0);
  });
});

test.describe('Reflow (F5-06, WCAG 1.4.10)', () => {
  test('onboarding, the list and the record fit 320 px without sideways scrolling', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'one width is enough');
    await page.setViewportSize({ width: 320, height: 640 });
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);

    for (const path of ['/customers', '/customers/new/individual', '/customers/101/details']) {
      await page.goto(path);
      await expect(page.locator('[data-page-title]')).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
