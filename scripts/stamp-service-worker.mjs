import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clientDirectory = path.join(projectRoot, 'dist/client');
const serviceWorkerPath = path.join(clientDirectory, 'sw.js');
const sourcePath = path.join(projectRoot, 'public/sw.js');

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));
  return nested.flat().sort();
}

const [serviceWorker, sourceTemplate, buildFiles] = await Promise.all([
  readFile(serviceWorkerPath, 'utf8'),
  readFile(sourcePath, 'utf8'),
  listFiles(clientDirectory)
]);

const marker = '__BUILD_ID__';
if (serviceWorker.split(marker).length !== 2) {
  throw new Error(`Expected exactly one ${marker} placeholder in the built service worker`);
}

const hash = createHash('sha256').update(sourceTemplate);
for (const filePath of buildFiles) {
  if (filePath === serviceWorkerPath) continue;
  hash.update(path.relative(clientDirectory, filePath));
  hash.update(await readFile(filePath));
}

await writeFile(serviceWorkerPath, serviceWorker.replace(marker, hash.digest('hex').slice(0, 16)));
