import type { Anomaly, Holder, Ledger, Result } from './types.ts';
import { localizeMessage, translate } from './locale.ts';
import type { Language } from './locale.ts';

export const CODE_LABELS: Record<string, string> = {
  SHORT_PAYMENT: '少发了', UNPAID: '还没查到付款', OVERPAYMENT: '多发了',
  PENDING_PAYMENT: '还在等确认', UNMATCHED_WALLET: '不知道付给谁',
  DUPLICATE_IMPORT: '记录重复了', FAILED_PAYMENT: '付款没成功',
};
export const SETTLEMENT_LABELS: Record<Holder['settlement_status'], string> = {
  settled: '已付清', not_due: '还没到截止时间', pending: '还在等确认', overdue: '已过期，仍未付清', review: '需要检查',
};
export const FILE_LABELS = { rules: '发放规则', holders: '收款名单', payments: '付款记录' };
export const FIELD_LABELS: Record<string, string> = {
  project_id: '项目编号', project_name: '项目名称', batch_id: '本次发放编号', record_date: '名单日期',
  holder_id: '收款人编号', wallet: '收款地址', token_units: '持有数量', chain_id: '付款网络编号',
  tx_hash: '交易编号', event_index: '交易内记录序号', to_wallet: '收款地址', amount: '付款金额',
  status: '付款状态', submitted_at: '提交时间', confirmed_at: '确认时间', currency: '币种',
  payment_token: '代币识别地址', payout_per_token: '每个代币发多少', payment_due_at: '最晚付款时间', as_of: '检查截至时间',
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
export function displayTime(value: string | null | undefined, language: Language = 'zh'): string {
  return value ? translate('{0}（北京时间）', language, { 0: new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-GB', { hour12: false, timeZone: 'Asia/Shanghai' }) }) : '—';
}
export function ledgerStatus(row: Ledger, language: Language = 'zh'): string {
  return translate(row.status === 'confirmed' ? '已确认' : row.status === 'pending' ? '还在等确认' : '没成功', language);
}
export function ledgerTreatment(row: Ledger, language: Language = 'zh'): string {
  if (!row.included) return translate('这行暂不计算', language);
  if (row.status === 'pending') return translate('暂不算已付', language);
  return translate(row.holder_id ? '已算入此人已付金额' : '单独列出，收款人不明', language);
}
function ledgerExplanationChinese(row: Ledger): string {
  if (!row.included) return row.reason.startsWith('重复导入')
    ? '这行和另一行是同一笔付款，不重复计算。'
    : row.status === 'failed' ? '表格中这笔付款标为失败，不算已付。' : row.reason;
  if (row.status === 'pending') return row.holder_id
    ? '这笔付款还在等确认，暂时不算已付。'
    : '这笔付款还在等确认，收款地址也不在名单里。';
  return row.holder_id ? '表格中这笔付款标为已确认，已算到对应收款人名下。'
    : '付款已标为确认，但收款地址不在名单里，不能替任何人算作已付。';
}
export function ledgerExplanation(row: Ledger, language: Language = 'zh'): string {
  return localizeMessage(ledgerExplanationChinese(row), language);
}

export type IssueGroup = 'all' | 'money' | 'identity' | 'status' | 'data';
export const ISSUE_GROUPS: { id: IssueGroup; label: string }[] = [
  { id: 'all', label: '所有问题' }, { id: 'money', label: '金额不对' },
  { id: 'identity', label: '收款人不明' }, { id: 'status', label: '等待或失败' }, { id: 'data', label: '重复记录' },
];
export function issueGroup(code: string): IssueGroup {
  if (['SHORT_PAYMENT', 'UNPAID', 'OVERPAYMENT'].includes(code)) return 'money';
  if (code === 'UNMATCHED_WALLET') return 'identity';
  if (code === 'DUPLICATE_IMPORT') return 'data';
  return 'status';
}
function issueCopyChinese(item: Anomaly): { title: string; detail: string; action: string } {
  const value = amount(item.amount);
  switch (item.code) {
    case 'UNPAID': return { title: '还没找到已确认的付款', detail: `按表格计算，还差 ${value}`, action: '先查有没有漏传记录，或付款还在确认，再决定要不要补发。' };
    case 'SHORT_PAYMENT': return { title: `少发了 ${value}`, detail: '付款表中的已付金额，比这人该收的少。', action: '对照应发金额和所有付款，确认到底少了多少。' };
    case 'OVERPAYMENT': return { title: `多发了 ${value}`, detail: '同一个人分几次收款也可能是正常的。', action: '逐笔检查，确认是多发了钱，还是发放规则填错了。' };
    case 'PENDING_PAYMENT': return { title: `有 ${value} 还在等确认`, detail: '暂时不算已付，但不能据此再发一次。', action: '先查这笔付款有没有成功，别急着再发一次。' };
    case 'UNMATCHED_WALLET': return { title: '收款地址不在名单里', detail: `涉及 ${value}，没有算到任何人名下。`, action: '对照收款名单，确认这个地址属于谁。' };
    case 'DUPLICATE_IMPORT': return { title: '同一笔付款在表格里出现多次', detail: `涉及 ${value}，重复的这一行没有再算。`, action: '查看是不是重复上传了记录，不代表钱发了两次。' };
    case 'FAILED_PAYMENT': return { title: `有 ${value} 付款被标为失败`, detail: '这笔没有算作已付。', action: '先查这笔付款及其他付款记录，再决定要不要重发。' };
    default: return { title: item.message, detail: '', action: item.suggested_action };
  }
}
export function issueCopy(item: Anomaly, language: Language = 'zh'): { title: string; detail: string; action: string } {
  const copy = issueCopyChinese(item);
  return { title: localizeMessage(copy.title, language), detail: localizeMessage(copy.detail, language), action: localizeMessage(copy.action, language) };
}
export function resultConclusion(result: Result, language: Language = 'zh'): { title: string; detail: string; tone: string } {
  const t = (message: string, values?: Record<string, unknown>) => translate(message, language, values);
  const affected = result.summary.affected_holder_count;
  const unknown = result.anomalies.filter(item => item.code === 'UNMATCHED_WALLET').length;
  if (result.anomalies.length) {
    const subjects = [affected ? t(affected === 1 ? '1 位收款人需要检查' : '{0} 位收款人需要检查', { 0: affected }) : '', unknown ? t(unknown === 1 ? '1 笔付款不知道付给了谁' : '{0} 笔付款不知道付给了谁', { 0: unknown }) : ''].filter(Boolean);
    return { title: t('有几笔钱需要再检查一下'), detail: t('{0}。下面列出了问题和下一步怎么做。', { 0: subjects.join(t('；另有 ')) || t('有 {0} 条付款或表格记录需要检查', { 0: result.anomalies.length }) }), tone: 'warning' };
  }
  const short = result.holders.filter(holder => holder.balance_status === 'short').length;
  if (short) return { title: t('还有人的钱没发齐'), detail: t('{0} 位收款人还没收齐，现在还没到最晚付款时间。可以在“收款名单”里查看。', { 0: short }), tone: 'warning' };
  return { title: t('按这两份表格，暂时没有发现问题'), detail: t('已逐人比较 {0} 位收款人的金额。结果来自上传的表格，仍请确认实际付款情况。', { 0: result.summary.holder_count }), tone: 'success' };
}
export function matchesAnomaly(item: Anomaly, search: string, group: IssueGroup): boolean {
  const copy = issueCopy(item);
  const english = issueCopy(item, 'en');
  const query = search.trim().toLowerCase();
  const englishWords = query.length > 1 ? `${english.title} ${english.action}` : '';
  const text = `${item.holder_id || '不知道付给谁 收款人不明 收款人待识别 未知钱包 unknown recipient unidentified wallet'} ${item.wallet || ''} ${item.code} ${CODE_LABELS[item.code] || ''} ${copy.title} ${copy.action} ${item.message} ${englishWords}`.toLowerCase();
  return (group === 'all' || issueGroup(item.code) === group) && text.includes(query);
}
export function matchesHolder(holder: Holder, search: string, filter: string): boolean {
  const matches = `${holder.holder_id} ${holder.wallet}`.toLowerCase().includes(search.trim().toLowerCase());
  return matches && (filter === 'all' || (filter === 'anomaly' ? holder.issue_codes.length > 0
    : filter === 'pending' ? holder.issue_codes.includes('PENDING_PAYMENT')
      : filter === 'short' || filter === 'over' ? holder.balance_status === filter : holder.settlement_status === filter));
}
export function matchesLedger(row: Ledger, search: string, filter: string): boolean {
  const query = search.trim().toLowerCase();
  const englishWords = query.length > 1 ? `${ledgerStatus(row, 'en')} ${ledgerTreatment(row, 'en')} ${ledgerExplanation(row, 'en')}` : '';
  const text = `${row.holder_id || '不知道付给谁 收款人不明 未知钱包 收款人待识别 unknown recipient unidentified wallet'} ${row.to_wallet} ${row.tx_hash} ${row.reason} ${ledgerStatus(row)} ${ledgerTreatment(row)} ${ledgerExplanation(row)} ${englishWords}`.toLowerCase();
  return text.includes(query) && (filter === 'all' || (filter === 'unknown' ? !row.holder_id : filter === 'excluded' ? !row.included : row.status === filter));
}
