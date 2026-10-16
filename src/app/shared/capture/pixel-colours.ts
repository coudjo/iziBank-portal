/**
 * Colours written into captured image pixels, not UI colours, so they are not theme tokens. A JPEG needs an opaque
 * background, and a specimen signature is stored as black ink whatever the screen looks like.
 * (Allowed by scripts/check-colours.mjs.)
 */
export const JPEG_BACKGROUND = '#ffffff';
export const SIGNATURE_INK = '#000000';
