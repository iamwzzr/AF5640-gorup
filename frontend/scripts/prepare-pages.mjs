import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const runtime = new URL('node_modules/pyodide/', root);
const destination = new URL('.pages-public/', root);
const { version } = JSON.parse(await readFile(new URL('package.json', runtime), 'utf8'));
const lock = JSON.parse(await readFile(new URL('pyodide-lock.json', runtime), 'utf8'));
const cache = new URL('.cache/pages-wheels/', root);
await mkdir(cache, { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(new URL('public/', root), destination, { recursive: true });
const target = new URL('python/', destination);
await mkdir(target, { recursive: true });
for (const file of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']) await cp(new URL(file, runtime), new URL(file, target));

const packages = new Set();
function include(name) {
  const key = name.toLowerCase().replaceAll('_', '-');
  if (packages.has(key)) return;
  const item = lock.packages[key];
  if (!item) throw new Error(`Python dependency missing from pinned runtime: ${name}`);
  packages.add(key);
  item.depends.forEach(include);
}
include('pydantic');
for (const name of packages) {
  const item = lock.packages[name];
  const cached = new URL(item.file_name, cache);
  let bytes;
  try { bytes = await readFile(cached); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const digest = buffer => createHash('sha256').update(buffer).digest('hex');
  if (!bytes || digest(bytes) !== item.sha256) {
    const response = await fetch(`https://cdn.jsdelivr.net/pyodide/v${version}/full/${item.file_name}`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Could not download ${name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== item.sha256) throw new Error(`Checksum mismatch: ${name}`);
    await writeFile(cached, bytes);
  }
  await writeFile(new URL(item.file_name, target), bytes);
}
await writeFile(new URL('.nojekyll', destination), '');
console.log(`Prepared self-hosted Python ${lock.info.python}, Pyodide ${version}, ${packages.size} verified packages in ${fileURLToPath(destination)}`);
