import AxeBuilder from '@axe-core/playwright';
import { expect, Page, TestInfo } from '@playwright/test';

export const USERS = {
  teller: { code: 'TELLER1', secret: 'Teller-Pass1' },
  kyc: { code: 'KYC1', secret: 'Kyc-Pass1' },
  admin: { code: 'ADMIN', secret: 'Admin-Pass1' },
  field: { code: 'FIELD1', secret: 'Field-Pass1' },
  auditor: { code: 'AUDIT1', secret: 'Audit-Pass1' },
  locked: { code: 'LOCKED', secret: 'Locked-Pass1' },
};

export async function signIn(page: Page, user: { code: string; secret: string }): Promise<void> {
  await page.goto('/login');
  await page.getByRole('textbox', { name: /^Staff code/ }).fill(user.code);
  await page.getByRole('textbox', { name: /^Password/ }).fill(user.secret);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function expectNoAxeViolations(page: Page): Promise<void> {
  // Let enter animations (toasts, dialogs) finish: a half-faded element would fail contrast for the wrong reason.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== 'running' || animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(
    results.violations.map(
      (violation) => `${violation.id}: ${violation.nodes.map((node) => node.target).join(', ')}`,
    ),
  ).toEqual([]);
}

export function isPhone(info: TestInfo): boolean {
  return info.project.name === 'phone';
}

export async function openUserMenu(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Account menu/ }).click();
}
