// Production bundle checks (frontend plan 10.2, F12): run after `npm run build`.
// 1. JavaScript loaded by the sign-in page (index.html scripts and module preloads) is under the gzipped budget.
// 2. No mock API, mock sign-ins or mock service worker in the build.
// 3. The shipped config.json does not ask for mocks.
// 4. index.html has no inline script (the CSP would block it).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET_KB = 250;
const dist = 'dist/iziBank-portal/browser';
const problems = [];

if (!existsSync(join(dist, 'index.html'))) {
  console.error(`No build found in ${dist}. Run npm run build first.`);
  process.exit(1);
}

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map((match) => match[1]);
let total = 0;
for (const file of new Set(initial)) {
  total += gzipSync(readFileSync(join(dist, file))).length;
}
const totalKb = total / 1024;
console.log(
  `Initial JavaScript (sign-in page): ${totalKb.toFixed(1)} KB gzipped in ${new Set(initial).size} files (budget ${BUDGET_KB} KB).`,
);
if (totalKb > BUDGET_KB) {
  problems.push(`Initial JavaScript is ${totalKb.toFixed(1)} KB gzipped, over the ${BUDGET_KB} KB budget.`);
}

// The CSP allows scripts from 'self' only (docker/security-headers.inc): an inline script would be blocked.
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) {
  problems.push('index.html has an inline script, which the Content-Security-Policy blocks.');
}

const MARKERS = ['Admin-Pass1', 'Teller-Pass1', 'setupWorker', 'ib-mock-'];
for (const file of readdirSync(dist)) {
  if (file === 'mockServiceWorker.js') {
    problems.push('mockServiceWorker.js is in the production build.');
  }
  if (file.endsWith('.js')) {
    const text = readFileSync(join(dist, file), 'utf8');
    for (const marker of MARKERS) {
      if (text.includes(marker)) {
        problems.push(`${file} contains mock code ("${marker}").`);
      }
    }
  }
}

const config = JSON.parse(readFileSync(join(dist, 'config.json'), 'utf8'));
if (config.useMocks !== false) {
  problems.push('config.json in the build does not set "useMocks": false.');
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`✖ ${problem}`);
  }
  process.exit(1);
}
console.log('Bundle checks passed: within budget, no mock API, mocks off.');
