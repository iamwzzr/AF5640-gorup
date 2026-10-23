import { useEffect, useRef } from 'react';
import { Info, X } from 'lucide-react';
import { amount, CODE_LABELS, displayTime, issueCopy, ledgerExplanation, ledgerStatus, ledgerTreatment, SETTLEMENT_LABELS } from '../presentation';
import type { Anomaly, Holder, Ledger, Result } from '../types';
import { Badge } from './Common';

export interface Selection { holder?: Holder; anomaly?: Anomaly; ledger?: Ledger }
export function EvidenceDialog({ selection, result, holdersName, paymentsName, onClose }: {
  selection: Selection; result: Result; holdersName: string; paymentsName: string; onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { holder, anomaly } = selection;
  const rows = selection.ledger ? [selection.ledger] : result.payment_ledger.filter(row => anomaly
    ? anomaly.payment_refs.includes(row.event_key) || anomaly.source_rows.includes(row.source_row)
    : row.holder_id === holder?.holder_id);
  const holderIssues = holder ? result.anomalies.filter(item => item.holder_id === holder.holder_id) : [];
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  const title = anomaly ? CODE_LABELS[anomaly.code] || '需要检查的问题' : selection.ledger ? '这笔付款的详情' : '这个人收齐了吗';
  return <dialog ref={ref} className="evidence-dialog" onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="evidence-title">
    <div className="drawer-head"><div><p className="muted">{holder ? `收款人 ${holder.holder_id}` : '还不知道收款人是谁'}</p><h2 id="evidence-title">{title}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label="关闭详情"><X size={22}/></button>
    </div>
    <div className="drawer-body">
      <section className="evidence-section"><h3>哪里需要注意</h3>
        {anomaly && <div className="finding"><strong>{issueCopy(anomaly).title}</strong><p>{issueCopy(anomaly).detail}</p></div>}
        {selection.ledger && <div className="finding"><strong>{amount(selection.ledger.amount, true)} {result.metadata.currency}</strong><p>{ledgerExplanation(selection.ledger)}</p></div>}
        {holder && <>
          <div className="evidence-status"><Badge tone={holder.settlement_status === 'settled' ? 'success' : 'warning'}>{SETTLEMENT_LABELS[holder.settlement_status]}</Badge>
            <Badge tone={holder.balance_status === 'matched' ? 'success' : 'danger'}>{holder.balance_status === 'matched' ? '金额对得上' : holder.balance_status === 'short' ? '钱还没发齐' : '钱发多了'}</Badge>
          </div>
          <dl className="detail-metrics">
            <div><dt>这个人该收多少</dt><dd>{amount(holder.expected, true)}</dd></div>
            <div><dt>表格中已发多少</dt><dd>{amount(holder.confirmed_paid, true)}</dd></div>
            <div><dt>还有多少在等确认</dt><dd>{amount(holder.pending_amount, true)}</dd></div>
            <div><dt>多了或少了多少</dt><dd>{amount(holder.difference, true)}</dd></div>
          </dl><p className="table-note">单位：{result.metadata.currency}。正数表示多发，负数表示少发。等待确认的钱暂不算已付。</p>
        </>}
        {!anomaly && !selection.ledger && holder && <p>{holder.issue_codes.length ? `这个人有 ${holderIssues.length} 个问题需要检查，下面有具体说明。` : '暂时没发现这个人的金额有问题，请再看看实际付款情况。'}</p>}
      </section>
      <section className="evidence-section"><h3>接下来怎么做</h3>
        {anomaly ? <p>{issueCopy(anomaly).action}</p> : holderIssues.length ? <ul className="action-list">{holderIssues.map(item => <li key={item.id}><strong>{CODE_LABELS[item.code]}</strong><p>{issueCopy(item).action}</p></li>)}</ul>
          : <p>{holder ? '对照收款名单和付款记录。同一个人分几次收到钱，也可以是正常付款。' : '确认收款地址属于谁，检查付款有没有成功。不能因为金额相同，就把这笔钱算给某个人。'}</p>}
        {holder && <div className="calculation-card"><strong>这个人该收的钱怎么算？</strong>
          <p className="calculation-formula">{holder.token_units} 个代币 × 每个 {result.metadata.payout_per_token} = <b>{amount(holder.expected, true)} {result.metadata.currency}</b></p>
          <p className="muted">按 {result.metadata.record_date} 的持有数量计算，结果保留 6 位小数，四舍五入。</p>
        </div>}
      </section>
      <section className="evidence-section"><h3>去哪里查</h3><p className="muted">展开后能看到对应表格的哪一行，以及完整收款地址和交易编号。</p>
        {holder && <details className="disclosure source-record"><summary>收款名单中的这一行<span>第 {holder.source_row} 行</span></summary>
          <dl className="record-dl"><div><dt>来源文件</dt><dd>{holdersName} · 第 {holder.source_row} 行</dd></div><div><dt>收款地址</dt><dd><code>{holder.wallet}</code></dd></div><div><dt>持有数量</dt><dd>{holder.token_units}</dd></div></dl>
        </details>}
        {!rows.length && <div className="empty-record">还没找到对应付款。请看看是否漏传了记录、尚未付款，或收款地址填错了。</div>}
        {rows.map(row => <details className="disclosure source-record" key={`${row.event_key}-${row.source_row}`}>
          <summary><span>付款文件第 {row.source_row} 行<strong>{amount(row.amount, true)} {result.metadata.currency}</strong></span>
            <Badge tone={!row.included ? 'neutral' : row.status === 'confirmed' && row.holder_id ? 'success' : 'warning'}>{ledgerStatus(row)} · {ledgerTreatment(row)}</Badge>
          </summary>
          <p className="record-reason">{row.reason}</p>
          <dl className="record-dl">
            <div><dt>来源文件</dt><dd>{paymentsName} · 第 {row.source_row} 行</dd></div>
            <div><dt>交易编号</dt><dd><code>{row.tx_hash}</code></dd></div>
            <div><dt>交易内记录序号</dt><dd>{row.event_index}</dd></div>
            <div><dt>收款地址</dt><dd><code>{row.to_wallet}</code></dd></div>
            <div><dt>提交时间</dt><dd>{displayTime(row.submitted_at)}</dd></div>
            <div><dt>确认时间</dt><dd>{displayTime(row.confirmed_at)}</dd></div>
          </dl>
        </details>)}
        {anomaly && <details className="disclosure source-record"><summary>查看完整检查记录</summary><div className="record-reason"><p>{anomaly.message}</p><p>{anomaly.suggested_action}</p></div></details>}
        <details className="disclosure source-record"><summary>这次使用的日期和规则</summary>
          <dl className="record-dl"><div><dt>名单日期</dt><dd>{result.metadata.record_date}</dd></div><div><dt>最晚付款时间</dt><dd>{displayTime(result.metadata.payment_due_at)}</dd></div><div><dt>检查截至时间</dt><dd>{displayTime(result.metadata.as_of)}</dd></div></dl>
        </details>
      </section>
      <div className="info-strip"><Info size={18}/><p>这里只核对你上传的表格。处理付款前，请再确认实际情况。</p></div>
    </div>
    <div className="drawer-footer"><button className="button button-secondary" onClick={onClose}>返回核对结果</button></div>
  </dialog>;
}
