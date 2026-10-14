// Frontend plan F1-04: text pairs need 4.5:1, control borders and focus need 3:1 (WCAG 2.2 AA).
// Also fails when the NG-ZORRO theme drifts from the tokens.
import { readFileSync } from 'node:fs';

const tokensCss = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...tokensCss.matchAll(/(--ib-[a-z-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2].toUpperCase()]),
);
const pairs = JSON.parse(readFileSync(new URL('./contrast-pairs.json', import.meta.url), 'utf8'));

const hex = (value) => (value.startsWith('#') ? value.toUpperCase() : tokens[value]);
const channel = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (h) => {
  const n = parseInt(h.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const ratio = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

let failed = false;
for (const [kind, minimum] of [
  ['text', 4.5],
  ['nonText', 3],
]) {
  for (const [fg, bg] of pairs[kind]) {
    const a = hex(fg);
    const b = hex(bg);
    if (!a || !b) {
      console.error(`Unknown token in pair ${fg} / ${bg}`);
      failed = true;
      continue;
    }
    const value = ratio(a, b);
    if (value < minimum) {
      console.error(`${fg} on ${bg}: ${value.toFixed(2)}:1, needs ${minimum}:1`);
      failed = true;
    }
  }
}

const theme = readFileSync(new URL('../src/styles/zorro-theme.less', import.meta.url), 'utf8');
const mirror = {
  '@primary-color': '--ib-primary',
  '@info-color': '--ib-info-text',
  '@success-color': '--ib-success-text',
  '@warning-color': '--ib-warning-text',
  '@error-color': '--ib-danger-text',
  '@text-color': '--ib-ink',
  '@text-color-secondary': '--ib-ink-muted',
  '@border-color-base': '--ib-border-control',
  '@border-color-split': '--ib-line',
  '@outline-color': '--ib-focus',
  '@body-background': '--ib-page',
};
for (const [lessVar, token] of Object.entries(mirror)) {
  const match = theme.match(new RegExp(`${lessVar}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match || match[1].toUpperCase() !== tokens[token]) {
    console.error(`${lessVar} in zorro-theme.less does not match ${token} (${tokens[token]})`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log(`Contrast and theme check passed (${pairs.text.length + pairs.nonText.length} pairs).`);
