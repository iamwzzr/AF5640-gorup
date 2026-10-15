import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Download, FileCheck2, FileSpreadsheet, FileText, FolderOpen, Info, Layers3, LoaderCircle, PanelLeftClose, Play, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Sparkles, UploadCloud, Wallet, X, AlertTriangle, Clock3 } from 'lucide-react';
import * as api from './api';
import type { Anomaly, Holder, Issue, Ledger, Preview, Result, Rules, Scenario, Validation } from './types';

const STEPS = [
  { title: '分配规则', description: '确定批次与计算口径', icon: SlidersHorizontal },
  { title: '导入数据', description: '上传并检查原始文件', icon: FileSpreadsheet },
  { title: '核对结果', description: '查看差额与待核实事项', icon: CheckCheck },
  { title: '证据与报告', description: '保留依据，导出结果', icon: FolderOpen },
];
const DEFAULT_RULES: Rules = {
  project_id: 'DEMO-BOND-01', project_name: '示例债券收益分配', batch_id: '2026-Q3',
  record_date: '2026-09-30', payment_due_at: '2026-10-10T18:00', as_of: '2026-10-15T12:00',
  payout_per_token: '0.200000', chain_id: '1', currency: 'USDC',
  payment_token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', synthetic: true,
};
const CODE_LABELS: Record<string, string> = {
  SHORT_PAYMENT: '少付', UNPAID: '未支付', OVERPAYMENT: '超付', PENDING_PAYMENT: '付款待确认',
  UNMATCHED_WALLET: '未知收款钱包', DUPLICATE_IMPORT: '重复导入', FAILED_PAYMENT: '付款失败',
};
const SETTLEMENT_LABELS: Record<Holder['settlement_status'], string> = {
  settled: '已结清', not_due: '尚未到期', pending: '待确认', overdue: '逾期未结清', review: '待核实',
};
const FILE_LABELS = { rules: '分配规则', holders: '持有人文件', payments: '付款文件' };
function localDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const part = (name: string) => parts.find(item => item.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
function requestRules(draft: Rules): Rules {
  const due = new Date(`${draft.payment_due_at}+08:00`); const asOf = new Date(`${draft.as_of}+08:00`);
  if (Number.isNaN(due.getTime()) || Number.isNaN(asOf.getTime())) throw new api.ApiError('请填写有效的付款截止时间与核对时间。');
  return { ...draft, payment_due_at: `${draft.payment_due_at}+08:00`, as_of: `${draft.as_of}+08:00` };
}
/** Display only: monetary arithmetic is always performed by the backend. */
function amount(value: string | null | undefined, exact = false): string {
  if (value == null || value === '') return '—';
  const match = value.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return value;
  const [, sign, integer, decimals = ''] = match;
  const fraction = exact ? decimals.padEnd(6, '0') : decimals.replace(/0+$/, '').padEnd(2, '0');
  return `${sign}${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction ? `.${fraction}` : ''}`;
}
function shorten(value: string): string { return value.length > 20 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function displayTime(value: string | null | undefined): string { return value ? `${new Date(value).toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' })} UTC+8` : '—'; }
function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? 'field-wide' : ''}`}><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}</label>;
}
function Issues({ issues, warning = false }: { issues: Issue[]; warning?: boolean }) {
  if (!issues.length) return null;
  return <div className={`issue-list ${warning ? 'warning-list' : ''}`}><strong>{warning ? '请留意以下提示' : `请更正 ${issues.length} 项输入问题`}</strong>{issues.slice(0, 30).map((issue, i) => <div className="issue-item" key={`${issue.code}-${i}`}><AlertTriangle size={15}/><span><b>{FILE_LABELS[issue.file] || issue.file}{issue.row != null ? ` · 第 ${issue.row} 行` : ''}{issue.field ? ` · ${issue.field}` : ''}</b>{issue.message}</span></div>)}{issues.length > 30 && <p>其余 {issues.length - 30} 项问题请更正后重新检查。</p>}</div>;
}
function UploadBox({ kind, file, onChange }: { kind: 'holders' | 'payments'; file: File | null; onChange: (file: File) => void }) {
  const [drag, setDrag] = useState(false); const input = useRef<HTMLInputElement>(null);
  const title = kind === 'holders' ? '持有人快照' : '实际付款记录';
  const onFile = (candidate: File | undefined) => { if (candidate) onChange(candidate); };
  return <div className={`upload-card ${file ? 'has-file' : ''} ${drag ? 'drag-active' : ''}`}>
    <div className="upload-card-top"><span className="file-icon"><FileSpreadsheet size={22}/></span><div><h3>{title}</h3><p>{kind === 'holders' ? '记录日的持有人、钱包与持有数量' : '交易事件、收款钱包、金额及付款状态'}</p></div></div>
    <button type="button" className="drop-zone" onClick={() => input.current?.click()} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}>
      {file ? <><CheckCircle2 className="teal" size={25}/><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · 点击或拖入文件以替换</span></> : <><UploadCloud size={28}/><strong>点击上传，或将CSV拖至此处</strong><span>UTF-8 CSV · 单文件最大5 MiB · 最多10,000行</span></>}
    </button>
    <input ref={input} type="file" accept=".csv,text/csv" className="visually-hidden" aria-label={`上传${title}`} onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }}/>
    <a className="text-link template-link" href={`/examples/templates/${kind}.csv`} download><Download size={14}/>下载{title}模板</a>
  </div>;
}
function DataPreview({ data, title }: { data: Preview; title: string }) {
  return <div className="preview-block"><div className="section-line"><h3>{title}</h3><span>{data.row_count} 行 · {data.filename}</span></div><div className="table-scroll"><table className="preview-table"><thead><tr>{data.columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.rows.slice(0, 5).map((row, i) => <tr key={i}>{data.columns.map(column => <td key={column} title={String(row[column] ?? '')}>{String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div><p className="table-note">预览前 {Math.min(data.rows.length, 5)} 行。行号以原始CSV为准，表头计为第1行。</p></div>;
}
interface Selection { holder?: Holder; anomaly?: Anomaly }
function EvidenceDrawer({ selection, result, holdersName, paymentsName, onClose }: { selection: Selection; result: Result; holdersName: string; paymentsName: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { holder, anomaly } = selection;
  const ledger = result.payment_ledger.filter(row => holder ? row.holder_id === holder.holder_id : anomaly?.payment_refs.includes(row.event_key) || anomaly?.source_rows.includes(row.source_row));
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => { if (dialog?.open) dialog.close(); }; }, []);
  return <dialog ref={ref} className="evidence-dialog" onCancel={onClose} onClick={e => { if (e.target === e.currentTarget) onClose(); }} aria-labelledby="evidence-title"><div className="drawer-content">
    <div className="drawer-head"><div><span className="eyebrow">RECONCILIATION EVIDENCE</span><h2 id="evidence-title">{holder ? `持有人 ${holder.holder_id}` : CODE_LABELS[anomaly?.code || ''] || '异常详情'}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭详情"><X size={22}/></button></div>
    <div className="drawer-body">
      {holder && <><div className="detail-wallet"><Wallet size={17}/><code>{holder.wallet}</code></div><div className="evidence-status"><Badge tone={holder.settlement_status === 'settled' ? 'success' : holder.settlement_status === 'overdue' ? 'danger' : 'warning'}>{SETTLEMENT_LABELS[holder.settlement_status]}</Badge><Badge>{holder.balance_status === 'matched' ? '金额相符' : holder.balance_status === 'short' ? '金额不足' : '金额超付'}</Badge></div>
      <div className="calculation-card"><span className="eyebrow">应付计算</span><div className="calculation-formula"><strong>{holder.token_units}</strong><span>×</span><strong>{result.metadata.payout_per_token}</strong><span>＝</span><strong className="teal">{amount(holder.expected, true)}</strong></div><p>记录日持有数量 × 每枚分配额 · {result.metadata.currency}</p><p className="muted">逐人保留6位小数，采用四舍五入（HALF_UP）。</p></div>
      <dl className="detail-metrics"><div><dt>已确认实付</dt><dd>{amount(holder.confirmed_paid, true)}</dd></div><div><dt>待确认付款</dt><dd>{amount(holder.pending_amount, true)}</dd></div><div><dt>差额（实付－应付）</dt><dd>{amount(holder.difference, true)}</dd></div><div><dt>持有人来源</dt><dd>{holdersName} · 第{holder.source_row}行</dd></div></dl><div className="explanation"><Info size={18}/><p>{holder.explanation}</p></div></>}
      {anomaly && <div className="explanation"><AlertTriangle size={18}/><p>{anomaly.message}</p></div>}
      <h3 className="detail-section-title">对应付款记录 <span>{ledger.length}</span></h3>
      {!ledger.length && <div className="empty-state small"><FileText size={25}/><p>没有匹配到付款记录。</p></div>}
      {ledger.map(row => <div className="ledger-evidence" key={`${row.event_key}-${row.source_row}`}><div className="section-line"><strong>{amount(row.amount, true)} <small>{result.metadata.currency}</small></strong><Badge tone={row.included ? row.status === 'pending' ? 'warning' : 'success' : 'neutral'}>{row.status === 'confirmed' ? '已确认' : row.status === 'pending' ? '待确认' : '失败'} · {row.included ? '已计入' : '未计入'}</Badge></div><p>{row.reason}</p><dl><div><dt>原始记录</dt><dd>{paymentsName} · 第{row.source_row}行</dd></div><div><dt>交易哈希</dt><dd className="break-all"><code>{row.tx_hash}</code></dd></div><div><dt>事件序号</dt><dd>{row.event_index}</dd></div><div><dt>收款钱包</dt><dd className="break-all"><code>{row.to_wallet}</code></dd></div><div><dt>提交时间</dt><dd>{displayTime(row.submitted_at)}</dd></div><div><dt>确认时间</dt><dd>{displayTime(row.confirmed_at)}</dd></div></dl></div>)}
      <div className="detail-context"><h3>本次核对口径</h3><dl><div><dt>记录日</dt><dd>{result.metadata.record_date}</dd></div><div><dt>付款截止</dt><dd>{displayTime(result.metadata.payment_due_at)}</dd></div><div><dt>核对时点</dt><dd>{displayTime(result.metadata.as_of)}</dd></div></dl><p>付款状态来自上传文件，未查询实时链上记录。异常原因供人工复核，不构成审计证明。</p></div>
    </div><div className="drawer-footer"><ShieldCheck size={16}/>每项判断均关联原始输入与固定核对规则</div>
  </div></dialog>;
}

export default function App() {
  const [step, setStep] = useState(0); const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [holders, setHolders] = useState<File | null>(null); const [payments, setPayments] = useState<File | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null); const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'validate' | 'reconcile' | 'export' | 'scenario' | null>(null);
  const [error, setError] = useState(''); const [errorIssues, setErrorIssues] = useState<Issue[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]); const [scenarioError, setScenarioError] = useState('');
  const [showScenarios, setShowScenarios] = useState(true); const [scenarioId, setScenarioId] = useState('');
  const [selection, setSelection] = useState<Selection | null>(null); const [tab, setTab] = useState<'holders' | 'anomalies' | 'ledger'>('holders');
  const [search, setSearch] = useState(''); const [filter, setFilter] = useState('all'); const [page, setPage] = useState(1);
  const [notice, setNotice] = useState(''); const [mobileNav, setMobileNav] = useState(false);
  const controller = useRef<AbortController | null>(null); const version = useRef(0); const fileSection = useRef<HTMLDivElement>(null);
  const timezone = 'UTC+8（中国标准时间）';
  useEffect(() => { const c = new AbortController(); fetch('/examples/manifest.json', { signal: c.signal }).then(response => { if (!response.ok) throw new Error(); return response.json(); }).then(data => setScenarios(data.scenarios || [])).catch(e => { if (e.name !== 'AbortError') setScenarioError('示例暂时无法载入，仍可上传自己的CSV。'); }); return () => { c.abort(); controller.current?.abort(); }; }, []);
  useEffect(() => { setPage(1); }, [filter, search, tab]);
  function invalidate() {
    version.current += 1; controller.current?.abort(); setBusy(null); setValidation(null); setResult(null); setError(''); setErrorIssues([]); setSelection(null); setNotice(''); setScenarioId('');
  }
  function updateRule(key: keyof Rules, value: string | boolean) { invalidate(); setRules(old => ({ ...old, [key]: value })); }
  function updateFile(kind: 'holders' | 'payments', file: File) {
    invalidate(); if (file.size > 5 * 1024 * 1024) { setError('文件超过5 MiB，请缩小文件后重新上传。'); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('请上传.csv格式的文件。'); return; }
    if (kind === 'holders') setHolders(file); else setPayments(file);
  }
  async function loadScenario(scenario: Scenario) {
    invalidate(); const requestVersion = version.current; const c = new AbortController(); controller.current = c; setBusy('scenario');
    try {
      const responses = await Promise.all([fetch(scenario.holders_url, { signal: c.signal }), fetch(scenario.payments_url, { signal: c.signal })]);
      if (responses.some(response => !response.ok)) throw new Error('示例文件无法下载，请重试。');
      const [h, p] = await Promise.all(responses.map(response => response.blob()));
      if (version.current !== requestVersion) return;
      setHolders(new File([h], `${scenario.id}-holders.csv`, { type: 'text/csv' })); setPayments(new File([p], `${scenario.id}-payments.csv`, { type: 'text/csv' }));
      setRules({ ...scenario.rules, payment_due_at: localDate(scenario.rules.payment_due_at), as_of: localDate(scenario.rules.as_of) });
      setScenarioId(scenario.id); setStep(1); setShowScenarios(false); setNotice(`已载入「${scenario.name}」。数据为教学合成示例，请先检查输入。`);
    } catch (e) { if (version.current === requestVersion && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '示例载入失败。'); }
    finally { if (version.current === requestVersion) setBusy(null); }
  }
  async function run(action: 'validate' | 'reconcile' | 'export') {
    if (!holders || !payments) { setError('请先上传持有人快照和实际付款记录两份CSV。'); setStep(1); return; }
    if (action === 'export' && !result) return;
    controller.current?.abort(); version.current += 1; const c = new AbortController(); controller.current = c; const requestVersion = version.current;
    setBusy(action); setError(''); setErrorIssues([]); setNotice('');
    try {
      const payload = requestRules(rules);
      if (action === 'validate') { const data = await api.validate(payload, holders, payments, c.signal); if (version.current !== requestVersion) return; setValidation(data); setStep(1); }
      else if (action === 'reconcile') { const data = await api.reconcile(payload, holders, payments, c.signal); if (version.current !== requestVersion) return; setResult(data); setSelection(null); setTab('holders'); setFilter('all'); setSearch(''); setPage(1); setStep(2); }
      else { const blob = await api.exportReport(payload, holders, payments, c.signal); if (version.current !== requestVersion) return; const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `AF5640-gorup_${rules.batch_id.replace(/[^a-zA-Z0-9_-]/g, '_')}_report.zip`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice('报告包已生成，已开始下载。'); }
    } catch (e) { if (version.current === requestVersion && !(e instanceof DOMException && e.name === 'AbortError')) { setError(e instanceof Error ? e.message : '操作未完成，请重试。'); setErrorIssues(e instanceof api.ApiError ? e.issues : []); if (e instanceof api.ApiError && e.issues.length) setStep(1); } }
    finally { if (version.current === requestVersion) setBusy(null); }
  }
  const canRun = Boolean(holders && payments && !busy);
  const selectStep = (index: number) => { setStep(index); setMobileNav(false); };
  const input = (key: keyof Rules, options: { type?: string; placeholder?: string; readOnly?: boolean; min?: string; step?: string } = {}) => <input {...options} value={String(rules[key])} onChange={(e: ChangeEvent<HTMLInputElement>) => updateRule(key, e.target.value)} required/>;
  const filteredHolders = result?.holders.filter(holder => {
    const term = search.trim().toLowerCase();
    const matches = !term || holder.holder_id.toLowerCase().includes(term) || holder.wallet.toLowerCase().includes(term);
    return matches && (filter === 'all' || (filter === 'anomaly' ? holder.issue_codes.length > 0 : filter === 'pending' ? holder.issue_codes.includes('PENDING_PAYMENT') : filter === 'short' || filter === 'over' ? holder.balance_status === filter : holder.settlement_status === filter));
  }) || [];
  const filteredAnomalies = result?.anomalies.filter(item => !search || `${item.holder_id} ${item.wallet} ${item.message} ${CODE_LABELS[item.code]}`.toLowerCase().includes(search.toLowerCase())) || [];
  const filteredLedger = result?.payment_ledger.filter(item => !search || `${item.holder_id} ${item.to_wallet} ${item.tx_hash} ${item.reason}`.toLowerCase().includes(search.toLowerCase())) || [];
  const totalRows = tab === 'holders' ? filteredHolders.length : tab === 'anomalies' ? filteredAnomalies.length : filteredLedger.length;
  const pageSize = 10; const pageCount = Math.max(1, Math.ceil(totalRows / pageSize)); const currentPage = Math.min(page, pageCount);
  const sliced = <T,>(rows: T[]) => rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const stats = result ? [
    { label: '应付总额', value: result.summary.expected_total, icon: Wallet, tone: '', helper: `${result.summary.holder_count} 位持有人` },
    { label: '已确认实付', value: result.summary.confirmed_total, icon: CheckCircle2, tone: 'teal', helper: '含无法匹配的已确认付款' },
    { label: '个人不足额合计', value: result.summary.shortfall_total, icon: AlertTriangle, tone: 'red', helper: '逐人累计，不与超付抵销' },
    { label: '个人超额合计', value: result.summary.overpayment_total, icon: ArrowRight, tone: 'amber', helper: '需人工确认超付原因' },
    { label: '待确认付款', value: result.summary.pending_total, icon: Clock3, tone: 'amber', helper: '未计入已确认实付' },
    { label: '未知钱包已确认', value: result.summary.unmatched_confirmed_total, icon: CircleHelp, tone: '', helper: '保留记录，等待身份匹配' },
  ] : [];

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'nav-open' : ''}`}><div className="brand"><div className="brand-symbol">AF<span>·</span></div><div><strong>AF5640-gorup</strong><span>收益分配核对</span></div><button className="icon-button mobile-nav-close" onClick={() => setMobileNav(false)} aria-label="关闭导航"><X size={20}/></button></div>
      <div className="sidebar-workspace"><span className="eyebrow">WORKSPACE</span><div><span className="workspace-dot"/><strong>项目工作台</strong><ChevronDown size={15}/></div></div>
      <nav aria-label="核对步骤"><span className="nav-label">核对流程</span>{STEPS.map((item, i) => <button key={item.title} className={`nav-item ${step === i ? 'active' : ''}`} disabled={i >= 2 && !result} onClick={() => selectStep(i)}><item.icon size={20}/><span><strong>{item.title}</strong><small>{item.description}</small></span><span className="nav-index">{i < 2 && result ? <Check size={14}/> : `0${i + 1}`}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="session-note"><ShieldCheck size={18}/><div><strong>当前会话处理</strong><p>无需账户或数据库。刷新页面后，当前输入与结果将被清除。</p></div></div><span className="sidebar-version">AF5640 GROUP PROJECT <span>V1.0</span></span></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="打开导航"><PanelLeftClose size={21}/></button><Layers3 size={17}/><span>项目工作台</span><ChevronRight size={14}/><strong>{STEPS[step].title}</strong></div><div className="topbar-right"><span className="status-dot"/>本机工作区<span className="topbar-separator"/>无服务器持久存储</div></header>
    <main><div className="page-heading"><div><span className="eyebrow">DISTRIBUTION RECONCILIATION</span><h1>{step === 0 ? '收益分配工作台' : STEPS[step].title}</h1><p>{step === 0 ? '从持有人快照到付款流水，逐人核对每一笔收益分配。' : step === 1 ? '上传原始记录，先检查数据格式与口径，再开始核对。' : step === 2 ? '总额、个人差额与付款进度分开展示，保留每一项判断依据。' : '将本次核对的结果、规则与输入指纹一起保存。'}</p></div><button className="button button-secondary demo-toggle" onClick={() => setShowScenarios(!showScenarios)} aria-expanded={showScenarios}><Play size={16}/>{showScenarios ? '收起示例' : '载入合成示例'}</button></div>
      {showScenarios && <section className="scenario-panel"><div className="scenario-intro"><span className="scenario-symbol"><Sparkles size={20}/></span><div><h2>先用示例走完一次核对</h2><p>预置教学合成数据，不包含真实投资人或付款。</p></div><Badge tone="teal">SYNTHETIC DATA</Badge></div><div className="scenario-grid">{scenarios.map((scenario, i) => <button className="scenario-option" key={scenario.id} onClick={() => loadScenario(scenario)} disabled={Boolean(busy)}><div className="scenario-number">0{i + 1}</div><div><h3>{scenario.name}</h3><p>{scenario.description}</p></div><ArrowRight size={19}/></button>)}{!scenarios.length && <p className="muted">{scenarioError || '正在读取示例…'}</p>}</div></section>}
      {error && <div className="alert alert-error" role="alert"><AlertTriangle size={19}/><div><strong>操作未完成</strong><p>{error}</p></div><button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={17}/></button></div>}
      {notice && <div className="alert alert-notice" role="status"><CheckCircle2 size={18}/><p>{notice}</p><button className="icon-button" onClick={() => setNotice('')} aria-label="关闭提示"><X size={17}/></button></div>}
      {busy === 'scenario' && <div className="alert alert-notice" role="status"><LoaderCircle size={18} className="spin"/>正在载入示例文件…</div>}
      <Issues issues={errorIssues}/>

      {step === 0 && <><section className="panel rule-panel"><div className="panel-heading"><div><span className="section-number">01</span><h2>设置分配批次</h2></div><Badge>单项目 · 单批次</Badge></div><div className="form-grid"><Field label="项目名称">{input('project_name', { placeholder: '例如：示例债券收益分配' })}</Field><Field label="项目编号" hint="应与两份CSV中的project_id一致">{input('project_id')}</Field><Field label="分配批次" hint="应与付款文件中的batch_id一致">{input('batch_id')}</Field><Field label="记录日" hint="据此确定持有人快照">{input('record_date', { type: 'date' })}</Field></div><div className="form-divider"/><div className="form-grid"><Field label="每枚代币分配额" hint="最多6位小数；由后端按十进制计算"><div className="input-suffix">{input('payout_per_token', { type: 'text', placeholder: '0.200000' })}<span>{rules.currency}</span></div></Field><Field label="付款币种"><input value={rules.currency} readOnly/><span className="fixed-value-note">第一版采用USDC</span></Field><Field label="付款截止时间">{input('payment_due_at', { type: 'datetime-local' })}</Field><Field label="核对时间" hint={`时间按 ${timezone} 输入，提交时携带时区`}>{input('as_of', { type: 'datetime-local' })}</Field></div><div className="form-divider"/><div className="form-grid"><Field label="网络编号（Chain ID）" hint="第一版使用EVM钱包与交易事件">{input('chain_id')}</Field><Field label="付款代币合约" hint="以网络及合约地址识别付款资产">{input('payment_token')}</Field></div><label className="checkbox-row"><input type="checkbox" checked={rules.synthetic} onChange={e => updateRule('synthetic', e.target.checked)}/><span>本批次使用教学合成数据<small>此标识会保留在核对结果与导出报告中。</small></span></label></section>
      <div className="info-strip"><Info size={18}/><p><strong>固定核对口径</strong>　应付＝持有数量×每枚分配额，逐人保留6位小数。付款状态来自上传文件，核对时点不代表实时链上查询。</p></div><div className="bottom-actions"><span>下一步：上传持有人快照和付款记录</span><button className="button button-primary" onClick={() => setStep(1)}>保存规则，导入数据<ArrowRight size={17}/></button></div></>}

      {step === 1 && <><div ref={fileSection} className="upload-grid"><UploadBox kind="holders" file={holders} onChange={f => updateFile('holders', f)}/><UploadBox kind="payments" file={payments} onChange={f => updateFile('payments', f)}/></div><div className="input-context"><div><span>当前批次</span><strong>{rules.project_name || '未命名项目'}</strong><code>{rules.batch_id || '未填写批次'}</code>{scenarioId && <Badge tone="teal">合成示例</Badge>}</div><button className="text-link" onClick={() => setStep(0)}>修改规则<ArrowRight size={14}/></button></div>
      {validation && <section className="panel validation-panel"><div className="panel-heading"><div><span className={`validation-icon ${validation.valid ? 'teal' : 'red'}`}>{validation.valid ? <CheckCircle2 size={22}/> : <AlertTriangle size={22}/>}</span><h2>{validation.valid ? '数据检查通过' : '数据需要更正'}</h2></div><Badge tone={validation.valid ? 'success' : 'danger'}>{validation.valid ? '可开始核对' : '存在阻断问题'}</Badge></div><Issues issues={validation.issues}/><Issues issues={validation.warnings} warning/>{validation.preview?.holders && <DataPreview data={validation.preview.holders} title="持有人快照预览"/>}{validation.preview?.payments && <DataPreview data={validation.preview.payments} title="付款记录预览"/>}</section>}
      {!validation && <div className="panel input-check-note"><FileCheck2 size={24}/><div><h3>先检查输入，避免错误口径影响结果</h3><p>系统会检查字段、快照日期、金额精度、钱包映射与事件重复。未知钱包和待确认付款会保留在后续核对结果中。</p></div></div>}
      <div className="bottom-actions"><button className="button button-ghost" onClick={() => setStep(0)}><ArrowLeft size={16}/>返回规则</button><div className="button-group"><button className="button button-secondary" disabled={!canRun} onClick={() => run('validate')}>{busy === 'validate' ? <LoaderCircle size={17} className="spin"/> : <FileCheck2 size={17}/>}检查输入</button><button className="button button-primary" disabled={!canRun || validation?.valid === false} onClick={() => run('reconcile')}>{busy === 'reconcile' ? <LoaderCircle size={17} className="spin"/> : <CheckCheck size={17}/>}开始核对<ArrowRight size={16}/></button></div></div></>}

      {step === 2 && result && <><div className="result-caption"><div><Badge tone={result.metadata.synthetic ? 'teal' : 'neutral'}>{result.metadata.synthetic ? '教学合成数据' : '用户上传数据'}</Badge><strong>{result.metadata.project_name}</strong><span>{result.metadata.batch_id}</span></div><span>核对时点 {displayTime(result.metadata.as_of)}</span></div><div className="stats-grid">{stats.map(stat => <div className={`stat-card ${stat.tone}`} key={stat.label}><div className="stat-label">{stat.label}<stat.icon size={17}/></div><div className="stat-value">{amount(stat.value)}<small>{result.metadata.currency}</small></div><p>{stat.helper}</p></div>)}</div><div className="result-insight"><span className="insight-icon"><Info size={19}/></span><p><strong>{result.summary.affected_holder_count} 位持有人存在待处理事项</strong><span>已确认实付与应付的净差额为 {amount(result.summary.net_difference)} {result.metadata.currency}。个人不足额与超额分别统计，未知钱包付款单独列示。</span></p><button className="text-link" onClick={() => { setTab('anomalies'); setSearch(''); }}>查看全部异常<ArrowRight size={15}/></button></div>
      <section className="panel results-panel"><div className="result-tabs" role="tablist" aria-label="核对结果类别"><button role="tab" aria-selected={tab === 'holders'} className={tab === 'holders' ? 'selected' : ''} onClick={() => { setTab('holders'); setSearch(''); }}>持有人明细<span>{result.holders.length}</span></button><button role="tab" aria-selected={tab === 'anomalies'} className={tab === 'anomalies' ? 'selected' : ''} onClick={() => { setTab('anomalies'); setSearch(''); }}>异常清单<span>{result.anomalies.length}</span></button><button role="tab" aria-selected={tab === 'ledger'} className={tab === 'ledger' ? 'selected' : ''} onClick={() => { setTab('ledger'); setSearch(''); }}>付款处理明细<span>{result.payment_ledger.length}</span></button></div><div className="table-toolbar"><label className="search-input"><Search size={17}/><input aria-label="搜索核对记录" placeholder={tab === 'ledger' ? '搜索持有人、钱包或交易哈希' : '搜索持有人或钱包地址'} value={search} onChange={e => setSearch(e.target.value)}/>{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="清除搜索"><X size={14}/></button>}</label>{tab === 'holders' ? <label className="filter-select"><SlidersHorizontal size={15}/><select aria-label="筛选持有人状态" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">全部状态</option><option value="anomaly">含待处理事项</option><option value="settled">已结清</option><option value="short">金额不足</option><option value="over">金额超付</option><option value="pending">付款待确认</option><option value="overdue">逾期未结清</option><option value="review">待核实</option></select></label> : <span className="table-note">共 {totalRows} 条记录</span>}</div><div className="table-scroll">
      {tab === 'holders' && <table className="results-table"><thead><tr><th>持有人 / 钱包</th><th className="numeric">持有数量</th><th className="numeric">应付</th><th className="numeric">已确认实付</th><th className="numeric">待确认</th><th className="numeric">差额</th><th>结清状态</th><th/></tr></thead><tbody>{sliced(filteredHolders).map(holder => <tr key={holder.holder_id}><td><div className="holder-cell"><span className="avatar">{holder.holder_id.slice(0, 2)}</span><div><strong>{holder.holder_id}</strong><code title={holder.wallet}>{shorten(holder.wallet)}</code></div></div></td><td className="numeric muted">{holder.token_units}</td><td className="numeric">{amount(holder.expected)}</td><td className="numeric">{amount(holder.confirmed_paid)}</td><td className="numeric muted">{amount(holder.pending_amount)}</td><td className={`numeric ${holder.balance_status === 'short' ? 'red' : holder.balance_status === 'over' ? 'amber' : 'muted'}`}>{amount(holder.difference)}</td><td><Badge tone={holder.settlement_status === 'settled' ? 'success' : holder.settlement_status === 'overdue' ? 'danger' : 'warning'}>{SETTLEMENT_LABELS[holder.settlement_status]}</Badge></td><td><button className="table-action" onClick={() => setSelection({ holder })}>详情<ChevronRight size={14}/></button></td></tr>)}</tbody></table>}
      {tab === 'anomalies' && <table className="results-table"><thead><tr><th>异常类型</th><th>持有人</th><th>核对说明</th><th className="numeric">相关金额</th><th>原始付款行</th><th/></tr></thead><tbody>{sliced(filteredAnomalies).map(item => <tr key={item.id}><td><Badge tone={item.severity === 'warning' ? 'neutral' : item.code === 'UNPAID' || item.code === 'SHORT_PAYMENT' ? 'danger' : 'warning'}>{CODE_LABELS[item.code] || item.code}</Badge></td><td><strong>{item.holder_id || '待识别'}</strong>{item.wallet && <code className="table-subline" title={item.wallet}>{shorten(item.wallet)}</code>}</td><td className="explanation-cell">{item.message}</td><td className="numeric">{amount(item.amount)}</td><td className="muted">{item.source_rows.length ? item.source_rows.join(', ') : '—'}</td><td><button className="table-action" onClick={() => setSelection({ anomaly: item, holder: result.holders.find(h => h.holder_id === item.holder_id) })}>证据<ChevronRight size={14}/></button></td></tr>)}</tbody></table>}
      {tab === 'ledger' && <table className="results-table"><thead><tr><th>源文件行</th><th>付款事件</th><th>持有人</th><th className="numeric">付款金额</th><th>付款状态</th><th>处理结果</th><th>原因</th></tr></thead><tbody>{sliced(filteredLedger).map((row: Ledger) => <tr key={`${row.event_key}-${row.source_row}`}><td>{row.source_row}</td><td><code title={row.tx_hash}>{shorten(row.tx_hash)}</code><span className="table-subline">事件 #{row.event_index}</span></td><td>{row.holder_id || '未知钱包'}</td><td className="numeric">{amount(row.amount)}</td><td><Badge tone={row.status === 'confirmed' ? 'success' : row.status === 'pending' ? 'warning' : 'danger'}>{row.status === 'confirmed' ? '已确认' : row.status === 'pending' ? '待确认' : '失败'}</Badge></td><td><Badge tone={row.included ? 'teal' : 'neutral'}>{row.included ? '已计入' : '未计入'}</Badge></td><td className="explanation-cell">{row.reason}</td></tr>)}</tbody></table>}
      </div>{totalRows === 0 && <div className="empty-state"><CheckCircle2 size={30}/><h3>{search || filter !== 'all' && tab === 'holders' ? '没有符合条件的记录' : tab === 'anomalies' ? '本次核对未发现异常' : '暂无记录'}</h3><p>{search ? '尝试调整搜索词或筛选条件。' : '可切换其他明细查看原始记录。'}</p></div>}<div className="table-footer"><span>共 {totalRows} 条{totalRows ? ` · 显示 ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalRows)} 条` : ''}</span><div><button className="icon-button" aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17}/></button><span>{currentPage} / {pageCount}</span><button className="icon-button" aria-label="下一页" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17}/></button></div></div></section>
      {result.warnings.length > 0 && <Issues issues={result.warnings} warning/>}<div className="bottom-actions"><button className="button button-ghost" onClick={() => setStep(1)}><ArrowLeft size={16}/>返回输入</button><button className="button button-primary" onClick={() => setStep(3)}>查看报告与证据<ArrowRight size={17}/></button></div></>}

      {step === 3 && result && <><section className="panel export-panel"><div className="export-art"><FolderOpen size={35}/><span>ZIP</span></div><div className="export-description"><Badge tone="teal">核对结果包</Badge><h2>结果与依据，一起保存</h2><p>包括持有人结果、异常清单、付款处理明细、汇总与分配规则。所有金额和状态均基于当前输入及固定核对时点生成。</p><div className="export-files"><span><FileSpreadsheet size={14}/>3份CSV</span><span><FileText size={14}/>2份JSON</span><span><ShieldCheck size={14}/>输入SHA-256指纹</span></div></div><button className="button button-primary" disabled={Boolean(busy)} onClick={() => run('export')}>{busy === 'export' ? <LoaderCircle size={17} className="spin"/> : <ArrowDownToLine size={17}/>}下载完整报告</button></section><div className="report-grid"><section className="panel report-detail"><div className="panel-heading"><div><ClipboardList size={20}/><h2>批次与计算口径</h2></div></div><dl className="report-dl"><div><dt>项目名称</dt><dd>{result.metadata.project_name}</dd></div><div><dt>项目 / 批次</dt><dd>{result.metadata.project_id} / {result.metadata.batch_id}</dd></div><div><dt>记录日</dt><dd>{result.metadata.record_date}</dd></div><div><dt>付款截止</dt><dd>{displayTime(result.metadata.payment_due_at)}</dd></div><div><dt>核对时点</dt><dd>{displayTime(result.metadata.as_of)}</dd></div><div><dt>每枚分配额</dt><dd>{result.metadata.payout_per_token} {result.metadata.currency}</dd></div><div><dt>网络 / 币种</dt><dd>{result.metadata.chain_id} / {result.metadata.currency}</dd></div><div><dt>付款代币合约</dt><dd className="break-all"><code>{result.metadata.payment_token}</code></dd></div><div><dt>舍入规则</dt><dd>逐人6位小数 · {result.metadata.rounding}</dd></div><div><dt>舍入调整合计</dt><dd>{amount(result.summary.rounding_adjustment, true)} {result.metadata.currency}</dd></div></dl></section><section className="panel report-detail"><div className="panel-heading"><div><ShieldCheck size={20}/><h2>输入与处理记录</h2></div></div><dl className="report-dl"><div><dt>持有人记录</dt><dd>{result.summary.holder_count} 人</dd></div><div><dt>上传付款记录</dt><dd>{result.summary.payment_row_count} 行</dd></div><div><dt>唯一付款事件</dt><dd>{result.summary.unique_payment_count} 个</dd></div><div><dt>排除重复导入</dt><dd>{result.summary.duplicate_row_count} 行</dd></div><div><dt>核对算法版本</dt><dd>{result.metadata.algorithm_version}</dd></div><div><dt>示例数据标识</dt><dd>{result.metadata.synthetic ? '教学合成数据' : '用户上传数据'}</dd></div></dl><div className="fingerprints"><h3>输入指纹 · SHA-256</h3>{Object.entries(result.metadata.input_fingerprints).map(([key, value]) => <div key={key}><span>{key === 'holders' ? '持有人文件' : key === 'payments' ? '付款文件' : '分配规则'}</span><code>{value}</code></div>)}</div></section></div><div className="info-strip"><Info size={19}/><p>本工具核对上传记录的一致性，不执行转账、不核实资产真实性，也不构成审计或法律意见。修改任何文件或规则后，必须重新核对才能导出。</p></div><div className="bottom-actions"><button className="button button-ghost" onClick={() => setStep(2)}><ArrowLeft size={16}/>返回核对结果</button><button className="button button-secondary" disabled={Boolean(busy)} onClick={() => run('reconcile')}><RefreshCw size={16}/>重新核对当前输入</button></div></>}
      <footer className="workspace-footer"><span>AF5640-gorup <span className="footer-dot">·</span> 收益分配核对助手</span><span><ShieldCheck size={13}/>规则计算 · 原始行号 · 可追溯证据</span></footer>
    </main></div>{selection && result && <EvidenceDrawer selection={selection} result={result} holdersName={holders?.name || 'holders.csv'} paymentsName={payments?.name || 'payments.csv'} onClose={() => setSelection(null)}/>}
    {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label="关闭导航"/>}
  </div>;
}
