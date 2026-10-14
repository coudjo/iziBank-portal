// Copies the API contract from the sibling iziBank repository, then regenerate types with `npm run gen:api`.
import { copyFileSync, existsSync } from 'node:fs';

const source = process.env.IZIBANK_API_DIR ?? '../iziBank';
for (const file of ['openapi.json', 'problem-types.md']) {
  const from = `${source}/docs/api/${file}`;
  if (!existsSync(from)) {
    console.error(`Not found: ${from}. Set IZIBANK_API_DIR to the API repository.`);
    process.exit(1);
  }
  copyFileSync(from, new URL(`../api/${file}`, import.meta.url));
  console.log(`Copied ${from}`);
}
