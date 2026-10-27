/** Local and Pages builds share assets and routes; only the calculation host differs. */
export const browserRuntime = import.meta.env?.VITE_RUNTIME === 'browser';

export function assetUrl(path: string, base = import.meta.env?.BASE_URL || '/'): string {
  return `${base.replace(/\/?$/, '/')}${path.replace(/^\/+/, '')}`;
}
