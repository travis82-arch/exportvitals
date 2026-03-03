import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push(full);
  }
}

walk(SRC);

const jsxFiles = files.filter((f) => f.endsWith('.jsx'));
const badImports = [];
const importRegex = /from\s+['"](?:\.\.\/|\.\/)[^'"]*\.jsx['"]/g;

for (const file of files.filter((f) => /\.(js|mjs|ts|tsx|jsx)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  const matches = text.match(importRegex);
  if (matches?.length) badImports.push({ file, matches });
}

if (jsxFiles.length || badImports.length) {
  console.error('check-no-jsx-imports failed.');
  if (jsxFiles.length) {
    console.error('Found .jsx files under src/:');
    for (const file of jsxFiles) console.error(` - ${file.replace(process.cwd() + '/', '')}`);
  }
  if (badImports.length) {
    console.error('Found .jsx import specifiers:');
    for (const { file, matches } of badImports) {
      console.error(` - ${file.replace(process.cwd() + '/', '')}`);
      for (const m of matches) console.error(`   ${m}`);
    }
  }
  process.exit(1);
}

console.log('check-no-jsx-imports passed.');
