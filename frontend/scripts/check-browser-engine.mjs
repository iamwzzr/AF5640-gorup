import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { loadPyodide } from 'pyodide';

const root = new URL('../../', import.meta.url);
const runtime = new URL('frontend/.pages-public/python/', root);
const python = await loadPyodide({ indexURL: fileURLToPath(runtime) });
await python.loadPackage('pydantic');
const virtualRoot = '/distributioncheck';

async function copyFile(path) {
  const target = `${virtualRoot}/${path}`;
  python.FS.mkdirTree(target.slice(0, target.lastIndexOf('/')));
  python.FS.writeFile(target, await readFile(new URL(path, root)));
}
async function copyTree(path) {
  for (const item of await readdir(new URL(path, root), { withFileTypes: true })) {
    if (item.name === '__pycache__') continue;
    if (item.isDirectory()) await copyTree(`${path}${item.name}/`);
    else await copyFile(`${path}${item.name}`);
  }
}
for (const path of ['backend/app/__init__.py', 'backend/app/schemas.py', 'backend/app/parser.py', 'backend/app/engine.py', 'backend/app/export.py', 'backend/tests/test_reconciliation.py', 'backend/tests/test_project_evidence.py', 'frontend/src/project/evidence.json']) await copyFile(path);
await copyTree('sample-data/');
await copyTree('frontend/public/examples/');
python.runPython(`import sys\nsys.path.insert(0, '${virtualRoot}/backend')\nsys.path.insert(0, '${virtualRoot}/backend/tests')`);
const passed = python.runPython(`
import unittest
suite = unittest.TestSuite([
    unittest.defaultTestLoader.loadTestsFromName('test_reconciliation'),
    unittest.defaultTestLoader.loadTestsFromName('test_project_evidence'),
])
outcome = unittest.TextTestRunner(verbosity=1).run(suite)
outcome.wasSuccessful()
`);
assert.equal(passed, true, 'Existing business and evidence tests must pass in the browser Python runtime');

python.runPython(await readFile(new URL('frontend/src/browser-runtime/bridge.py', root), 'utf8'));
const handler = python.globals.get('browser_request');
for (const name of ['core', 'edge', 'comprehensive']) {
  const base = new URL(`sample-data/${name}/`, root);
  const data = {
    action: 'validate', rules: await readFile(new URL('rules.json', base), 'utf8'),
    holders: new Uint8Array(await readFile(new URL('holders.csv', base))), holders_name: 'holders.csv',
    payments: new Uint8Array(await readFile(new URL('payments.csv', base))), payments_name: 'payments.csv',
  };
  const request = action => {
    const value = python.toPy({ ...data, action });
    try { return JSON.parse(handler(value)); } finally { value.destroy(); }
  };
  assert.equal(request('validate').json.valid, true, name);
  const result = request('reconcile');
  assert.equal(result.status, 200, name);
  const archive = Buffer.from(request('export').zip, 'base64');
  assert.equal(archive.readUInt32LE(0), 0x04034b50, name);
  if (name !== 'edge') {
    const evidence = JSON.parse(await readFile(new URL('frontend/src/project/evidence.json', root), 'utf8'));
    assert.deepEqual(result.json, evidence.cases[name], `${name} must match the server-generated result, including exact amounts and fingerprints`);
  }
  console.log(`${name}: validate, reconcile, ZIP and published evidence match`);
}
handler.destroy();
console.log('Browser Python business regressions and adapter checks passed.');
