import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, openUserMenu, signIn } from './support';

const ROAMER = { code: 'ROAMER', secret: 'Roamer-Pass1' };

async function setBusinessDay(page: Page, branchId: number, workingDate: string | null, status = 'OPEN') {
  await page.waitForFunction(() => '__ibMock' in window);
  await page.evaluate(
    ([id, date, code]) =>
      (
        window as unknown as {
          __ibMock: { setBusinessDay(branchId: number, workingDate: string | null, status: string): void };
        }
      ).__ibMock.setBusinessDay(id as number, date as string | null, code as string),
    [branchId, workingDate, status] as const,
  );
}

test.describe('Working date (F3-03)', () => {
  test('the top bar shows the branch and its open working date', async ({ page }) => {
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);

    const date = page.getByTestId('working-date');
    await expect(date).toContainText('14/10/2026');
    await expect(page.getByText('Business day not open')).toHaveCount(0);
    await expectNoAxeViolations(page);
  });

  test('when no day is open the warning chip explains why', async ({ page }) => {
    await page.goto('/login');
    await setBusinessDay(page, 1, '2026-10-13', 'CLOSED');
    await signIn(page, USERS.teller);
    await expect(page).toHaveURL(/\/dashboard$/);

    const chip = page.getByRole('button', { name: 'Business day not open' });
    await expect(chip).toBeVisible();
    await expect(page.getByTestId('working-date')).toHaveCount(0);

    await chip.hover();
    await expect(page.locator('.ant-tooltip-inner')).toContainText('Ask a supervisor to open it.');
    await expectNoAxeViolations(page);
  });

  test('switching branch shows that branch’s business day', async ({ page }) => {
    await signIn(page, ROAMER);
    await expect(page.getByTestId('working-date')).toContainText('14/10/2026');

    await openUserMenu(page);
    await page.getByRole('menuitem', { name: 'Switch branch' }).click();
    const dialog = page.getByRole('dialog', { name: 'Switch branch' });
    await dialog.getByRole('radio', { name: /Kumasi/ }).check();
    await dialog.getByRole('button', { name: 'Switch' }).click();

    await expect(page.getByRole('button', { name: 'Business day not open' })).toBeVisible();
    await expect(page.getByTestId('working-date')).toHaveCount(0);
  });

  test('end of day shows the date with a status chip', async ({ page }) => {
    await page.goto('/login');
    await setBusinessDay(page, 1, '2026-10-14', 'EOD_IN_PROGRESS');
    await signIn(page, USERS.teller);

    await expect(page.getByTestId('working-date')).toContainText('14/10/2026');
    await expect(page.getByRole('button', { name: 'End of day running' })).toBeVisible();
  });
});
