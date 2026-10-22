import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Info, Search, TriangleAlert } from 'lucide-react';
import { amount, CODE_LABELS, displayTime, isNonZero, issueCopy, issueGroup, ISSUE_GROUPS, ledgerStatus, ledgerTreatment, matchesAnomaly, matchesHolder, matchesLedger, resultConclusion, SETTLEMENT_LABELS, shorten } from '../presentation';
import type { IssueGroup } from '../presentation';
import type { Result } from '../types';
import { Badge, Issues } from './Common';
import { EvidenceDialog } from './EvidenceDialog';
import type { Selection } from './EvidenceDialog';
import { ReportView } from './ReportView';

type Tab = 'anomalies' | 'holders' | 'ledger';
export function ResultsView({ result, holdersName, paymentsName, busy, onExport, onEdit }: {
  result: Result; holdersName: string; paymentsName: string; busy: boolean; onExport: () => void; onEdit: () => void;
}) {
  const [tab, setTab] = useState<Tab>('anomalies');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [group, setGroup] = useState<IssueGroup>('all');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [report, setReport] = useState(false);
  const tableRef = useRef<HTMLElement>(null);
  const { summary, metadata } = result;
  const conclusion = resultConclusion(result);
  const anomalies = result.anomalies.filter(item => matchesAnomaly(item, search, group));
  const holders = result.holders.filter(item => matchesHolder(item, search, filter));
  const ledger = result.payment_ledger.filter(item => matchesLedger(item, search, filter));
  const total = tab === 'anomalies' ? anomalies.length : tab === 'holders' ? holders.length : ledger.length;
  const pageCount = Math.max(1, Math.ceil(total / 10));
  const currentPage = Math.min(page, pageCount);
  const sliced = <T,>(rows: T[]) => rows.slice((currentPage - 1) * 10, currentPage * 10);
  function chooseTab(next: Tab) { setTab(next); setSearch(''); setFilter('all'); setGroup('all'); setPage(1); }
  function showReport(value: boolean) { setReport(value); window.scrollTo(0, 0); }
  function turnPage(next: number) { setPage(next); tableRef.current?.scrollIntoView({ block: 'start' }); }
  if (report) return <ReportView result={result} busy={busy} onExport={onExport} onBack={() => showReport(false)} holdersName={holdersName} paymentsName={paymentsName}/>;
  return <>
    <div className="result-context"><span>{metadata.project_name}<b>{metadata.batch_id}</b></span><Badge tone={metadata.synthetic ? 'warning' : 'neutral'}>{metadata.synthetic ? '教学合成数据' : '用户上传数据'}</Badge></div>
    <div className="page-heading result-heading"><div><h1>{conclusion.title}</h1><p>核对时间：{displayTime(metadata.as_of)}</p></div>
      <div className="button-group"><button className="button button-secondary" onClick={onEdit}>分配设置</button><button className="button button-primary" onClick={() => showReport(true)}><ClipboardList size={18}/>查看报告</button></div>
    </div>
    <div className={`conclusion conclusion-${conclusion.tone}`} role="status">
      {conclusion.tone === 'success' ? <CheckCircle2 size={24}/> : <TriangleAlert size={24}/>}<p>{conclusion.detail}</p>
      <button className="text-link" onClick={() => { chooseTab(conclusion.tone === 'success' || !result.anomalies.length ? 'holders' : 'anomalies'); tableRef.current?.scrollIntoView({ block: 'start' }); }}>查看明细<ArrowRight size={16}/></button>
    </div>
    <section className="amount-overview" aria-label="本次分配金额汇总">
      <div className="amount-item"><h2>本期应该发多少</h2><p className="big-amount">{amount(summary.expected_total)}<small>{metadata.currency}</small></p><p>{summary.holder_count} 位持有人，按记录日持仓逐人计算。</p></div>
      <div className="amount-item"><h2>记录中已确认付出</h2><p className="big-amount">{amount(summary.confirmed_total)}<small>{metadata.currency}</small></p><p>{isNonZero(summary.unmatched_confirmed_total) ? `包含未知钱包 ${amount(summary.unmatched_confirmed_total)}，尚未匹配给任何人。` : '不含待确认及失败付款，同一事件只计一次。'}</p></div>
      <div className={`amount-item ${isNonZero(summary.shortfall_total) ? 'amount-attention' : ''}`}><h2>待核实的付款缺口</h2><p className="big-amount">{amount(summary.shortfall_total)}<small>{metadata.currency}</small></p><p>逐人不足额合计。待确认部分可能重叠，不能直接按此补付。</p></div>
    </section>
    <details className="disclosure amount-composition"><summary>查看金额组成与计算口径<span>待确认、未知钱包、超付分开展示</span></summary>
      <dl className="composition-grid">
        <div><dt>已匹配持有人的确认付款</dt><dd>{amount(summary.matched_confirmed_total)}</dd></div>
        <div><dt>未知钱包的确认付款</dt><dd>{amount(summary.unmatched_confirmed_total)}</dd></div>
        <div><dt>仍待确认的付款</dt><dd>{amount(summary.pending_total)}</dd></div>
        <div><dt>逐人超付合计</dt><dd>{amount(summary.overpayment_total)}</dd></div>
        <div><dt>总额净差（已确认 − 应付）</dt><dd>{amount(summary.net_difference)}</dd></div>
        <div><dt>逐人舍入调整合计</dt><dd>{amount(summary.rounding_adjustment, true)}</dd></div>
      </dl><div className="composition-note"><p>单位：{metadata.currency}。前两项相加为已确认付出；其余项目存在重叠，不能全部相加。付款缺口不与超付抵销，未知钱包未抵减任何人的应付。</p><p>待确认金额未计入实付。先查交易最终状态，再决定是否需要后续付款。</p></div>
    </details>
    <section className="panel results-panel" ref={tableRef} aria-label="核对明细">
      <div className="result-tabs" role="group" aria-label="核对明细类别">
        {([{ id: 'anomalies', label: '待核实事项', count: result.anomalies.length }, { id: 'holders', label: '所有持有人', count: result.holders.length }, { id: 'ledger', label: '付款记录', count: result.payment_ledger.length }] as const).map(item =>
          <button key={item.id} aria-pressed={tab === item.id} className={tab === item.id ? 'selected' : ''} onClick={() => chooseTab(item.id)}>{item.label}<span>{item.count}</span></button>)}
      </div>
      <div className="table-toolbar"><label className="search-box"><Search size={19}/><span className="visually-hidden">搜索当前明细</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={tab === 'anomalies' ? '搜索持有人、钱包或问题' : tab === 'holders' ? '搜索持有人编号或钱包' : '搜索持有人、钱包或交易哈希'}/></label>
        {tab !== 'anomalies' && <label className="filter-select"><span>筛选</span><select aria-label="筛选明细" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          <option value="all">全部记录</option>{tab === 'holders' ? <><option value="anomaly">有待核实事项</option><option value="short">尚未付足</option><option value="over">金额超付</option><option value="pending">有待确认付款</option><option value="settled">已结清</option><option value="not_due">尚未到期</option><option value="overdue">逾期未结清</option><option value="review">需要核实</option></>
            : <><option value="unknown">收款人待识别</option><option value="pending">付款待确认</option><option value="failed">付款失败</option><option value="excluded">未计入金额</option></>}
        </select></label>}
        {tab === 'anomalies' && <div className="issue-filters" role="group" aria-label="待核实事项分类">{ISSUE_GROUPS.map(item => <button key={item.id} aria-pressed={group === item.id} className={group === item.id ? 'selected' : ''} onClick={() => { setGroup(item.id); setPage(1); }}>{item.label}<span>{item.id === 'all' ? result.anomalies.length : result.anomalies.filter(anomaly => issueGroup(anomaly.code) === item.id).length}</span></button>)}</div>}
      </div>
      {tab === 'anomalies' && <p className="table-guidance">金额单位：{metadata.currency}。同一持有人可能有多条提示，涉及金额可能重叠。先核实原因，再决定如何处理。</p>}
      {total > 0 && <div className="table-scroll results-scroll">
        {tab === 'anomalies' && <table className="responsive-table issues-table"><thead><tr><th scope="col">需要核实谁</th><th scope="col">发现什么</th><th scope="col">下一步做什么</th><th scope="col">依据</th></tr></thead><tbody>{sliced(anomalies).map(item => {
          const copy = issueCopy(item);
          return <tr key={item.id}><td data-label="需要核实谁"><strong>{item.holder_id ? `持有人 ${item.holder_id}` : '收款人待识别'}</strong><span className="table-subline">{item.wallet ? <code title={item.wallet}>{shorten(item.wallet)}</code> : '未提供钱包'}</span></td>
            <td data-label="发现什么"><Badge tone={issueGroup(item.code) === 'money' ? 'danger' : 'warning'}>{CODE_LABELS[item.code] || item.code}</Badge><strong className="cell-title">{copy.title}</strong><span className="table-subline">{copy.detail}</span></td>
            <td data-label="下一步做什么" className="action-cell">{copy.action}</td><td data-label="依据"><button className="text-link evidence-link" onClick={() => setSelection({ anomaly: item, holder: result.holders.find(holder => holder.holder_id === item.holder_id) })} aria-label={`查看${item.holder_id ? `持有人 ${item.holder_id}` : `记录 ${item.id}`} ${CODE_LABELS[item.code] || item.code}的依据`}>查看依据<ArrowRight size={15}/></button></td></tr>;
        })}</tbody></table>}
        {tab === 'holders' && <table className="responsive-table holders-table"><thead><tr><th scope="col">持有人</th><th scope="col" className="numeric">本期应付</th><th scope="col" className="numeric">已确认实付</th><th scope="col" className="numeric">待确认</th><th scope="col" className="numeric">差额</th><th scope="col">付款进度</th><th scope="col">依据</th></tr></thead><tbody>{sliced(holders).map(holder => <tr key={holder.holder_id}>
          <td data-label="持有人"><strong>{holder.holder_id}</strong><span className="table-subline"><code title={holder.wallet}>{shorten(holder.wallet)}</code></span></td>
          <td data-label="本期应付" className="numeric">{amount(holder.expected)}</td><td data-label="已确认实付" className="numeric">{amount(holder.confirmed_paid)}</td><td data-label="待确认" className="numeric">{amount(holder.pending_amount)}</td><td data-label="差额（实付 − 应付）" className={`numeric ${holder.balance_status !== 'matched' ? 'danger-text' : ''}`}>{amount(holder.difference)}</td>
          <td data-label="付款进度"><Badge tone={holder.settlement_status === 'settled' ? 'success' : 'warning'}>{SETTLEMENT_LABELS[holder.settlement_status]}</Badge>{holder.issue_codes.length > 0 && <span className="table-subline">{holder.issue_codes.length} 项待核实</span>}</td>
          <td data-label="依据"><button className="text-link evidence-link" onClick={() => setSelection({ holder })} aria-label={`查看持有人${holder.holder_id}的依据`}>查看依据</button></td>
        </tr>)}</tbody></table>}
        {tab === 'ledger' && <table className="responsive-table ledger-table"><thead><tr><th scope="col">原始行</th><th scope="col">收款人 / 交易</th><th scope="col" className="numeric">付款金额</th><th scope="col">付款状态</th><th scope="col">如何计入</th><th scope="col">依据</th></tr></thead><tbody>{sliced(ledger).map(row => <tr key={`${row.event_key}-${row.source_row}`}>
          <td data-label="原始行">第 {row.source_row} 行</td><td data-label="收款人 / 交易"><strong>{row.holder_id || '收款人待识别'}</strong><span className="table-subline"><code title={row.tx_hash}>{shorten(row.tx_hash)}</code> · 事件 {row.event_index}</span></td>
          <td data-label="付款金额" className="numeric">{amount(row.amount)}</td><td data-label="付款状态"><Badge tone={row.status === 'confirmed' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}>{ledgerStatus(row)}</Badge></td>
          <td data-label="如何计入"><strong>{ledgerTreatment(row)}</strong><span className="table-subline">{row.reason}</span></td><td data-label="依据"><button className="text-link evidence-link" onClick={() => setSelection({ ledger: row, holder: result.holders.find(holder => holder.holder_id === row.holder_id) })} aria-label={`查看付款第${row.source_row}行的依据`}>查看依据</button></td>
        </tr>)}</tbody></table>}
      </div>}
      {total === 0 && <div className="empty-state"><CheckCircle2 size={32}/><h3>{search.trim() || filter !== 'all' || group !== 'all' ? '没有符合条件的记录' : tab === 'anomalies' ? '本次输入未触发核对提示' : '暂无记录'}</h3><p>{search.trim() || filter !== 'all' || group !== 'all' ? '调整搜索词或筛选条件后重试。' : '可切换所有持有人，继续核实付款进度与原始依据。'}</p></div>}
      <div className="table-footer"><span>共 {total} 条{total ? `，显示 ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, total)} 条` : ''}{tab !== 'anomalies' ? ` · 金额单位 ${metadata.currency}` : ''}</span><div><button className="icon-button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => turnPage(currentPage - 1)}><ChevronLeft size={20}/></button><span>{currentPage} / {pageCount}</span><button className="icon-button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => turnPage(currentPage + 1)}><ChevronRight size={20}/></button></div></div>
    </section>
    {result.warnings.length > 0 && <details className="disclosure result-warnings"><summary>查看输入检查提示<span>{result.warnings.length} 项</span></summary><Issues issues={result.warnings} warning/></details>}
    <div className="info-strip"><Info size={19}/><p>结果以文件中的付款状态为准，未查询实时链上记录。金额差异与付款进度分别判断；核对提示需要人工确认。</p></div>
    <div className="bottom-actions"><button className="button button-ghost" onClick={onEdit}><ArrowLeft size={17}/>返回分配设置</button><button className="button button-secondary" onClick={() => showReport(true)}>查看报告与下载<ArrowRight size={17}/></button></div>
    {selection && <EvidenceDialog selection={selection} result={result} holdersName={holdersName} paymentsName={paymentsName} onClose={() => setSelection(null)}/>}
  </>;
}
