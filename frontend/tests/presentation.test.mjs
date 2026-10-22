import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amount, issueCopy, issueGroup, matchesAnomaly, matchesHolder, matchesLedger, resultConclusion } from '../src/presentation.ts';

test('monetary display preserves a one-millionth gap, large integers and subunit rounding adjustments', () => {
  assert.equal(amount('0.000001'), '0.000001');
  assert.equal(amount('-0.000000005', true), '-0.000000005');
  assert.equal(amount('9007199254740993.123456'), '9,007,199,254,740,993.123456');
  assert.equal(amount('10.100000'), '10.10');
  assert.equal(amount('10.1', true), '10.100000');
});

test('pending and duplicated-import guidance never turns into an instruction to repay or reverse a payment', () => {
  const pending = issueCopy({ code: 'PENDING_PAYMENT', amount: '10.000000' });
  assert.match(pending.title, /待确认/);
  assert.match(pending.detail, /尚未计入/);
  assert.match(pending.action, /先查交易最终状态，避免重复补付/);
  const duplicate = issueCopy({ code: 'DUPLICATE_IMPORT', amount: '10.000000' });
  assert.match(duplicate.detail, /仅计入一次/);
  assert.match(duplicate.action, /重复导入不等于重复付款/);
  assert.match(issueCopy({ code: 'OVERPAYMENT', amount: '10.000000' }).detail, /可能是拆分付款/);
});

test('every known issue belongs to one category, keeping filtered counts disjoint', () => {
  const codes = ['UNPAID', 'SHORT_PAYMENT', 'OVERPAYMENT', 'PENDING_PAYMENT', 'FAILED_PAYMENT', 'UNMATCHED_WALLET', 'DUPLICATE_IMPORT'];
  assert.deepEqual(codes.map(issueGroup), ['money', 'money', 'money', 'status', 'status', 'identity', 'data']);
});

test('unknown-only results identify the unassigned payment without inventing an affected registered holder', () => {
  const result = { summary: { holder_count: 1, affected_holder_count: 0 }, holders: [], anomalies: [{ code: 'UNMATCHED_WALLET' }] };
  const conclusion = resultConclusion(result);
  assert.equal(conclusion.tone, 'warning');
  assert.match(conclusion.detail, /1 笔付款未匹配持有人/);
  assert.doesNotMatch(conclusion.detail, /0 位|已结清|已通过/);
});

test('a pre-deadline shortfall without anomalies is still presented as unpaid, never as all settled', () => {
  const result = { summary: { holder_count: 1, affected_holder_count: 0 }, holders: [{ balance_status: 'short' }], anomalies: [] };
  const conclusion = resultConclusion(result);
  assert.match(conclusion.title, /仍有款项未付足/);
  assert.match(conclusion.detail, /未到付款截止时间/);
  assert.equal(conclusion.tone, 'warning');
});

test('a failed payment to an unknown wallet still produces a readable review summary', () => {
  const result = { summary: { holder_count: 1, affected_holder_count: 0 }, holders: [], anomalies: [{ code: 'FAILED_PAYMENT' }] };
  assert.match(resultConclusion(result).detail, /^有 1 条付款或输入记录需核实/);
});

test('clean results describe only the completed input checks without claiming an audit or manual review', () => {
  const result = { summary: { holder_count: 1, affected_holder_count: 0 }, holders: [{ balance_status: 'matched' }], anomalies: [] };
  const conclusion = resultConclusion(result);
  assert.equal(conclusion.title, '本次输入未发现核对提示');
  assert.match(conclusion.detail, /结合原始记录确认/);
});

test('anomaly search accepts visible unknown-wallet labels and trims whitespace', () => {
  const anomaly = { code: 'UNMATCHED_WALLET', holder_id: null, wallet: '0xabc', amount: '10', message: '找不到收款人', suggested_action: '核对登记' };
  assert.equal(matchesAnomaly(anomaly, ' 收款人待识别 ', 'identity'), true);
  assert.equal(matchesAnomaly(anomaly, ' 未知钱包 ', 'all'), true);
  assert.equal(matchesAnomaly(anomaly, '0xABC', 'money'), false);
});

test('pending holder filter includes overdue transactions and search still narrows it', () => {
  const holder = { holder_id: 'H005', wallet: '0xabc', issue_codes: ['PENDING_PAYMENT'], settlement_status: 'overdue', balance_status: 'short' };
  assert.equal(matchesHolder(holder, ' H005 ', 'pending'), true);
  assert.equal(matchesHolder(holder, 'other', 'pending'), false);
  assert.equal(matchesHolder(holder, '', 'settled'), false);
});

test('ledger search and filters distinguish unknown, pending and excluded rows', () => {
  const unknown = { holder_id: null, to_wallet: '0xabc', tx_hash: '0xdef', reason: '钱包未匹配', included: true, status: 'confirmed' };
  assert.equal(matchesLedger(unknown, ' 收款人待识别 ', 'unknown'), true);
  assert.equal(matchesLedger(unknown, ' 未知钱包 ', 'all'), true);
  assert.equal(matchesLedger(unknown, '', 'excluded'), false);
  const failed = { ...unknown, holder_id: 'H006', status: 'failed', included: false };
  assert.equal(matchesLedger(failed, '失败', 'excluded'), true);
  assert.equal(matchesLedger(failed, '', 'pending'), false);
});
