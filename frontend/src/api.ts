import type { Rules, Issue, Validation, Result } from './types';

export class ApiError extends Error {
  issues: Issue[];
  constructor(message: string, issues: Issue[] = []) { super(message); this.issues = issues; }
}
function payload(rules: Rules, holders: File, payments: File): FormData {
  const form = new FormData();
  form.append('rules', JSON.stringify(rules)); form.append('holders_file', holders); form.append('payments_file', payments);
  return form;
}
async function request(path: string, rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try { response = await fetch(path, { method: 'POST', body: payload(rules, holders, payments), signal }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('无法连接核对服务。请确认后端已启动，然后重试。');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const error = body?.error;
    throw new ApiError(error?.message || (response.status === 413 ? '文件过大，每份CSV请控制在5 MiB以内。' : `请求未完成（${response.status}），请稍后重试。`), error?.issues || []);
  }
  return response;
}
export async function validate(rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Validation> {
  return (await request('/api/validate', rules, holders, payments, signal)).json();
}
export async function reconcile(rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Result> {
  return (await request('/api/reconcile?format=json', rules, holders, payments, signal)).json();
}
export async function exportReport(rules: Rules, holders: File, payments: File, signal: AbortSignal): Promise<Blob> {
  return (await request('/api/reconcile?format=zip', rules, holders, payments, signal)).blob();
}
