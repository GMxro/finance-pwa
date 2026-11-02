#!/usr/bin/env node
// Falla el build si se usa var(--x) sin una definicion alcanzable.
// Fuente de verdad: src/client/app/styles/tokens.css + custom properties
// definidas en cualquier CSS del cliente + setProperty desde TS/TSX.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const CLIENT = join(ROOT, 'src', 'client');
const TOKENS = join(CLIENT, 'app', 'styles', 'tokens.css');

const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(css|tsx?|html)$/.test(entry)) files.push(full);
  }
}
walk(CLIENT);
files.push(join(ROOT, 'index.html'));

const defined = new Set();
const definedIn = new Map();
function define(name, file) {
  if (!defined.has(name)) {
    defined.add(name);
    definedIn.set(name, relative(ROOT, file));
  }
}

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.css')) {
    for (const match of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) define(match[1], file);
  }
  for (const match of text.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9-]+)['"]/g)) define(match[1], file);
  for (const match of text.matchAll(/['"](--[a-zA-Z0-9-]+)['"]\s*:/g)) define(match[1], file);
}

const used = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      used.push({ name: match[1], file: relative(ROOT, file), line: index + 1, text: line.trim() });
    }
  });
}

const missing = used.filter(({ name }) => !defined.has(name));
const unique = [...new Map(missing.map(item => [item.name, item])).values()];

if (unique.length > 0) {
  console.error('\n✗ Tokens CSS sin definicion:\n');
  for (const item of unique) {
    console.error(`  ${item.name}  → ${item.file}:${item.line}`);
    console.error(`     ${item.text}`);
  }
  console.error(`\n${unique.length} token(s) indefinido(s). Definilos en ${relative(ROOT, TOKENS)}.\n`);
  process.exit(1);
}

console.log(`✓ Tokens OK (${defined.size} definidos, ${used.length} usos verificados).`);
