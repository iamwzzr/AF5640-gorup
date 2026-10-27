import initSource from '../../../backend/app/__init__.py?raw';
import schemaSource from '../../../backend/app/schemas.py?raw';
import parserSource from '../../../backend/app/parser.py?raw';
import engineSource from '../../../backend/app/engine.py?raw';
import exportSource from '../../../backend/app/export.py?raw';
import bridgeSource from './bridge.py?raw';
import { assetUrl } from '../site';
import type { RuntimeRequest, RuntimeResponse } from './protocol';

async function initialize() {
  const indexURL = new URL(assetUrl('python/'), self.location.href).href;
  const { loadPyodide }: typeof import('pyodide') = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
  const python = await loadPyodide({ indexURL });
  await python.loadPackage('pydantic');
  python.FS.mkdirTree('/distributioncheck/app');
  const sources = { '__init__.py': initSource, 'schemas.py': schemaSource, 'parser.py': parserSource, 'engine.py': engineSource, 'export.py': exportSource };
  for (const [name, source] of Object.entries(sources)) python.FS.writeFile(`/distributioncheck/app/${name}`, source);
  python.runPython('import sys\nsys.path.insert(0, "/distributioncheck")');
  python.runPython(bridgeSource);
  return python;
}

let runtime: ReturnType<typeof initialize> | undefined;
let queue = Promise.resolve();
self.addEventListener('message', (event: MessageEvent<RuntimeRequest>) => {
  queue = queue.then(async () => {
    const { id, input } = event.data;
    try {
      const python = await (runtime ??= initialize());
      const payload = python.toPy(input);
      const handler = python.globals.get('browser_request');
      try {
        const result: { status: number; json?: unknown; zip?: string } = JSON.parse(handler(payload));
        self.postMessage({ id, ok: true, ...result } satisfies RuntimeResponse);
      } finally { payload.destroy(); handler.destroy(); }
    } catch {
      // Do not expose Python stacks or uploaded file contents through browser logs.
      runtime = undefined;
      self.postMessage({ id, ok: false } satisfies RuntimeResponse);
    }
  });
});
