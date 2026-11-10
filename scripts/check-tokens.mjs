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

// Warn (non-fatal) about hardcoded length literals in client CSS outside tokens.css.
// Allowlist: 0, 1px, 100%, env(), calc(), and values inside calc().
const hardcoded = [];
for (const file of files) {
  if (!file.endsWith('.css') || file === TOKENS) continue;
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    // Match numeric px/rem/em values not wrapped in var() or calc()/env()
    const matches = line.matchAll(/:\s*(\d+(?:\.\d+)?)(px|rem|em)\b/g);
    for (const m of matches) {
      const val = m[1] + m[2];
      if (val === '0px' || val === '1px') continue;
      // skip if line contains var( or calc( or env(
      if (/var\(|calc\(|env\(/.test(line)) continue;
      hardcoded.push({ file: relative(ROOT, file), line: index + 1, value: val, text: line.trim() });
    }
  });
}
if (hardcoded.length > 0) {
  console.warn(`\\n⚠ ${hardcoded.length} valor(es) hardcoded fuera de tokens (informativo):`);
  const sample = hardcoded.slice(0, 20);
  for (const h of sample) console.warn(`  ${h.file}:${h.line}  ${h.value}  ${h.text}`);
  if (hardcoded.length > 20) console.warn(`  ... y ${hardcoded.length - 20} más.`);
  console.warn('  Considerá migrarlos a tokens cuando se toque el archivo.\\n');
}

console.log(`✓ Tokens OK (${defined.size} definidos, ${used.length} usos verificados).`);
