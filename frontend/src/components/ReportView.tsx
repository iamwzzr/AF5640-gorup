import { ArrowDownToLine, ArrowLeft, FileSpreadsheet, FileText, Info, LoaderCircle } from 'lucide-react';
import { amount, displayTime, FILE_LABELS, resultConclusion } from '../presentation';
import type { Result } from '../types';
import { Badge } from './Common';

export function ReportView({ result, busy, onBack, onExport, holdersName, paymentsName }: {
  result: Result; busy: boolean; onBack: () => void; onExport: () => void; holdersName: string; paymentsName: string;
}) {
  const { metadata: meta, summary } = result;
  const files = [
    ['holders.csv', '逐人应付、实付、待确认和差额'], ['anomalies.csv', '核对提示、原始行号和建议核实步骤'],
    ['payment_ledger.csv', '每行付款的计入情况与原因'], ['summary.json', '汇总金额、数量和输入指纹'], ['rules.json', '本次分配设置与核对时间'],
  ];
  return <>
    <div className="page-heading"><div><button className="text-link" onClick={onBack}><ArrowLeft size={17}/>返回核对结果</button><h1>保存本次核对报告</h1><p>先确认摘要，再把结果与依据一起下载。</p></div>
      <button className="button button-primary" disabled={busy} onClick={onExport}>{busy ? <LoaderCircle size={18} className="spin"/> : <ArrowDownToLine size={18}/>}下载完整报告</button>
    </div>
    <section className="panel report-summary"><div className="panel-heading"><h2>{meta.project_name}</h2><Badge tone={meta.synthetic ? 'warning' : 'neutral'}>{meta.synthetic ? '教学合成数据' : '用户上传数据'}</Badge></div>
      <div className="report-body"><p className="report-conclusion">{resultConclusion(result).title}。共 {summary.issue_count} 条核对提示，涉及 {summary.affected_holder_count} 位登记持有人。未匹配的付款另列，不计入涉及持有人人数。</p>
        <dl className="report-amounts"><div><dt>本期应付</dt><dd>{amount(summary.expected_total)}</dd></div><div><dt>记录中已确认付出</dt><dd>{amount(summary.confirmed_total)}</dd></div><div><dt>逐人付款缺口</dt><dd>{amount(summary.shortfall_total)}</dd></div></dl>
        <p className="table-note">单位：{meta.currency}。已确认金额包含未知钱包 {amount(summary.unmatched_confirmed_total)}；待确认付款 {amount(summary.pending_total)} 单列。付款缺口包含尚未确认到账的部分，不能直接作为补付清单。</p>
        <dl className="report-dl"><div><dt>分配批次</dt><dd>{meta.batch_id}</dd></div><div><dt>持仓记录日</dt><dd>{meta.record_date}</dd></div><div><dt>付款截止</dt><dd>{displayTime(meta.payment_due_at)}</dd></div><div><dt>核对时间</dt><dd>{displayTime(meta.as_of)}</dd></div><div><dt>输入记录</dt><dd>{summary.holder_count} 位持有人，{summary.payment_row_count} 行付款</dd></div><div><dt>去重处理</dt><dd>{summary.unique_payment_count} 个唯一事件，排除 {summary.duplicate_row_count} 行重复导入</dd></div></dl>
      </div>
    </section>
    <div className="report-grid">
      <section className="panel"><div className="panel-heading"><h2>报告里有什么</h2><Badge>ZIP 文件</Badge></div><ul className="report-files">{files.map(([name, description]) => <li key={name}>{name.endsWith('.csv') ? <FileSpreadsheet size={21}/> : <FileText size={21}/>}<div><strong>{name}</strong><p>{description}</p></div></li>)}</ul></section>
      <section className="panel report-inputs"><div className="panel-heading"><h2>来源与计算口径</h2></div><div className="report-body">
        <p>持有人文件：<strong>{holdersName}</strong></p><p>付款文件：<strong>{paymentsName}</strong></p>
        <details className="disclosure"><summary>展开分配设置与舍入规则</summary><dl className="report-dl">
          <div><dt>项目编号</dt><dd>{meta.project_id}</dd></div><div><dt>每枚分配额</dt><dd>{meta.payout_per_token} {meta.currency}</dd></div><div><dt>网络编号</dt><dd>{meta.chain_id}</dd></div><div><dt>付款代币合约</dt><dd><code>{meta.payment_token}</code></dd></div><div><dt>舍入方式</dt><dd>逐人保留 6 位小数，四舍五入（{meta.rounding}）</dd></div><div><dt>舍入调整合计</dt><dd>{amount(summary.rounding_adjustment, true)} {meta.currency}</dd></div><div><dt>算法版本</dt><dd>{meta.algorithm_version}</dd></div>
        </dl></details>
        <details className="disclosure"><summary>展开输入指纹（SHA-256）</summary><p className="table-note">用于确认报告对应的原始输入；不验证输入本身的真实性。</p><dl className="fingerprints">{Object.entries(meta.input_fingerprints).map(([key, value]) => <div key={key}><dt>{FILE_LABELS[key as keyof typeof FILE_LABELS] || key}</dt><dd><code>{value}</code></dd></div>)}</dl></details>
      </div></section>
    </div>
    <div className="info-strip"><Info size={19}/><p>报告记录本次输入的核对结果，不执行转账，也不构成独立审计证明。修改设置或文件后，需重新核对后导出。</p></div>
    <div className="bottom-actions"><button className="button button-secondary" onClick={onBack}><ArrowLeft size={17}/>返回核对结果</button></div>
  </>;
}
