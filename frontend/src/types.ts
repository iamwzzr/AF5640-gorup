export interface Rules {
  project_id: string; project_name: string; batch_id: string; record_date: string;
  payment_due_at: string; as_of: string; payout_per_token: string;
  chain_id: string; currency: string; payment_token: string; synthetic: boolean;
}
export interface Issue { code: string; file: 'rules' | 'holders' | 'payments'; row: number | null; field: string | null; message: string }
export interface Preview { filename: string; row_count: number; columns: string[]; rows: Record<string, unknown>[] }
export interface Validation { valid: boolean; issues: Issue[]; warnings: Issue[]; preview: { holders: Preview; payments: Preview }; rules: Rules }
export interface Holder {
  holder_id: string; wallet: string; token_units: string; source_row: number; expected: string;
  confirmed_paid: string; pending_amount: string; difference: string; shortfall: string; overpayment: string;
  balance_status: 'matched' | 'short' | 'over'; settlement_status: 'settled' | 'not_due' | 'pending' | 'overdue' | 'review';
  issue_codes: string[]; payment_refs: string[]; explanation: string;
}
export interface Anomaly {
  id: string; code: string; severity: 'warning' | 'review'; holder_id: string | null; wallet: string | null;
  amount: string | null; source_rows: number[]; payment_refs: string[]; message: string;
}
export interface Ledger {
  source_row: number; event_key: string; tx_hash: string; event_index: string | number;
  to_wallet: string; holder_id: string | null; amount: string; status: string; included: boolean;
  reason: string; submitted_at: string; confirmed_at: string | null;
}
export interface Result {
  metadata: Rules & { rounding: string; amount_decimals: number; algorithm_version: string; input_fingerprints: Record<string, string> };
  summary: { holder_count: number; payment_row_count: number; unique_payment_count: number; duplicate_row_count: number;
    expected_total: string; confirmed_total: string; matched_confirmed_total: string; unmatched_confirmed_total: string;
    pending_total: string; shortfall_total: string; overpayment_total: string; net_difference: string;
    rounding_adjustment: string; affected_holder_count: number; issue_count: number };
  holders: Holder[]; anomalies: Anomaly[]; payment_ledger: Ledger[]; warnings: Issue[];
}
export interface Scenario { id: string; name: string; description: string; rules: Rules; holders_url: string; payments_url: string }
