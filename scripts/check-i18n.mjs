// Verifies: (1) en/hi locale files have identical key sets, (2) every static t('key') in source exists.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const [, , appDir, ...extraNs] = process.argv;
const load = (f) => JSON.parse(readFileSync(f, 'utf8'));
const flat = (o, p = '', out = new Set()) => {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out);
    else out.add(key.replace(/_(one|other)$/, ''));
  }
  return out;
};
const en = flat(load(path.join(appDir, 'src/locales/en.json')));
const hi = flat(load(path.join(appDir, 'src/locales/hi.json')));
let errors = 0;
for (const k of en) if (!hi.has(k)) { console.error(`hi missing: ${k}`); errors++; }
for (const k of hi) if (!en.has(k)) { console.error(`en missing: ${k}`); errors++; }
const walk = (d) => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });
const used = new Set();
for (const f of walk(path.join(appDir, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z][\w.]*)'/g)) used.add(m[1]);
}
const prefixes = new Set([...en].flatMap((k) => k.split('.').map((_, i, a) => a.slice(0, i + 1).join('.'))));
for (const k of used) if (!en.has(k) && !prefixes.has(k)) { console.error(`used but undefined: ${k}`); errors++; }
console.log(`i18n check: ${en.size} keys, ${used.size} static usages, ${errors} problems`);
process.exit(errors ? 1 : 0);
