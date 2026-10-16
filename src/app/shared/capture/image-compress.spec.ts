import { CaptureError, MAX_PDF_BYTES, encodeUnder, fitWithin, prepareFile, sniff } from './image-compress';

const pdf = (bytes: number) => {
  const data = new Uint8Array(bytes);
  data.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
  return new Blob([data], { type: 'application/pdf' });
};

describe('image capture rules', () => {
  it('keeps the longest side within 2000 px and the aspect ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 1500, height: 2000 });
    expect(fitWithin(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('lowers the quality from 0.85 toward 0.5 until the file is under 2 MB', async () => {
    const tried: number[] = [];
    const sizes: Record<string, number> = { '0.85': 4e6, '0.75': 3e6, '0.65': 2.5e6, '0.55': 1.9e6 };
    const result = await encodeUnder(async (quality) => {
      tried.push(quality);
      return new Blob([new Uint8Array(sizes[String(quality)] ?? 1e6)]);
    });
    expect(tried).toEqual([0.85, 0.75, 0.65, 0.55]);
    expect(result.blob.size).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(result.scale).toBe(1);
  });

  it('draws smaller when even quality 0.5 is too large', async () => {
    const result = await encodeUnder(
      async (_quality, scale) => new Blob([new Uint8Array(scale < 1 ? 1e6 : 5e6)]),
    );
    expect(result.scale).toBeCloseTo(0.8);
  });

  it('tells file types by their first bytes', async () => {
    expect(await sniff(pdf(10))).toBe('pdf');
    expect(await sniff(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]))).toBe('jpeg');
    expect(await sniff(new Blob(['hello']))).toBe('other');
  });

  it('passes PDFs through up to 5 MB and rejects larger ones', async () => {
    const small = await prepareFile(pdf(1000), { allowPdf: true });
    expect(small.type).toBe('application/pdf');
    expect(small.blob.size).toBe(1000);

    await expect(prepareFile(pdf(MAX_PDF_BYTES + 1), { allowPdf: true })).rejects.toEqual(
      new CaptureError('pdf-too-large'),
    );
    await expect(prepareFile(pdf(1000), { allowPdf: false })).rejects.toEqual(
      new CaptureError('type-not-allowed'),
    );
    await expect(prepareFile(new Blob(['text'], { type: 'text/plain' }), { allowPdf: true })).rejects.toEqual(
      new CaptureError('type-not-allowed'),
    );
  });
});
