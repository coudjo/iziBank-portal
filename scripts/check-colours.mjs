// Frontend plan F1-01: no hard-coded colours outside the token and theme files.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const allowed = new Set(['src/styles/tokens.css', 'src/styles/zorro-theme.less']);
const offenders = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path);
    } else if (/\.(scss|css|less|ts|html)$/.test(name) && !allowed.has(path) && !path.includes('/api/')) {
      const text = readFileSync(path, 'utf8');
      for (const [index, line] of text.split('\n').entries()) {
        if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !/href="#|url\(#|'#main'|"#main"/.test(line)) {
          offenders.push(`${path}:${index + 1}: ${line.trim()}`);
        }
      }
    }
  }
}

walk('src');
if (offenders.length) {
  console.error('Hard-coded colours (use a token):\n' + offenders.join('\n'));
  process.exit(1);
}
console.log('No hard-coded colours.');
