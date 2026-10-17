import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, openUserMenu, signIn } from './support';

/** A 64 × 48 grey PNG, standing in for a phone photo. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAARElEQVR42u3PMQ0AAAgDsPlXxsODIizwkjSpgaZ6XouAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAwNUCHhbVpZyiMz4AAAAASUVORK5CYII=',
  'base64',
);

async function open(page: Page, user: { code: string; secret: string }, path: string) {
  await signIn(page, user);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(path);
  await expect(page.locator('[data-page-title]')).not.toHaveText('Customer');
}

async function switchUser(page: Page, user: { code: string; secret: string }, path: string) {
  await openUserMenu(page).catch(async () => {
    await page.getByRole('button', { name: 'More' }).click();
  });
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await open(page, user, path);
}

async function mock(page: Page, hook: string) {
  await page.evaluate(
    (name) => (window as unknown as { __ibMock: Record<string, () => void> }).__ibMock[name](),
    hook,
  );
}

async function choosePhoto(page: Page, scope = page.locator('body')) {
  await scope
    .locator('ib-image-capture input[type="file"]:not([capture])')
    .first()
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: PNG });
  await expect(scope.getByTestId('capture-result').first()).toContainText('Ready: JPEG');
}

test.describe('KYC tab (F7, UX 6.5)', () => {
  test('a complete customer: view the files, then verify and approve in one step', async ({ page }) => {
    await open(page, USERS.kyc, '/customers/106/kyc');
    await expect(page.getByRole('heading', { level: 1, name: 'Kwame Asante' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Verify KYC' })).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Show documents and photo' }).click();
    await expect(page.getByText('Photo (1 of 2)')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Ghana Card \*\*\*\*06-6 \(2 of 2\)/)).toBeVisible();

    await page.getByRole('button', { name: 'Verify and approve' }).click();
    await expect(
      page.locator('.ant-message').getByText('KYC verified and the customer approved.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Verified' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approved' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Verify KYC' })).toHaveCount(0);
  });

  test('an incomplete customer cannot be verified, and says why; Reject needs a reason', async ({ page }) => {
    await open(page, USERS.kyc, '/customers/102/kyc');
    await expect(page.getByRole('button', { name: 'Verify and approve' })).toBeDisabled();
    await expect(
      page.getByText(/^Missing: approved photo, identification document with an image/),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add Approved photo' })).toHaveAttribute(
      'href',
      /\/documents$/,
    );

    await page.getByRole('button', { name: 'Reject' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject KYC?' });
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(dialog.getByText('Give the reason.')).toBeVisible();
    await expectNoAxeViolations(page);
    await dialog.getByRole('textbox', { name: /^Reason/ }).fill('ID document unreadable');
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(page.getByRole('button', { name: 'Rejected' }).first()).toBeVisible();
  });
});

test.describe('Documents, photo and signature (F7)', () => {
  test('add a document with its image, view it, delete it; the main ID cannot be deleted', async ({
    page,
  }) => {
    await open(page, USERS.field, '/customers/102/documents');
    await page.getByRole('button', { name: 'Add document' }).click();
    const form = page.getByRole('form', { name: 'Add a document' });
    await form.getByRole('combobox', { name: /^Document type/ }).selectOption({ label: 'Passport' });
    await form.getByRole('textbox', { name: /^Document number/ }).fill('g1234567');
    await form.getByRole('textbox', { name: /^Expires on/ }).fill('01/01/2035');
    await choosePhoto(page, form);
    await expectNoAxeViolations(page);
    await form.getByRole('button', { name: 'Save document' }).click();

    const list = page.getByRole('list', { name: 'Documents' });
    await expect(list.getByText('****4567')).toBeVisible();
    await expect(list.getByText('Image on file')).toHaveCount(1);

    await page.getByRole('button', { name: 'Actions for Passport' }).click();
    await page.getByRole('menuitem', { name: 'View image' }).click();
    const viewer = page.getByRole('dialog', { name: 'Passport' });
    await expect(viewer.getByRole('img', { name: 'Passport' })).toBeVisible();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Actions for Ghana Card' }).click();
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Actions for Passport' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page
      .getByRole('dialog', { name: 'Delete this document?' })
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(list.getByText('****4567')).toHaveCount(0);
  });

  test('a lost photo upload keeps the photo and retries; a supervisor then approves it', async ({ page }) => {
    await open(page, USERS.field, '/customers/102/documents');
    const photo = page.getByRole('region', { name: 'Photo' });
    await choosePhoto(page, photo);
    await mock(page, 'failNextUpload');
    await photo.getByRole('button', { name: 'Save photo' }).click();
    await expect(photo.getByText(/The upload did not finish/)).toBeVisible();
    await photo.getByRole('button', { name: 'Retry upload' }).click();
    await expect(photo.getByRole('button', { name: 'View photo' })).toBeVisible();
    await expect(photo.getByText('Awaiting approval')).toBeVisible();

    await switchUser(page, USERS.kyc, '/customers/102/documents');
    const review = page.getByRole('region', { name: 'Photo' });
    await review.getByRole('button', { name: 'Approve photo' }).click();
    await expect(review.getByText('Approved')).toBeVisible();
  });

  test('capture a specimen signature; it waits for approval', async ({ page }) => {
    await open(page, USERS.field, '/customers/102/documents');
    const section = page.getByRole('region', { name: 'Specimen signature' });
    await section.getByRole('button', { name: 'Capture signature' }).click();
    const canvas = section.getByRole('img', { name: /Signature area/ });
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 100);
    await page.mouse.down();
    for (let step = 1; step <= 15; step++) {
      await page.mouse.move(box.x + 30 + step * 10, box.y + 100 - Math.sin(step) * 25);
    }
    await page.mouse.up();
    await section.getByRole('checkbox', { name: 'The customer has signed in front of me' }).check();
    await section.getByRole('button', { name: 'Accept' }).click();
    await section.getByRole('button', { name: 'Save signature' }).click();
    await expect(section.getByText('A new signature is waiting for approval.')).toBeVisible();
    await expect(section.getByRole('button', { name: 'View new signature' })).toBeVisible();
  });
});

test.describe('Next of kin and regulatory attributes (F7)', () => {
  test('add, edit and remove a next of kin', async ({ page }) => {
    await open(page, USERS.field, '/customers/102/next-of-kin');
    await page.getByRole('button', { name: 'Add next of kin' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'There is a problem' })).toContainText(
      'Enter the full name.',
    );
    await page.getByRole('textbox', { name: /^Full name/ }).fill('Ama Ofori');
    await page.getByRole('combobox', { name: /^Relationship/ }).fill('Spouse');
    await page.getByRole('textbox', { name: /^Mobile/ }).fill('024 777 8888');
    await page.getByRole('button', { name: 'Save' }).click();

    const list = page.getByRole('list', { name: 'Next of kin' });
    await expect(list).toContainText('Ama Ofori');
    await expect(list).toContainText('024 777 8888');
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Actions for Ama Ofori' }).click();
    await page.getByRole('menuitem', { name: 'Remove' }).click();
    await page
      .getByRole('dialog', { name: 'Remove next of kin?' })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.getByRole('heading', { name: 'No next of kin yet' })).toBeVisible();
  });

  test('values are versions: a change keeps the history', async ({ page }) => {
    await open(page, USERS.field, '/customers/102/regulatory');
    await page.getByRole('button', { name: 'Record a value' }).click();
    await page.getByRole('textbox', { name: /^Attribute code/ }).fill('risk_rating');
    await page.getByRole('textbox', { name: /^Value/ }).fill('LOW');
    await page.getByRole('button', { name: 'Save value' }).click();
    await expect(page.getByRole('cell', { name: 'RISK_RATING', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Change RISK_RATING' }).click();
    await expect(page.getByRole('textbox', { name: /^Attribute code/ })).toBeDisabled();
    await page.getByRole('textbox', { name: /^Value/ }).fill('MEDIUM');
    await page.getByRole('button', { name: 'Save value' }).click();
    await expect(page.getByRole('cell', { name: 'MEDIUM', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'History of RISK_RATING' }).click();
    const history = page.getByRole('table', { name: 'Every value recorded, newest first' });
    await expect(history.getByRole('row')).toHaveCount(3);
    await expectNoAxeViolations(page);
  });
});

test.describe('Activity tab (F7)', () => {
  test('is hidden without audit permission', async ({ page }) => {
    await open(page, USERS.kyc, '/customers/106/overview');
    await expect(page.getByRole('link', { name: 'Activity' })).toHaveCount(0);
    await page.goto('/customers/106/activity');
    await expect(page.getByRole('heading', { level: 1, name: 'You cannot open this page' })).toBeVisible();
  });

  test('lists what was done to the customer', async ({ page }) => {
    await open(page, USERS.kyc, '/customers/106/kyc');
    await page.getByRole('button', { name: 'Verify and approve' }).click();
    await expect(page.getByRole('button', { name: 'Verified' }).first()).toBeVisible();

    await openUserMenu(page).catch(async () => page.getByRole('button', { name: 'More' }).click());
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await signIn(page, USERS.admin);
    await page.getByRole('textbox', { name: /^Current password/ }).fill(USERS.admin.secret);
    await page.getByRole('textbox', { name: /^New password/ }).fill('Admin-Pass2');
    await page.getByRole('textbox', { name: /^Confirm new password/ }).fill('Admin-Pass2');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/customers/106/activity');
    await expect(page.getByText('Viewing the audit log is itself recorded.')).toBeVisible();
    await expect(page.getByText('Verified KYC and approved').first()).toBeVisible();
    await expect(page.getByText('KYC1').first()).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
