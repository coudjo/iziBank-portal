// Fails when the portal's error catalog and the API's problem-type list disagree (frontend plan F2-01).
import { readFileSync } from 'node:fs';

const markdown = readFileSync(new URL('../api/problem-types.md', import.meta.url), 'utf8');
const apiCodes = new Set([...markdown.matchAll(/^\|\s*`([a-z0-9.\-]+)`\s*\|/gm)].map((match) => match[1]));

const catalog = readFileSync(new URL('../src/app/core/errors/error-catalog.ts', import.meta.url), 'utf8');
const block = catalog.slice(catalog.indexOf('ERROR_MESSAGES'), catalog.indexOf('};'));
const portalCodes = new Set([...block.matchAll(/^\s+'?([a-z0-9.\-]+)'?:\s/gm)].map((match) => match[1]));

const missing = [...apiCodes].filter((code) => !portalCodes.has(code));
const extra = [...portalCodes].filter((code) => !apiCodes.has(code));

if (missing.length || extra.length) {
  if (missing.length) console.error(`No portal message for: ${missing.join(', ')}`);
  if (extra.length) console.error(`Portal messages for unknown codes: ${extra.join(', ')}`);
  process.exit(1);
}

console.log(`Error catalog matches the API (${apiCodes.size} codes).`);
