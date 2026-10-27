export interface RuntimeInput {
  action: 'validate' | 'reconcile' | 'export';
  rules: string;
  holders: Uint8Array;
  holders_name: string;
  payments: Uint8Array;
  payments_name: string;
}
export interface RuntimeRequest { id: number; input: RuntimeInput }
export type RuntimeResponse =
  | { id: number; ok: true; status: number; json?: unknown; zip?: string }
  | { id: number; ok: false };
