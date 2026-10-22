import { useEffect, useRef } from 'react';
import { Info, X } from 'lucide-react';
import { amount, CODE_LABELS, displayTime, issueCopy, ledgerStatus, ledgerTreatment, SETTLEMENT_LABELS } from '../presentation';
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
  const title = anomaly ? CODE_LABELS[anomaly.code] || '核对提示' : selection.ledger ? '付款记录' : '持有人核对详情';
  return <dialog ref={ref} className="evidence-dialog" onCancel={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="evidence-title">
    <div className="drawer-head"><div><p className="muted">{holder ? `持有人 ${holder.holder_id}` : '收款人待识别'}</p><h2 id="evidence-title">{title}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label="关闭详情"><X size={22}/></button>
    </div>
    <div className="drawer-body">
      <section className="evidence-section"><h3>发现了什么</h3>
        {anomaly && <div className="finding"><strong>{issueCopy(anomaly).title}</strong><p>{anomaly.message}</p></div>}
        {selection.ledger && <div className="finding"><strong>{amount(selection.ledger.amount, true)} {result.metadata.currency}</strong><p>{selection.ledger.reason}</p></div>}
        {holder && <>
          <div className="evidence-status"><Badge tone={holder.settlement_status === 'settled' ? 'success' : 'warning'}>{SETTLEMENT_LABELS[holder.settlement_status]}</Badge>
            <Badge tone={holder.balance_status === 'matched' ? 'success' : 'danger'}>{holder.balance_status === 'matched' ? '金额相符' : holder.balance_status === 'short' ? '尚未付足' : '确认金额超付'}</Badge>
          </div>
          <dl className="detail-metrics">
            <div><dt>本期应付</dt><dd>{amount(holder.expected, true)}</dd></div>
            <div><dt>已确认实付</dt><dd>{amount(holder.confirmed_paid, true)}</dd></div>
            <div><dt>待确认付款</dt><dd>{amount(holder.pending_amount, true)}</dd></div>
            <div><dt>差额（实付 − 应付）</dt><dd>{amount(holder.difference, true)}</dd></div>
          </dl><p className="table-note">以上金额单位均为 {result.metadata.currency}。待确认金额尚未计入实付。</p>
        </>}
        {!anomaly && !selection.ledger && holder && <p>{holder.issue_codes.length ? `本持有人有 ${holderIssues.length} 条核对提示，请结合下方建议核实。` : '本持有人未触发核对提示，仍请结合付款进度和原始记录确认。'}</p>}
      </section>
      <section className="evidence-section"><h3>怎么核实</h3>
        {anomaly ? <p>{anomaly.suggested_action}</p> : holderIssues.length ? <ul className="action-list">{holderIssues.map(item => <li key={item.id}><strong>{CODE_LABELS[item.code]}</strong><p>{item.suggested_action}</p></li>)}</ul>
          : <p>{holder ? '核对记录日持仓、登记钱包与对应付款。多笔不同交易可以是合法的拆分付款。' : '核对付款指令、交易状态和收款钱包的登记依据。未知钱包不会自动分配给金额相同的持有人。'}</p>}
        {holder && <div className="calculation-card"><strong>应付金额怎么算？</strong>
          <p className="calculation-formula">{holder.token_units} 枚 × {result.metadata.payout_per_token} = <b>{amount(holder.expected, true)} {result.metadata.currency}</b></p>
          <p className="muted">按 {result.metadata.record_date} 的持仓逐人计算，保留 6 位小数，四舍五入。</p>
        </div>}
      </section>
      <section className="evidence-section"><h3>原始记录</h3><p className="muted">展开查看完整钱包、交易哈希和文件行号。</p>
        {holder && <details className="disclosure source-record"><summary>持有人登记记录<span>第 {holder.source_row} 行</span></summary>
          <dl className="record-dl"><div><dt>来源文件</dt><dd>{holdersName} · 第 {holder.source_row} 行</dd></div><div><dt>登记钱包</dt><dd><code>{holder.wallet}</code></dd></div><div><dt>持有数量</dt><dd>{holder.token_units}</dd></div></dl>
        </details>}
        {!rows.length && <div className="empty-record">未找到对应付款记录。请核实是否漏导、付款尚未发起或钱包登记有误。</div>}
        {rows.map(row => <details className="disclosure source-record" key={`${row.event_key}-${row.source_row}`}>
          <summary><span>付款文件第 {row.source_row} 行<strong>{amount(row.amount, true)} {result.metadata.currency}</strong></span>
            <Badge tone={!row.included ? 'neutral' : row.status === 'confirmed' && row.holder_id ? 'success' : 'warning'}>{ledgerStatus(row)} · {ledgerTreatment(row)}</Badge>
          </summary>
          <p className="record-reason">{row.reason}</p>
          <dl className="record-dl">
            <div><dt>来源文件</dt><dd>{paymentsName} · 第 {row.source_row} 行</dd></div>
            <div><dt>交易哈希</dt><dd><code>{row.tx_hash}</code></dd></div>
            <div><dt>事件序号</dt><dd>{row.event_index}</dd></div>
            <div><dt>收款钱包</dt><dd><code>{row.to_wallet}</code></dd></div>
            <div><dt>提交时间</dt><dd>{displayTime(row.submitted_at)}</dd></div>
            <div><dt>确认时间</dt><dd>{displayTime(row.confirmed_at)}</dd></div>
          </dl>
        </details>)}
        <details className="disclosure source-record"><summary>本次核对口径</summary>
          <dl className="record-dl"><div><dt>持仓记录日</dt><dd>{result.metadata.record_date}</dd></div><div><dt>付款截止</dt><dd>{displayTime(result.metadata.payment_due_at)}</dd></div><div><dt>核对时间</dt><dd>{displayTime(result.metadata.as_of)}</dd></div></dl>
        </details>
      </section>
      <div className="info-strip"><Info size={18}/><p>判断依据为上传文件，未查询实时链上记录。请人工复核后再决定后续处理。</p></div>
    </div>
    <div className="drawer-footer"><button className="button button-secondary" onClick={onClose}>返回核对结果</button></div>
  </dialog>;
}
