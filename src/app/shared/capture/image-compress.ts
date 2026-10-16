import { JPEG_BACKGROUND } from './pixel-colours';

/**
 * Capture rules (frontend plan 6.6, UX 3.2): photos are fixed for orientation, downscaled so the longest side is at
 * most 2000 px and re-encoded as JPEG, lowering quality from 0.85 toward 0.5 until the file is under 2 MB. PDFs pass
 * through and must be 5 MB or less. Everything stays in memory.
 */
export const MAX_SIDE = 2000;
export const TARGET_BYTES = 2 * 1024 * 1024;
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
const QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.5];

export type CaptureErrorCode = 'pdf-too-large' | 'type-not-allowed' | 'unreadable';

export class CaptureError extends Error {
  constructor(readonly code: CaptureErrorCode) {
    super(code);
  }
}

export const CAPTURE_MESSAGES: Readonly<Record<CaptureErrorCode, string>> = {
  'pdf-too-large': 'This PDF is larger than 5 MB. Choose a smaller file.',
  'type-not-allowed': 'Choose a JPEG or PNG photo, or a PDF of up to 5 MB.',
  unreadable: 'This image could not be read. Take the photo again or choose another file.',
};

export interface PreparedFile {
  blob: Blob;
  type: 'image/jpeg' | 'application/pdf';
  width: number | null;
  height: number | null;
}

/** The size to draw at: the longest side becomes at most `max`, the aspect ratio is kept. */
export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) {
    return { width, height };
  }
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Encodes at falling qualities until the result is under `target`. When even the lowest quality is too large, the
 * caller's `shrink` is asked for a smaller drawing (80% each time) and the qualities are tried again.
 */
export async function encodeUnder(
  encode: (quality: number, scale: number) => Promise<Blob>,
  target = TARGET_BYTES,
): Promise<{ blob: Blob; scale: number }> {
  let scale = 1;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const quality of QUALITIES) {
      const blob = await encode(quality, scale);
      if (blob.size <= target) {
        return { blob, scale };
      }
    }
    scale *= 0.8;
  }
  return { blob: await encode(QUALITIES[QUALITIES.length - 1], scale), scale };
}

/** Reads the first bytes to tell a PDF from an image, whatever the file's name says. */
export async function sniff(file: Blob): Promise<'pdf' | 'jpeg' | 'png' | 'other'> {
  const head = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const starts = (...bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  if (starts(0x25, 0x50, 0x44, 0x46)) {
    return 'pdf';
  }
  if (starts(0xff, 0xd8, 0xff)) {
    return 'jpeg';
  }
  if (starts(0x89, 0x50, 0x4e, 0x47)) {
    return 'png';
  }
  return 'other';
}

/** Prepares a captured or chosen file for upload. Throws `CaptureError` with a code for the UX message. */
export async function prepareFile(file: Blob, options: { allowPdf: boolean }): Promise<PreparedFile> {
  const kind = await sniff(file);
  if (kind === 'pdf') {
    if (!options.allowPdf) {
      throw new CaptureError('type-not-allowed');
    }
    if (file.size > MAX_PDF_BYTES) {
      throw new CaptureError('pdf-too-large');
    }
    return {
      blob: file.slice(0, file.size, 'application/pdf'),
      type: 'application/pdf',
      width: null,
      height: null,
    };
  }
  if (kind === 'other' && !file.type.startsWith('image/')) {
    throw new CaptureError('type-not-allowed');
  }

  let bitmap: ImageBitmap;
  try {
    // 'from-image' applies the EXIF orientation, so a phone photo comes out the right way up.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new CaptureError(kind === 'other' ? 'type-not-allowed' : 'unreadable');
  }

  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const { blob, scale } = await encodeUnder((quality, scale) =>
      drawJpeg(bitmap, Math.round(size.width * scale), Math.round(size.height * scale), quality),
    );
    return {
      blob,
      type: 'image/jpeg',
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    };
  } finally {
    bitmap.close();
  }
}

function drawJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return Promise.reject(new CaptureError('unreadable'));
  }
  // JPEG has no transparency: paint white first so transparent PNGs do not turn black.
  context.fillStyle = JPEG_BACKGROUND;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new CaptureError('unreadable'))),
      'image/jpeg',
      quality,
    ),
  );
}

/** A unique key for the upload, created when the file is captured (frontend plan 6.6), reused on every retry. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
