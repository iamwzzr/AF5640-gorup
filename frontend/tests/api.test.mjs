import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, exportReport, reconcile, validate } from '../src/api.ts';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const args = () => [
  { project_id: 'TEST', synthetic: true },
  new File(['holder_id\nA\n'], 'holders.csv', { type: 'text/csv' }),
  new File(['amount\n1\n'], 'payments.csv', { type: 'text/csv' }),
  new AbortController().signal,
];

test('validation sends rules, both original files, and the cancellation signal', async () => {
  const supplied = args();
  globalThis.fetch = async (path, options) => {
    assert.equal(path, '/api/validate');
    assert.equal(options.method, 'POST');
    assert.equal(options.signal, supplied[3]);
    assert.deepEqual(JSON.parse(options.body.get('rules')), supplied[0]);
    assert.equal(options.body.get('holders_file').name, 'holders.csv');
    assert.equal(options.body.get('payments_file').name, 'payments.csv');
    return Response.json({ valid: true, issues: [], warnings: [] });
  };
  assert.equal((await validate(...supplied)).valid, true);
});

test('input errors preserve the server explanation and row references', async () => {
  const issues = [{ code: 'INVALID_AMOUNT', file: 'payments', row: 3, field: 'amount', message: '金额无效' }];
  globalThis.fetch = async () => Response.json({ error: { message: '请更正输入', issues } }, { status: 422 });
  await assert.rejects(reconcile(...args()), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.message, '请更正输入');
    assert.deepEqual(error.issues, issues);
    return true;
  });
});

test('a successful HTML response cannot become a bogus ZIP download', async () => {
  globalThis.fetch = async () => new Response('<!doctype html><title>Wrong service</title>', { headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(exportReport(...args()), error => error instanceof ApiError && error.message.includes('内容格式不正确'));
});

test('validation explains a wrong service response instead of exposing a JSON parser error', async () => {
  globalThis.fetch = async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  await assert.rejects(validate(...args()), error => error instanceof ApiError && error.message.includes('内容格式不正确'));
});

test('malformed JSON has a readable error', async () => {
  globalThis.fetch = async () => new Response('{broken', { headers: { 'Content-Type': 'application/json' } });
  await assert.rejects(reconcile(...args()), error => error instanceof ApiError && error.message.includes('数据无法读取'));
});

test('network failure explains that the backend cannot be reached', async () => {
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(validate(...args()), error => error instanceof ApiError && error.message.includes('无法连接核对服务'));
});

test('cancellation stays an AbortError so superseded requests remain silent', async () => {
  const aborted = new DOMException('aborted', 'AbortError');
  globalThis.fetch = async () => { throw aborted; };
  await assert.rejects(validate(...args()), error => error === aborted);
});

test('oversized responses without a JSON error still explain the file limit', async () => {
  globalThis.fetch = async () => new Response('too large', { status: 413 });
  await assert.rejects(validate(...args()), error => error instanceof ApiError && error.message.includes('5 MiB'));
});

test('valid ZIP content is returned unchanged', async () => {
  const bytes = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
  globalThis.fetch = async () => new Response(bytes, { headers: { 'Content-Type': 'application/zip' } });
  const blob = await exportReport(...args());
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), bytes);
});
