import type { Rules, Issue, Validation, Result } from './types';
import { browserRuntime } from './site.ts';

export class ApiError extends Error {
  issues: Issue[];
  constructor(message: string, issues: Issue[] = []) { super(message); this.issues = issues; }
}
function payload(rules: Rules, holders: File, payments: File): FormData {
  const form = new FormData();
  form.append('rules', JSON.stringify(rules)); form.append('holders_file', holders); form.append('payments_file', payments);
  return form;
}
async function request(path: string, rules: Rules, holders: File, payments: File, signal: AbortSignal, expectedType = 'application/json'): Promise<Response> {
  let response: Response;
  try {
    if (browserRuntime) {
      const { runInBrowser } = await import('./browser-runtime/client.ts');
      response = await runInBrowser(path, rules, holders, payments, signal);
    } else response = await fetch(path, { method: 'POST', body: payload(rules, holders, payments), signal });
  }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    if (browserRuntime) throw new ApiError('核对功能未能加载，请检查网络后重试。');
    throw new ApiError('无法连接核对服务。请重新启动项目，再试一次。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = body?.error;
    throw new ApiError(error?.message || (response.status === 413 ? '文件过大，每份CSV请控制在5 MiB以内。' : `请求未完成（${response.status}），请稍后重试。`), error?.issues || []);
  }
  const actualType = response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (actualType !== expectedType) throw new ApiError('核对服务返回的内容格式不正确。请重新启动项目，再试一次。');
  return response;
}
async function readJson<T>(response: Response): Promise<T> {
  try { return await response.json(); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('核对服务返回的数据无法读取，请重试或重新启动项目。');
  }
}
export async function validate(rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Validation> {
  return readJson<Validation>(await request('/api/validate', rules, holders, payments, signal));
}
export async function reconcile(rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Result> {
  return readJson<Result>(await request('/api/reconcile?format=json', rules, holders, payments, signal));
}
export async function exportReport(rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Blob> {
  return (await request('/api/reconcile?format=zip', rules, holders, payments, signal, 'application/zip')).blob();
}
