import { Page, expect, test } from '@playwright/test';
import { USERS, expectNoAxeViolations, signIn } from './support';

async function gallery(page: Page) {
  await signIn(page, USERS.teller);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dev/components');
  await expect(page.getByRole('heading', { name: 'Capture' })).toBeVisible();
}

/** Builds a large noisy JPEG in the page and hands it to the file picker, as a phone camera would. */
async function chooseGeneratedPhoto(page: Page, width: number, height: number): Promise<number> {
  const size = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const context = canvas.getContext('2d')!;
      const image = context.createImageData(w, h);
      for (let index = 0; index < image.data.length; index += 4) {
        image.data[index] = Math.random() * 255;
        image.data[index + 1] = Math.random() * 255;
        image.data[index + 2] = Math.random() * 255;
        image.data[index + 3] = 255;
      }
      context.putImageData(image, 0, 0);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.95),
      );
      const transfer = new DataTransfer();
      transfer.items.add(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      const input = document.querySelector<HTMLInputElement>('ib-image-capture input[accept*="pdf"]')!;
      input.files = transfer.files;
      input.dispatchEvent(new Event('change'));
      return blob.size;
    },
    [width, height] as const,
  );
  return size;
}

test.describe('Capture (F4-03, F4-04)', () => {
  test('a large photo becomes 2 MB or less with the longest side at most 2000 px', async ({ page }) => {
    await gallery(page);
    const original = await chooseGeneratedPhoto(page, 4000, 3000);
    expect(original).toBeGreaterThan(6 * 1024 * 1024);

    const result = page.getByTestId('capture-result');
    await expect(result).toContainText('Ready: JPEG', { timeout: 20_000 });
    const text = (await result.textContent()) ?? '';
    const [, megabytes, width, height] = /([\d.]+) MB, (\d+) × (\d+) px/.exec(text) ?? [];
    expect(Number(megabytes)).toBeLessThanOrEqual(2);
    expect(Math.max(Number(width), Number(height))).toBeLessThanOrEqual(2000);
    expect(Number(width)).toBeGreaterThan(Number(height));
    await expectNoAxeViolations(page);
  });

  test('a PDF over 5 MB is refused with the size in the message', async ({ page }) => {
    await gallery(page);
    const header = Buffer.from('%PDF-1.7\n');
    await page.locator('ib-image-capture input[accept*="pdf"]').setInputFiles({
      name: 'big.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.concat([header, Buffer.alloc(5 * 1024 * 1024)]),
    });
    await expect(page.getByText('This PDF is larger than 5 MB. Choose a smaller file.')).toBeVisible();
  });

  test('the signature pad needs a signature and the tick before Accept', async ({ page }) => {
    await gallery(page);
    const canvas = page.getByRole('img', { name: /Signature area/ });
    await canvas.scrollIntoViewIfNeeded();
    const accept = page.getByRole('button', { name: 'Accept' });
    await expect(accept).toBeDisabled();

    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 120);
    await page.mouse.down();
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(box.x + 30 + step * 12, box.y + 120 - Math.sin(step / 2) * 30);
    }
    await page.mouse.up();
    await expect(accept).toBeDisabled();

    await page.getByRole('checkbox', { name: 'The customer has signed in front of me' }).check();
    await expect(accept).toBeEnabled();
    await accept.click();

    const result = page.getByTestId('signature-result');
    await expect(result).toContainText('Signature ready: PNG');
    const [, width, height] = /(\d+) × (\d+) px/.exec((await result.textContent()) ?? '') ?? [];
    expect(Number(width)).toBeLessThanOrEqual(2000);
    expect(Number(height)).toBeLessThanOrEqual(1000);

    await page.getByRole('button', { name: 'Clear' }).click();
    await expect(accept).toBeDisabled();
    await expectNoAxeViolations(page);
  });
});
