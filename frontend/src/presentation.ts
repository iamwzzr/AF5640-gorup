import type { Anomaly, Holder, Ledger, Result } from './types.ts';

export const CODE_LABELS: Record<string, string> = {
  SHORT_PAYMENT: '少付', UNPAID: '未见到账', OVERPAYMENT: '超付',
  PENDING_PAYMENT: '付款待确认', UNMATCHED_WALLET: '收款人待识别',
  DUPLICATE_IMPORT: '重复导入', FAILED_PAYMENT: '付款失败',
};
export const SETTLEMENT_LABELS: Record<Holder['settlement_status'], string> = {
  settled: '已结清', not_due: '尚未到期', pending: '等待确认', overdue: '逾期未结清', review: '需要核实',
};
export const FILE_LABELS = { rules: '分配设置', holders: '持有人文件', payments: '付款文件' };
export const FIELD_LABELS: Record<string, string> = {
  project_id: '项目编号', project_name: '项目名称', batch_id: '分配批次', record_date: '持仓记录日',
  holder_id: '持有人编号', wallet: '登记钱包', token_units: '持有数量', chain_id: '网络编号',
  tx_hash: '交易哈希', event_index: '事件序号', to_wallet: '收款钱包', amount: '付款金额',
  status: '付款状态', submitted_at: '提交时间', confirmed_at: '确认时间', currency: '币种',
  payment_token: '付款代币合约', payout_per_token: '每枚分配额', payment_due_at: '付款截止时间', as_of: '核对时间',
};

/** Format strings without floating-point conversion, truncation, or monetary arithmetic. */
export function amount(value: string | null | undefined, exact = false): string {
  if (value == null || value === '') return '—';
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const [, sign, integer, decimals = ''] = match;
  const fraction = exact ? decimals.padEnd(6, '0') : decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`;
}
export function isNonZero(value: string): boolean { return /[1-9]/.test(value); }
export function shorten(value: string): string { return value.length > 22 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
export function displayTime(value: string | null | undefined): string {
  return value ? `${new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })} UTC+8` : '—';
}
export function ledgerStatus(row: Ledger): string {
  return row.status === 'confirmed' ? '已确认' : row.status === 'pending' ? '待确认' : '失败';
}
export function ledgerTreatment(row: Ledger): string {
  if (!row.included) return '未计入金额';
  if (row.status === 'pending') return row.holder_id ? '单列待确认' : '未知钱包待确认';
  return row.holder_id ? '计入持有人实付' : '未知钱包单列';
}

export type IssueGroup = 'all' | 'money' | 'identity' | 'status' | 'data';
export const ISSUE_GROUPS: { id: IssueGroup; label: string }[] = [
  { id: 'all', label: '全部事项' }, { id: 'money', label: '金额差异' },
  { id: 'identity', label: '收款人身份' }, { id: 'status', label: '付款状态' }, { id: 'data', label: '数据重复' },
];
export function issueGroup(code: string): IssueGroup {
  if (['SHORT_PAYMENT', 'UNPAID', 'OVERPAYMENT'].includes(code)) return 'money';
  if (code === 'UNMATCHED_WALLET') return 'identity';
  if (code === 'DUPLICATE_IMPORT') return 'data';
  return 'status';
}
export function issueCopy(item: Anomaly): { title: string; detail: string; action: string } {
  const value = amount(item.amount);
  switch (item.code) {
    case 'UNPAID': return { title: '未找到已确认到账的付款', detail: `当前不足 ${value}`, action: '先查是否漏导或仍在确认，再核实未付余额。' };
    case 'SHORT_PAYMENT': return { title: `已确认付款少了 ${value}`, detail: '按该持有人的分配规则比较', action: '核对付款金额和其他记录，确认剩余不足额。' };
    case 'OVERPAYMENT': return { title: `已确认付款多了 ${value}`, detail: '不同交易可能是拆分付款，需逐笔核实', action: '比对付款指令，确认是否重复实付或规则有误。' };
    case 'PENDING_PAYMENT': return { title: `有 ${value} 付款仍待确认`, detail: '尚未计入已确认实付', action: '先查交易最终状态，避免重复补付。' };
    case 'UNMATCHED_WALLET': return { title: '收款钱包不在持有人名单中', detail: `涉及 ${value}，未抵减任何人的应付`, action: '核对登记钱包、变更依据和收款人身份。' };
    case 'DUPLICATE_IMPORT': return { title: '同一付款记录被重复导入', detail: `涉及 ${value}，该事件仅计入一次`, action: '核对文件来源；重复导入不等于重复付款。' };
    case 'FAILED_PAYMENT': return { title: `有 ${value} 付款标记为失败`, detail: '未计入已确认实付或待确认金额', action: '先核实失败状态及其他付款，再决定后续处理。' };
    default: return { title: item.message, detail: '', action: item.suggested_action };
  }
}
export function resultConclusion(result: Result): { title: string; detail: string; tone: string } {
  const affected = result.summary.affected_holder_count;
  const unknown = result.anomalies.filter(item => item.code === 'UNMATCHED_WALLET').length;
  if (result.anomalies.length) {
    const subjects = [affected ? `${affected} 位登记持有人有待核实事项` : '', unknown ? `${unknown} 笔付款未匹配持有人` : ''].filter(Boolean);
    return { title: '本次分配还有待核实事项', detail: `${subjects.join('；另有') || `有 ${result.anomalies.length} 条付款或输入记录需核实`}。从下方事项开始，逐项查看原因和依据。`, tone: 'warning' };
  }
  const short = result.holders.filter(holder => holder.balance_status === 'short').length;
  if (short) return { title: '本次分配仍有款项未付足', detail: `${short} 位持有人尚未付足，目前未到付款截止时间。请在所有持有人中跟进付款进度。`, tone: 'warning' };
  return { title: '本次输入未发现核对提示', detail: `已完成 ${result.summary.holder_count} 位登记持有人的逐人核对。请结合原始记录确认结果。`, tone: 'success' };
}
export function matchesAnomaly(item: Anomaly, search: string, group: IssueGroup): boolean {
  const copy = issueCopy(item);
  const text = `${item.holder_id || '收款人待识别 未知钱包'} ${item.wallet || ''} ${item.code} ${CODE_LABELS[item.code] || ''} ${copy.title} ${copy.action} ${item.message}`.toLowerCase();
  return (group === 'all' || issueGroup(item.code) === group) && text.includes(search.trim().toLowerCase());
}
export function matchesHolder(holder: Holder, search: string, filter: string): boolean {
  const matches = `${holder.holder_id} ${holder.wallet}`.toLowerCase().includes(search.trim().toLowerCase());
  return matches && (filter === 'all' || (filter === 'anomaly' ? holder.issue_codes.length > 0
    : filter === 'pending' ? holder.issue_codes.includes('PENDING_PAYMENT')
      : filter === 'short' || filter === 'over' ? holder.balance_status === filter : holder.settlement_status === filter));
}
export function matchesLedger(row: Ledger, search: string, filter: string): boolean {
  const text = `${row.holder_id || '未知钱包 收款人待识别'} ${row.to_wallet} ${row.tx_hash} ${row.reason} ${ledgerStatus(row)} ${ledgerTreatment(row)}`.toLowerCase();
  return text.includes(search.trim().toLowerCase()) && (filter === 'all' || (filter === 'unknown' ? !row.holder_id : filter === 'excluded' ? !row.included : row.status === filter));
}
