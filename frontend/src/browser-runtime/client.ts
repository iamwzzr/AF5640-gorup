import type { Rules } from '../types';
import type { RuntimeRequest, RuntimeResponse } from './protocol';

let worker: Worker | undefined;
let sequence = 0;
let cancelActive: (() => void) | undefined;

function reset() { worker?.terminate(); worker = undefined; }

export async function runInBrowser(path: string, rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Response> {
  signal.throwIfAborted();
  const [holderBytes, paymentBytes] = await Promise.all([holders.arrayBuffer(), payments.arrayBuffer()]);
  signal.throwIfAborted();
  cancelActive?.();
  const instance = worker ??= new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
  const id = ++sequence;
  return new Promise<Response>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      instance.removeEventListener('message', receive);
      instance.removeEventListener('error', fail);
      cancelActive = undefined;
    };
    const fail = () => { cleanup(); reset(); reject(new Error('Browser calculation failed')); };
    const abort = () => { cleanup(); reset(); reject(new DOMException('Aborted', 'AbortError')); };
    const receive = (event: MessageEvent<RuntimeResponse>) => {
      const result = event.data;
      if (result.id !== id) return;
      if (!result.ok) { fail(); return; }
      cleanup();
      if (typeof result.zip === 'string') {
        const bytes = Uint8Array.from(atob(result.zip), char => char.charCodeAt(0));
        resolve(new Response(bytes.buffer, { status: result.status, headers: { 'Content-Type': 'application/zip' } }));
      } else resolve(Response.json(result.json, { status: result.status }));
    };
    const timer = setTimeout(fail, 120_000);
    cancelActive = abort;
    signal.addEventListener('abort', abort, { once: true });
    instance.addEventListener('message', receive);
    instance.addEventListener('error', fail);
    if (signal.aborted) { abort(); return; }
    instance.postMessage({ id, input: {
      action: path.startsWith('/api/validate') ? 'validate' : path.includes('format=zip') ? 'export' : 'reconcile',
      rules: JSON.stringify(rules), holders: new Uint8Array(holderBytes), holders_name: holders.name,
      payments: new Uint8Array(paymentBytes), payments_name: payments.name,
    } } satisfies RuntimeRequest, [holderBytes, paymentBytes]);
  });
}
