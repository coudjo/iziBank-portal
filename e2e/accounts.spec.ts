import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, isPhone, signIn, signInAdmin } from './support';

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

async function openAs(page: Page, user: { code: string; secret: string } | 'admin', path: string) {
  if (user === 'admin') {
    await signInAdmin(page);
  } else {
    await signIn(page, user);
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  await page.goto(path);
}

async function action(page: Page, name: string) {
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name }).click();
}

test.describe('Accounts list and record (F9, UX 7.4)', () => {
  test('tellers search accounts, read the record and add reminders, but do not hold or close', async ({
    page,
  }) => {
    await openAs(page, USERS.teller, '/accounts');
    await expect(page.getByRole('heading', { level: 1, name: 'Accounts' })).toBeVisible();
    await expect(page.getByText('1000000000001').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('searchbox', { name: /^Search/ }).fill('2000');
    await expect(page.getByText('1000000000001')).toHaveCount(0);
    await expect(page.getByText('2000000000003').first()).toBeVisible();
    await page.getByRole('combobox', { name: 'Status' }).selectOption('ACTIVE');
    await expect(page.getByText('No accounts match')).toBeVisible();

    await page.goto('/accounts/201');
    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();
    await expect(page.getByText('No transactions yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
    const tabs = page.getByRole('navigation', { name: 'Account record' });
    await expect(tabs.getByRole('link', { name: 'Balance and holds' })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Classification' })).toHaveCount(0);
    await expectNoAxeViolations(page);

    await page.getByRole('textbox', { name: /^New reminder/ }).fill('Ask for the updated Ghana Card');
    await page.getByRole('button', { name: 'Add reminder' }).click();
    const reminders = page.getByRole('list', { name: 'Reminders' });
    await expect(reminders).toContainText('Ask for the updated Ghana Card');
    await page.getByRole('button', { name: /^Remove reminder/ }).click();
    await expect(page.getByText('No reminders.', { exact: false })).toBeVisible();

    await tabs.getByRole('link', { name: 'Holders' }).click();
    await expect(page.getByText('Operating mode: Single')).toBeVisible();
    await expect(page.getByText('Primary holder').first()).toBeVisible();
  });

  test('a supervisor holds and releases with the new available balance shown, then freezes', async ({
    page,
  }) => {
    // Two dialogs, a freeze and two accessibility scans: longer than the default 30 s on a busy machine.
    test.slow();
    await openAs(page, 'admin', '/accounts/201');
    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();

    await action(page, 'Hold amount');
    const hold = page.getByRole('dialog', { name: 'Hold amount' });
    await hold.getByRole('button', { name: 'Hold amount' }).click();
    await expect(hold.getByText('Enter an amount greater than zero', { exact: false })).toBeVisible();
    await hold.getByRole('textbox', { name: /^Amount/ }).fill('150.50');
    await expect(hold.getByTestId('available-after')).toHaveText('GH₵ -150.50');
    await hold.getByRole('textbox', { name: /^Remarks/ }).fill('Court order 42');
    await expectNoAxeViolations(page);
    await hold.getByRole('button', { name: 'Hold amount' }).click();
    await expect(page.locator('.ant-message').getByText('Amount held.')).toBeVisible();
    await expect(page.getByTestId('available-balance')).toHaveText('GH₵ -150.50');

    await action(page, 'Release hold');
    const release = page.getByRole('dialog', { name: 'Release hold' });
    await release.getByRole('textbox', { name: /^Amount/ }).fill('200');
    await release.getByRole('textbox', { name: /^Remarks/ }).fill('Too much');
    await release.getByRole('button', { name: 'Release hold' }).click();
    await expect(release.getByText('You cannot release more than is held.')).toBeVisible();
    await release.getByRole('textbox', { name: /^Amount/ }).fill('50.50');
    await release.getByRole('button', { name: 'Release hold' }).click();
    await expect(page.getByTestId('available-balance')).toHaveText('GH₵ -100.00');

    await action(page, 'Freeze account');
    const freeze = page.getByRole('dialog', { name: 'Freeze account?' });
    await freeze.getByRole('textbox', { name: /^Remarks/ }).fill('Fraud report');
    await freeze.getByRole('button', { name: 'Freeze account' }).click();
    await expect(page.getByRole('button', { name: 'Frozen' }).first()).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Account record' })
      .getByRole('link', { name: 'Balance and holds' })
      .click();
    const history = page
      .getByRole('table', { name: 'Hold and freeze history' })
      .or(page.locator('ib-data-table'));
    await expect(history.getByText('Freeze account').first()).toBeVisible();
    await expect(history.getByText('Release hold').first()).toBeVisible();
    await expect(history.getByText('Hold amount').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('close is blocked by a hold, then needs a reason and the typed account number', async ({ page }) => {
    // Three dialogs and an accessibility scan: longer than the default 30 s on a busy machine.
    test.slow();
    await openAs(page, 'admin', '/accounts/201');
    await action(page, 'Hold amount');
    const hold = page.getByRole('dialog', { name: 'Hold amount' });
    await hold.getByRole('textbox', { name: /^Amount/ }).fill('10');
    await hold.getByRole('textbox', { name: /^Remarks/ }).fill('Check');
    await hold.getByRole('button', { name: 'Hold amount' }).click();
    await expect(page.getByTestId('available-balance')).toHaveText('GH₵ -10.00');

    await action(page, 'Close account');
    let close = page.getByRole('dialog', { name: 'Close account' });
    await expect(close.getByText('No amounts on hold: not yet')).toBeAttached();
    await close.getByRole('combobox', { name: /^Reason/ }).selectOption({ label: 'Customer request' });
    await close.getByRole('textbox', { name: /^Type the account number/ }).fill('1000000000001');
    await expect(close.getByRole('button', { name: 'Close account' })).toBeDisabled();
    await expectNoAxeViolations(page);
    await close.getByRole('button', { name: 'Cancel' }).click();

    await action(page, 'Release hold');
    const release = page.getByRole('dialog', { name: 'Release hold' });
    await release.getByRole('textbox', { name: /^Amount/ }).fill('10');
    await release.getByRole('textbox', { name: /^Remarks/ }).fill('Released');
    await release.getByRole('button', { name: 'Release hold' }).click();
    await expect(page.getByTestId('available-balance')).toHaveText('GH₵ 0.00');

    await action(page, 'Close account');
    close = page.getByRole('dialog', { name: 'Close account' });
    await expect(close.getByText('No amounts on hold: done')).toBeAttached();
    await close.getByRole('combobox', { name: /^Reason/ }).selectOption({ label: 'Customer request' });
    await close.getByRole('textbox', { name: /^Type the account number/ }).fill('1000000000009');
    await expect(close.getByRole('button', { name: 'Close account' })).toBeDisabled();
    await close.getByRole('textbox', { name: /^Type the account number/ }).fill('1000000000001');
    await close.getByRole('button', { name: 'Close account' }).click();

    await expect(page.getByText('This account is closed and read-only.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Closed' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add reminder' })).toHaveCount(0);
  });

  test('a supervisor approves an account a teller opened, from the approvals inbox', async ({ page }) => {
    await openAs(page, 'admin', '/approvals/accounts');
    await expect(
      page.getByRole('navigation', { name: 'Approvals by type' }).getByRole('link', { name: 'Accounts (1)' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: /2000000000003/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/accounts\/203\/summary$/);
    await expect(page.getByRole('button', { name: 'Awaiting approval' }).first()).toBeVisible();
    await expectNoAxeViolations(page);
    await page.getByRole('group', { name: 'Decision' }).getByRole('button', { name: 'Approve' }).click();
    await expect(
      page.locator('.ant-message').getByText('Account approved. It can now be used.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Active' }).first()).toBeVisible();
    await expect(page.getByRole('group', { name: 'Decision' })).toHaveCount(0);
  });
});

test.describe('Open account (F9, UX 6.7)', () => {
  test.beforeEach(async ({ page }, info) => {
    await openAs(page, USERS.teller, '/accounts/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Open account' })).toBeVisible();
    if (isPhone(info)) {
      await expect(page.getByText('easier on a tablet or computer')).toBeVisible();
      await page.getByRole('button', { name: 'Continue anyway' }).click();
    }
  });

  test('an individual account: product, holder, review, then the new number awaiting approval', async ({
    page,
  }) => {
    await page.getByRole('combobox', { name: /^Product/ }).selectOption({ label: 'Regular savings (SAV01)' });
    await expect(page.getByText(/Minimum balance GH₵ 50\.00/)).toBeVisible();

    const search = page.getByRole('searchbox', { name: /^Primary holder/ });
    await search.fill('Yaw');
    const results = page.getByRole('list', { name: 'Primary holder results' });
    await expect(results.getByText('Awaiting approval').first()).toBeVisible();
    await expect(results.getByRole('link', { name: /Open customer/ })).toBeVisible();
    await expectNoAxeViolations(page);

    await search.fill('Akosua');
    await page.getByRole('button', { name: 'Choose Akosua Darko' }).click();
    await expect(page.getByRole('list', { name: 'Holders added' })).toContainText('Akosua Darko');
    await expect(page.getByRole('textbox', { name: /^Account name/ })).toHaveValue('Akosua Darko');
    await expect(page.getByText('Operating mode: Single')).toBeVisible();

    await page.getByRole('button', { name: 'Open account' }).click();
    await expect(page.getByRole('heading', { name: 'Account opened' })).toBeVisible();
    await expect(page.getByTestId('opened-number')).toHaveText(/^10\d{11}$/);
    await expect(
      page.getByText('Awaiting approval. The account cannot be used until a supervisor approves it.'),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('link', { name: 'Done' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();
    await expect(page.getByText('Account opened. Awaiting approval.', { exact: false })).toBeVisible();
  });

  test('a joint account asks for either or all to sign and joins the names', async ({ page }) => {
    await page.getByRole('combobox', { name: /^Product/ }).selectOption({ label: 'Regular savings (SAV01)' });
    await page.getByRole('searchbox', { name: /^Primary holder/ }).fill('Akosua');
    await page.getByRole('button', { name: 'Choose Akosua Darko' }).click();
    await page.getByRole('button', { name: 'Add joint holder' }).click();
    await page.getByRole('searchbox', { name: /^Joint holder/ }).fill('Adjoa');
    await page.getByRole('button', { name: 'Choose Adjoa Boakye' }).click();
    await expect(page.getByRole('textbox', { name: /^Account name/ })).toHaveValue(
      'Akosua Darko & Adjoa Boakye',
    );

    await page.getByRole('button', { name: 'Open account' }).click();
    await expect(page.getByRole('list', { name: 'Before you can open the account' })).toContainText(
      'Choose either to sign or all to sign.',
    );
    await page.getByRole('radio', { name: 'All to sign' }).check();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Open account' }).click();
    await expect(page.getByRole('heading', { name: 'Account opened' })).toBeVisible();
  });

  test('without an open business day the page is disabled with the reason', async ({ page }) => {
    await mock(page, 'setBusinessDay', 1, null);
    await page.reload();
    await expect(page.getByText('The business day is not open for this branch.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open account' })).toHaveCount(0);
  });
});

test.describe('Customer accounts (F9, UX 7.3)', () => {
  test('the customer record lists accounts held and opens a new one for that customer', async ({
    page,
  }, info) => {
    await openAs(page, USERS.teller, '/customers/101/accounts');
    await expect(page.getByRole('heading', { level: 1, name: 'Akosua Darko' })).toBeVisible();
    await expect(page.getByText('1000000000002').first()).toBeVisible();
    await expect(page.getByText('Dormant').first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Open account' }).click();
    await expect(page).toHaveURL(/\/accounts\/new$/);
    if (isPhone(info)) {
      await page.getByRole('button', { name: 'Continue anyway' }).click();
    }
    await expect(page.getByRole('list', { name: 'Holders added' })).toContainText('Akosua Darko');
  });
});
