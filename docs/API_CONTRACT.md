# AF5640-gorup interface contract

Project name is intentionally **AF5640-gorup**. Local React/TypeScript/Vite frontend and Python/FastAPI backend. No database, accounts, live chain access, transfers, or AI in this prototype. UI Chinese; evidence export UTF-8 CSV with BOM plus JSON in ZIP. All examples are synthetic. Run `./scripts/check.sh` for business regressions, real HTTP checks and the frontend build.

## Requests

`POST /api/validate`, `POST /api/reconcile?format=json`, `POST /api/reconcile?format=zip` use multipart fields `rules` (JSON string), `holders_file` (CSV), `payments_file` (CSV). Every request supplies all inputs; there is no result store or lookup by run ID. ZIP recomputes the same input through the same engine. `GET /api/health` returns project and version.

Rules JSON (timestamps must include an offset in whole minutes, for example `+08:00` or `Z`; dates must remain representable when converted to UTC):

```json
{"project_id":"DEMO-BOND-01","project_name":"示例债券收益分配","batch_id":"2026-Q3","record_date":"2026-09-30","payment_due_at":"2026-10-10T18:00:00+08:00","as_of":"2026-10-15T12:00:00+08:00","payout_per_token":"0.200000","chain_id":"1","currency":"USDC","payment_token":"0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48","synthetic":true}
```

One project/batch/network/payment token; one registered EVM wallet per holder. Payable and paid amounts have six places, rounding HALF_UP per holder, numeric strings throughout. The explanatory `rounding_adjustment` retains the full decimal difference between rounded and unrounded totals, including fractions smaller than one payment unit. As-of is a fixed snapshot of supplied payment statuses, not a live chain claim. Max 5 MiB/file and 10,000 data rows/file.

Holders CSV headers:

`project_id,record_date,holder_id,wallet,token_units`

Payments CSV headers:

`project_id,batch_id,chain_id,currency,payment_token,tx_hash,event_index,to_wallet,amount,status,submitted_at,confirmed_at`

`status` is `confirmed`, `pending`, or `failed`. `confirmed_at` required only for confirmed. Timestamps must be timezone aware; future-to-as_of or dates before record_date are blocking rather than silently removed. CSV row references include header, so first data row = 2. EVM addresses and transaction hashes normalized lower-case after syntactic checking. Same holder ID/wallet repeated is blocking (ambiguous snapshot). Unknown payment wallets are review items, not discarded.

## Validation response

```json
{"valid":true,"issues":[],"warnings":[],"preview":{"holders":{"filename":"holders.csv","row_count":5,"columns":[],"rows":[]},"payments":{"filename":"payments.csv","row_count":7,"columns":[],"rows":[]}},"rules":{}}
```

Issue/warning shape: `{code, file: "rules"|"holders"|"payments", row: number|null, field: string|null, message}`. `/api/validate` returns 200 with valid false for user input errors, including parseable validation issues. `/api/reconcile` returns 422 `{error:{code:"INPUT_INVALID",message,issues}}` if blocking issues exist. Reject oversized requests 413. Unexpected errors use readable generic errors (no internals or financial data).

## Reconciliation result

```json
{"metadata":{"project_id":"...","project_name":"...","batch_id":"...","currency":"USDC","chain_id":"1","record_date":"2026-09-30","as_of":"...","payment_due_at":"...","payout_per_token":"0.200000","rounding":"ROUND_HALF_UP","amount_decimals":6,"algorithm_version":"1.1.0","synthetic":true,"input_fingerprints":{"holders":"sha256...","payments":"sha256...","rules":"sha256..."}},"summary":{"holder_count":5,"payment_row_count":6,"unique_payment_count":6,"duplicate_row_count":0,"expected_total":"800.000000","confirmed_total":"870.000000","matched_confirmed_total":"870.000000","unmatched_confirmed_total":"0.000000","pending_total":"0.000000","shortfall_total":"170.000000","overpayment_total":"240.000000","net_difference":"70.000000","rounding_adjustment":"0.000000","affected_holder_count":3,"issue_count":3},"holders":[],"anomalies":[],"payment_ledger":[],"warnings":[]}
```

Holder shape: `{holder_id,wallet,token_units,source_row,expected,confirmed_paid,pending_amount,difference,shortfall,overpayment,balance_status,settlement_status,issue_codes,payment_refs,explanation}`.

`balance_status`: `matched|short|over`. `settlement_status`: `settled|not_due|pending|overdue|review`. Pending+past deadline = overdue, while still showing pending amount; no automatic repay instruction. Rows fully paid but extra pending get review. Overpaid gets review. Zero expected/no payments is settled. No UI monetary calculations: use backend strings.

Anomaly shape: `{id,code,severity: "warning"|"review",holder_id: string|null,wallet: string|null,amount: string|null,source_rows:number[],payment_refs:string[],message,suggested_action}`. Codes include `SHORT_PAYMENT`, `UNPAID`, `OVERPAYMENT`, `PENDING_PAYMENT`, `UNMATCHED_WALLET`, `DUPLICATE_IMPORT`, `FAILED_PAYMENT`. `suggested_action` gives deterministic manual review steps, is shown in anomaly evidence, and is included in `anomalies.csv`. Explanation is deterministic Chinese, never an audit certification or authorization to transfer money.

Ledger shape: `{source_row,event_key,tx_hash,event_index,to_wallet,holder_id,amount,status,included,reason,submitted_at,confirmed_at}`. Included means included in confirmed/pending matched or unmatched buckets; failed and duplicate imports false. Identical `(chain_id,tx_hash,event_index)` business content duplicate = count once + duplicate warning; different content on same key blocks input. Distinct events are not deduplicated by wallet/amount. Matched confirmed + unmatched confirmed = all confirmed. Shortfalls and overpayments are per-holder sums, never netted together; net_difference = confirmed_total - expected_total, with unmatched separately visible.

ZIP contains `holders.csv`, `anomalies.csv`, `payment_ledger.csv`, `summary.json`, and `rules.json`, using backend-owned headers and safe CSV cells. ZIP includes fingerprints and fixed as-of. No server persistence. Frontend retains current files/rules/result in memory only; any edit invalidates validation/result and disables export. Late requests must not overwrite newer inputs. Static examples located under `/examples/` in frontend public, mirrored under sample-data at repository root. `manifest.json` lists three named synthetic scenarios with rules and file URLs. `templates/` can be static CSV headers.

## Frontend presentation

Three steps: distribution settings, file import/validation, results. Results initially display anomalies with the affected subject, a plain-language finding, the next manual check, and an evidence link. Holders and payment ledger are secondary views. Anomaly categories are disjoint: money (`UNPAID`, `SHORT_PAYMENT`, `OVERPAYMENT`), identity (`UNMATCHED_WALLET`), status (`PENDING_PAYMENT`, `FAILED_PAYMENT`), and duplicate input (`DUPLICATE_IMPORT`). These group counts count prompts, not distinct holders or amounts.

The three primary amounts map directly to `expected_total`, `confirmed_total`, and `shortfall_total`. Other backend totals are disclosed separately. No frontend summing, netting, rounding or truncation of monetary values. Unknown payments never become assigned merely because their amounts match an unpaid holder. Pending payments are never presented as an instruction to repay. Duplicate input is never called a confirmed duplicate transfer. No-issue results before the deadline still show unpaid balances when present.

Evidence uses a native modal dialog with three sections: finding, manual verification, and original records. Full hashes, wallets and timestamps are expandable. The report summary describes the same fixed inputs and downloads the existing five-file ZIP; it introduces no new API or server persistence. On mobile, result tables become labelled record cards. A returned report view retains table search, filters and pagination.

## Demo scenarios

`core`: five holders A/B/C/D/E with units 1000/500/800/1200/500. Payout .2. Confirmed payments A200 B90 C0 D240+D240 E60+E40 => expected800, confirmed870, shortfall170, overpayment240, net70. All timestamps Oct10 before due/as_of.

`edge`: six holders A100 B200 C300 D150 E150 F100, payout .1. A confirmed10 duplicated identically; B confirmed12+8; C confirmed30+30 distinct; D pending15; E confirmed14.999999; F no payment. Expected100, confirmed104.999999, pending15, shortfall25.000001, overpayment30, duplicate1. There are 8 uploaded rows, 7 unique events. Treat synthetic statuses as supplied, never live-chain verified. Counts are derived from actual fixture rows.

`comprehensive`: 100 holders H001–H100, each 100 units, payout .1. H001 unpaid, H002 paid8, H003 paid10+10, H004's payment goes to an unknown wallet, H005 pending10, H006 failed10, H007 split6+4, H008 one event imported twice, H009 paid9.999999, others paid10. Expected1000, confirmed977.999999 (matched967.999999 + unknown10), pending10, shortfall42.000001, overpayment10. 102 rows, 101 unique events, all seven anomaly codes represented.
