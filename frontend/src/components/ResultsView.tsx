import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Info, Search, TriangleAlert } from 'lucide-react';
import { amount, CODE_LABELS, displayTime, isNonZero, issueCopy, issueGroup, ISSUE_GROUPS, ledgerExplanation, ledgerStatus, ledgerTreatment, matchesAnomaly, matchesHolder, matchesLedger, resultConclusion, SETTLEMENT_LABELS } from '../presentation';
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
    <div className="result-context"><span>{metadata.project_name}<b>{metadata.batch_id}</b></span><Badge tone={metadata.synthetic ? 'warning' : 'neutral'}>{metadata.synthetic ? '演示用数据' : '你上传的数据'}</Badge></div>
    <div className="page-heading result-heading"><div><h1>{conclusion.title}</h1><p>核对时间：{displayTime(metadata.as_of)}</p></div>
      <div className="button-group"><button className="button button-secondary" onClick={onEdit}>修改规则</button><button className="button button-primary" onClick={() => showReport(true)}><ClipboardList size={18}/>查看报告</button></div>
    </div>
    <div className={`conclusion conclusion-${conclusion.tone}`} role="status">
      {conclusion.tone === 'success' ? <CheckCircle2 size={24}/> : <TriangleAlert size={24}/>}<p>{conclusion.detail}</p>
      <button className="text-link" onClick={() => { chooseTab(conclusion.tone === 'success' || !result.anomalies.length ? 'holders' : 'anomalies'); tableRef.current?.scrollIntoView({ block: 'start' }); }}>查看明细<ArrowRight size={16}/></button>
    </div>
    <section className="amount-overview" aria-label="本次分配金额汇总">
      <div className="amount-item"><h2>这次该发多少</h2><p className="big-amount">{amount(summary.expected_total)}<small>{metadata.currency}</small></p><p>{summary.holder_count} 位收款人，每人该收的钱加在一起。</p></div>
      <div className="amount-item"><h2>表格里已发多少</h2><p className="big-amount">{amount(summary.confirmed_total)}<small>{metadata.currency}</small></p><p>{isNonZero(summary.unmatched_confirmed_total) ? `只算已确认的付款。其中 ${amount(summary.unmatched_confirmed_total)} 还不知道付给了谁。` : '只算表格中已确认的付款，重复记录不会多算。'}</p></div>
      <div className={`amount-item ${isNonZero(summary.shortfall_total) ? 'amount-attention' : ''}`}><h2>还有多少没发齐</h2><p className="big-amount">{amount(summary.shortfall_total)}<small>{metadata.currency}</small></p><p>把每人少收的金额加在一起。有些钱可能还在等确认，别直接照这个数补发。</p></div>
    </section>
    <details className="disclosure amount-composition"><summary>这些数字怎么算的？<span>展开看详细说明</span></summary>
      <dl className="composition-grid">
        <div><dt>知道付给了谁的已确认付款</dt><dd>{amount(summary.matched_confirmed_total)}</dd></div>
        <div><dt>还不知道付给谁的已确认付款</dt><dd>{amount(summary.unmatched_confirmed_total)}</dd></div>
        <div><dt>还在等确认的钱</dt><dd>{amount(summary.pending_total)}</dd></div>
        <div><dt>有些人多收的钱</dt><dd>{amount(summary.overpayment_total)}</dd></div>
      </dl><div className="composition-note"><p>单位：{metadata.currency}。前两项加起来是表格里的已发金额。一个人多收的钱，不能替另一个人算作已收到。</p><p>等待确认的钱，可能已经包含在“没发齐”中，这些数字不能全部相加。先查付款有没有成功，再决定要不要补发。</p></div>
    </details>
    <section className="panel results-panel" ref={tableRef} aria-label="核对明细">
      <div className="result-tabs" role="group" aria-label="核对明细类别">
        {([{ id: 'anomalies', label: '需要检查', count: result.anomalies.length }, { id: 'holders', label: '收款名单', count: result.holders.length }, { id: 'ledger', label: '付款记录', count: result.payment_ledger.length }] as const).map(item =>
          <button key={item.id} aria-pressed={tab === item.id} className={tab === item.id ? 'selected' : ''} onClick={() => chooseTab(item.id)}>{item.label}<span>{item.count}</span></button>)}
      </div>
      <div className="table-toolbar"><label className="search-box"><Search size={19}/><span className="visually-hidden">搜索当前明细</span><input value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} placeholder={tab === 'anomalies' ? '输入收款人编号或问题' : tab === 'holders' ? '输入收款人编号或地址' : '输入收款人或付款编号'}/></label>
        {tab !== 'anomalies' && <label className="filter-select"><span>筛选</span><select aria-label="筛选明细" value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}>
          <option value="all">全部记录</option>{tab === 'holders' ? <><option value="anomaly">有问题要检查</option><option value="short">钱还没发齐</option><option value="over">多发了钱</option><option value="pending">付款还在确认</option><option value="settled">已经付清</option><option value="not_due">还没到截止时间</option><option value="overdue">过了期限还没付清</option><option value="review">需要再检查</option></>
            : <><option value="unknown">不知道付给谁</option><option value="pending">还在等确认</option><option value="failed">付款没成功</option><option value="excluded">这行没有计算</option></>}
        </select></label>}
        {tab === 'anomalies' && <div className="issue-filters" role="group" aria-label="按问题筛选">{ISSUE_GROUPS.map(item => <button key={item.id} aria-pressed={group === item.id} className={group === item.id ? 'selected' : ''} onClick={() => { setGroup(item.id); setPage(1); }}>{item.label}<span>{item.id === 'all' ? result.anomalies.length : result.anomalies.filter(anomaly => issueGroup(anomaly.code) === item.id).length}</span></button>)}</div>}
      </div>
      {tab === 'anomalies' && <p className="table-guidance">金额单位：{metadata.currency}。一个人可能有几条问题，所以这里的钱不能重复相加。</p>}
      {tab === 'holders' && <p className="table-guidance">金额单位：{metadata.currency}。“已发”只算表格中已确认的付款；正数表示多发，负数表示少发。</p>}
      {tab === 'ledger' && <p className="table-guidance">这里显示付款表中的每一行。钱是否发出，要看付款情况；重复记录不会多算。</p>}
      {total > 0 && <div className="table-scroll results-scroll">
        {tab === 'anomalies' && <table className="responsive-table issues-table"><thead><tr><th scope="col">谁需要检查</th><th scope="col">哪里不对</th><th scope="col">接下来怎么做</th><th scope="col">详情</th></tr></thead><tbody>{sliced(anomalies).map(item => {
          const copy = issueCopy(item);
          return <tr key={item.id}><td data-label="谁需要检查"><strong>{item.holder_id ? `收款人 ${item.holder_id}` : '还不知道是谁'}</strong><span className="table-subline">{item.holder_id ? '收款名单中的人' : '收款地址不在名单里'}</span></td>
            <td data-label="哪里不对"><Badge tone={issueGroup(item.code) === 'money' ? 'danger' : 'warning'}>{CODE_LABELS[item.code] || item.code}</Badge><strong className="cell-title">{copy.title}</strong><span className="table-subline">{copy.detail}</span></td>
            <td data-label="接下来怎么做" className="action-cell">{copy.action}</td><td data-label="详情"><button className="text-link evidence-link" onClick={() => setSelection({ anomaly: item, holder: result.holders.find(holder => holder.holder_id === item.holder_id) })} aria-label={`查看${item.holder_id ? `收款人 ${item.holder_id}` : `记录 ${item.id}`} ${CODE_LABELS[item.code] || item.code}的详情`}>查看详情<ArrowRight size={15}/></button></td></tr>;
        })}</tbody></table>}
        {tab === 'holders' && <table className="responsive-table holders-table"><thead><tr><th scope="col">收款人</th><th scope="col" className="numeric">该发多少</th><th scope="col" className="numeric">已发多少</th><th scope="col" className="numeric">还在确认</th><th scope="col" className="numeric">多了或少了</th><th scope="col">付款情况</th><th scope="col">详情</th></tr></thead><tbody>{sliced(holders).map(holder => <tr key={holder.holder_id}>
          <td data-label="收款人"><strong>{holder.holder_id}</strong><span className="table-subline">持有 {holder.token_units} 个代币</span></td>
          <td data-label="该发多少" className="numeric">{amount(holder.expected)}</td><td data-label="已发多少" className="numeric">{amount(holder.confirmed_paid)}</td><td data-label="还在确认" className="numeric">{amount(holder.pending_amount)}</td><td data-label="多了或少了" className={`numeric ${holder.balance_status !== 'matched' ? 'danger-text' : ''}`}>{amount(holder.difference)}</td>
          <td data-label="付款情况"><Badge tone={holder.settlement_status === 'settled' ? 'success' : 'warning'}>{SETTLEMENT_LABELS[holder.settlement_status]}</Badge>{holder.issue_codes.length > 0 && <span className="table-subline">{holder.issue_codes.length} 个问题要检查</span>}</td>
          <td data-label="详情"><button className="text-link evidence-link" onClick={() => setSelection({ holder })} aria-label={`查看收款人${holder.holder_id}的详情`}>查看详情</button></td>
        </tr>)}</tbody></table>}
        {tab === 'ledger' && <table className="responsive-table ledger-table"><thead><tr><th scope="col">表格位置</th><th scope="col">发给了谁</th><th scope="col" className="numeric">发了多少</th><th scope="col">付款情况</th><th scope="col">这笔怎么算</th><th scope="col">详情</th></tr></thead><tbody>{sliced(ledger).map(row => <tr key={`${row.event_key}-${row.source_row}`}>
          <td data-label="表格位置">第 {row.source_row} 行</td><td data-label="发给了谁"><strong>{row.holder_id || '还不知道是谁'}</strong><span className="table-subline">{row.holder_id ? '收款地址在名单里' : '收款地址不在名单里'}</span></td>
          <td data-label="发了多少" className="numeric">{amount(row.amount)}</td><td data-label="付款情况"><Badge tone={row.status === 'confirmed' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}>{ledgerStatus(row)}</Badge></td>
          <td data-label="这笔怎么算"><strong>{ledgerTreatment(row)}</strong><span className="table-subline">{ledgerExplanation(row)}</span></td><td data-label="详情"><button className="text-link evidence-link" onClick={() => setSelection({ ledger: row, holder: result.holders.find(holder => holder.holder_id === row.holder_id) })} aria-label={`查看付款第${row.source_row}行的详情`}>查看详情</button></td>
        </tr>)}</tbody></table>}
      </div>}
      {total === 0 && <div className="empty-state"><CheckCircle2 size={32}/><h3>{search.trim() || filter !== 'all' || group !== 'all' ? '没有找到这样的记录' : tab === 'anomalies' ? '这两份表格暂时没发现问题' : '这里还没有记录'}</h3><p>{search.trim() || filter !== 'all' || group !== 'all' ? '换个关键词，或试试“全部记录”。' : '可以打开“收款名单”，查看每个人的付款情况。'}</p></div>}
      <div className="table-footer"><span>共 {total} 条{total ? `，显示 ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, total)} 条` : ''}{tab !== 'anomalies' ? ` · 金额单位 ${metadata.currency}` : ''}</span><div><button className="icon-button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => turnPage(currentPage - 1)}><ChevronLeft size={20}/></button><span>{currentPage} / {pageCount}</span><button className="icon-button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => turnPage(currentPage + 1)}><ChevronRight size={20}/></button></div></div>
    </section>
    {result.warnings.length > 0 && <details className="disclosure result-warnings"><summary>查看表格检查时的提醒<span>{result.warnings.length} 项</span></summary><Issues issues={result.warnings} warning/></details>}
    <div className="info-strip"><Info size={19}/><p>这里只核对你上传的表格，没有去查询实际交易。处理付款前，请再确认实际情况。</p></div>
    <div className="bottom-actions"><button className="button button-ghost" onClick={onEdit}><ArrowLeft size={17}/>返回填写规则</button><button className="button button-secondary" onClick={() => showReport(true)}>保存核对报告<ArrowRight size={17}/></button></div>
    {selection && <EvidenceDialog selection={selection} result={result} holdersName={holdersName} paymentsName={paymentsName} onClose={() => setSelection(null)}/>}
  </>;
}
