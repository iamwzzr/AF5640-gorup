import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCheck, CheckCircle2, FileCheck2, Info, LoaderCircle, Play, X } from 'lucide-react';
import * as api from './api';
import { Badge, Issues } from './components/Common';
import { DataPreview, RulesForm, UploadBox } from './components/Inputs';
import { ResultsView } from './components/ResultsView';
import type { Issue, Result, Rules, Scenario, Validation } from './types';

const STEPS = ['分配设置', '导入数据', '查看结果'];
const DEFAULT_RULES: Rules = {
  project_id: 'DEMO-BOND-01', project_name: '示例债券收益分配', batch_id: '2026-Q3',
  record_date: '2026-09-30', payment_due_at: '2026-10-10T18:00', as_of: '2026-10-15T12:00',
  payout_per_token: '0.200000', chain_id: '1', currency: 'USDC',
  payment_token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', synthetic: true,
};
function localDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const part = (name: string) => parts.find(item => item.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
function requestRules(draft: Rules): Rules {
  const due = new Date(`${draft.payment_due_at}+08:00`);
  const asOf = new Date(`${draft.as_of}+08:00`);
  if (Number.isNaN(due.getTime()) || Number.isNaN(asOf.getTime())) throw new api.ApiError('请填写有效的付款截止时间与核对时间。');
  return { ...draft, payment_due_at: `${draft.payment_due_at}+08:00`, as_of: `${draft.as_of}+08:00` };
}

export default function App() {
  const [step, setStep] = useState(0);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [holders, setHolders] = useState<File | null>(null);
  const [payments, setPayments] = useState<File | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<'validate' | 'reconcile' | 'export' | 'scenario' | null>(null);
  const [error, setError] = useState('');
  const [errorIssues, setErrorIssues] = useState<Issue[]>([]);
  const [notice, setNotice] = useState('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioError, setScenarioError] = useState('');
  const [showScenarios, setShowScenarios] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const advancedRef = useRef<HTMLDetailsElement>(null);
  const validationSection = useRef<HTMLElement>(null);
  const errorBanner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = new AbortController();
    fetch('/examples/manifest.json', { signal: c.signal }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(data => setScenarios(data.scenarios || [])).catch(e => {
      if (e.name !== 'AbortError') setScenarioError('示例暂时无法载入，仍可上传自己的 CSV。');
    });
    return () => { c.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [step]);
  useEffect(() => { if (validation) validationSection.current?.scrollIntoView({ block: 'start' }); }, [validation]);
  useEffect(() => { if (error) errorBanner.current?.scrollIntoView({ block: 'start' }); }, [error]);

  function invalidate() {
    version.current += 1;
    controller.current?.abort();
    setBusy(null); setValidation(null); setResult(null); setError(''); setErrorIssues([]); setNotice('');
  }
  function updateRule(key: keyof Rules, value: string | boolean) {
    invalidate();
    setRules(old => ({ ...old, [key]: value }));
  }
  function updateFile(kind: 'holders' | 'payments', file: File) {
    invalidate();
    // Rejecting a replacement must also remove the previously accepted file.
    if (kind === 'holders') setHolders(null); else setPayments(null);
    if (file.size > 5 * 1024 * 1024) { setError('文件超过 5 MiB，请缩小文件后重新上传。'); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('请上传 .csv 格式的文件。'); return; }
    if (kind === 'holders') setHolders(file); else setPayments(file);
  }
  function proceedToImport() {
    if ([rules.project_id, rules.chain_id, rules.payment_token].some(value => !value.trim())) {
      if (advancedRef.current) advancedRef.current.open = true;
      setError('请展开项目编号、网络与付款资产，补全信息并与 CSV 核对。'); return;
    }
    if ([rules.project_name, rules.batch_id, rules.record_date, rules.payout_per_token].some(value => !value.trim())) {
      setError('请填写项目名称、分配批次、持仓记录日和每枚分配额。'); return;
    }
    try {
      const payload = requestRules(rules);
      const recordStart = new Date(`${rules.record_date}T00:00:00+08:00`);
      if (Number.isNaN(recordStart.getTime()) || new Date(payload.payment_due_at) < recordStart || new Date(payload.as_of) < recordStart) {
        setError('付款截止时间和核对时间不能早于持仓记录日。'); return;
      }
    } catch (e) { setError(e instanceof Error ? e.message : '请检查批次时间。'); return; }
    setError(''); setStep(1); setShowScenarios(false);
  }
  async function loadScenario(scenario: Scenario) {
    invalidate();
    const requestVersion = version.current;
    const c = new AbortController(); controller.current = c; setBusy('scenario');
    try {
      const responses = await Promise.all([fetch(scenario.holders_url, { signal: c.signal }), fetch(scenario.payments_url, { signal: c.signal })]);
      if (responses.some(response => !response.ok)) throw new Error('示例文件无法下载，请重试。');
      const [h, p] = await Promise.all(responses.map(response => response.blob()));
      if (version.current !== requestVersion) return;
      setHolders(new File([h], `${scenario.id}-holders.csv`, { type: 'text/csv' }));
      setPayments(new File([p], `${scenario.id}-payments.csv`, { type: 'text/csv' }));
      setRules({ ...scenario.rules, payment_due_at: localDate(scenario.rules.payment_due_at), as_of: localDate(scenario.rules.as_of) });
      setStep(1); setShowScenarios(false);
      setNotice(`已载入「${scenario.name}」，属于教学合成数据。请检查输入后开始核对。`);
    } catch (e) {
      if (version.current === requestVersion && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : '示例载入失败。');
    } finally { if (version.current === requestVersion) setBusy(null); }
  }
  async function run(action: 'validate' | 'reconcile' | 'export') {
    if (!holders || !payments) { setError('请先上传持有人名单和付款记录两份 CSV。'); setStep(1); return; }
    if ((action === 'reconcile' && !validation?.valid) || (action === 'export' && !result)) return;
    controller.current?.abort(); version.current += 1;
    const c = new AbortController(); controller.current = c;
    const requestVersion = version.current;
    setBusy(action); setError(''); setErrorIssues([]); setNotice('');
    try {
      const payload = requestRules(rules);
      if (action === 'validate') {
        const data = await api.validate(payload, holders, payments, c.signal);
        if (version.current !== requestVersion) return;
        setValidation(data); setStep(1);
      } else if (action === 'reconcile') {
        const data = await api.reconcile(payload, holders, payments, c.signal);
        if (version.current !== requestVersion) return;
        setResult(data); setStep(2); setShowScenarios(false);
      } else {
        const blob = await api.exportReport(payload, holders, payments, c.signal);
        if (version.current !== requestVersion) return;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a'); anchor.href = url;
        anchor.download = `AF5640-gorup_${rules.batch_id.replace(/[^a-zA-Z0-9_-]/g, '_')}_report.zip`;
        anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('报告包已生成，已开始下载。');
      }
    } catch (e) {
      if (version.current === requestVersion && !(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : '操作未完成，请重试。');
        setErrorIssues(e instanceof api.ApiError ? e.issues : []);
        if (e instanceof api.ApiError && e.issues.length) setStep(1);
      }
    } finally { if (version.current === requestVersion) setBusy(null); }
  }
  const canRun = Boolean(holders && payments && !busy);
  const canReconcile = canRun && validation?.valid === true;
  const scenarioOrder = [...scenarios].sort((a, b) => Number(b.id === 'comprehensive') - Number(a.id === 'comprehensive'));

  return <div className="app-shell">
    <a className="skip-link" href="#main-content">跳到主要内容</a>
    <header className="app-header"><div className="header-inner"><div className="brand"><span className="brand-mark"><CheckCheck size={25}/></span><div><strong>DistributionCheck</strong><span>收益分配核对</span></div></div>
      <button className="button button-secondary" onClick={() => setShowScenarios(!showScenarios)} aria-expanded={showScenarios} aria-controls="scenario-picker"><Play size={17}/>{showScenarios ? '收起示例' : '试用合成示例'}</button>
    </div></header>
    <nav className="process-nav" aria-label="核对步骤"><ol>{STEPS.map((title, index) => <li key={title}><button aria-current={step === index ? 'step' : undefined} disabled={index === 2 && !result} onClick={() => setStep(index)}><span className="step-index">{index < step ? <Check size={17}/> : index + 1}</span><span>{title}</span></button></li>)}</ol><p>一次分配，逐人核对</p></nav>
    <main id="main-content">
      {showScenarios && <section className="scenario-panel" id="scenario-picker"><div className="section-line"><div><h2>用示例，先走完一次核对</h2><p>数据均为合成，包含已知差异，方便检查结果。</p></div><Badge tone="warning">教学数据</Badge></div>
        <div className="scenario-grid">{scenarioOrder.map(scenario => <button key={scenario.id} aria-label={`载入${scenario.name}`} className={`scenario-option ${scenario.id === 'comprehensive' ? 'featured-scenario' : ''}`} onClick={() => loadScenario(scenario)} disabled={Boolean(busy)}><strong>{scenario.name}</strong><p>{scenario.description}</p><span>载入示例<ArrowRight size={16}/></span></button>)}</div>
        {!scenarios.length && <p className="muted">{scenarioError || '正在读取示例…'}</p>}
      </section>}
      {error && <div ref={errorBanner} className="alert alert-error" role="alert"><AlertTriangle size={21}/><div><strong>操作未完成</strong><p>{error}</p></div><button className="icon-button" onClick={() => setError('')} aria-label="关闭错误提示"><X size={19}/></button></div>}
      {notice && <div className="alert alert-notice" role="status"><CheckCircle2 size={21}/><p>{notice}</p><button className="icon-button" onClick={() => setNotice('')} aria-label="关闭提示"><X size={19}/></button></div>}
      {busy === 'scenario' && <div className="alert alert-notice" role="status"><LoaderCircle size={21} className="spin"/>正在载入示例文件…</div>}
      <Issues issues={errorIssues}/>
      {step === 0 && <><div className="page-heading"><div><h1>把一次收益分配核对清楚</h1><p>确定分配规则，上传名单和付款记录，找出需要核实的差异。</p></div></div>
        <RulesForm rules={rules} onChange={updateRule} onContinue={proceedToImport} advancedRef={advancedRef}/>
      </>}
      {step === 1 && <>
        <div className="page-heading"><div><h1>导入名单和付款记录</h1><p>先检查两份文件，确认批次、钱包和金额口径一致。</p></div><button className="button button-secondary" onClick={() => setStep(0)}>修改分配设置</button></div>
        <div className="input-context"><div><strong>{rules.project_name}</strong><span>批次 {rules.batch_id} · 持仓记录日 {rules.record_date}</span></div><Badge tone={rules.synthetic ? 'warning' : 'neutral'}>{rules.synthetic ? '教学合成数据' : '用户上传数据'}</Badge></div>
        <div className="upload-grid"><UploadBox kind="holders" file={holders} onChange={file => updateFile('holders', file)}/><UploadBox kind="payments" file={payments} onChange={file => updateFile('payments', file)}/></div>
        {validation ? <section ref={validationSection} className="panel validation-panel" aria-label="输入检查结果">
          <div className="panel-heading"><div className="section-line">{validation.valid ? <CheckCircle2 className="success-text" size={25}/> : <AlertTriangle className="danger-text" size={25}/>}<h2>{validation.valid ? '输入检查通过，可以开始核对' : '请先更正输入问题'}</h2></div><Badge tone={validation.valid ? 'success' : 'danger'}>{validation.valid ? '格式与口径已检查' : '暂不能核对'}</Badge></div>
          <div className="validation-body"><Issues issues={validation.issues}/>
            {validation.valid && <p className="validation-summary">已读取 {validation.preview.holders.row_count} 位持有人、{validation.preview.payments.row_count} 行付款。检查通过代表输入可供计算，结果中的差异仍需人工核实。</p>}
            {validation.warnings.length > 0 && <details className="disclosure validation-warnings"><summary>输入中有需要留意的情况<span>{validation.warnings.length} 项提示，核对时会保留</span></summary><Issues issues={validation.warnings} warning/></details>}
            {validation.preview?.holders && <DataPreview data={validation.preview.holders} title="持有人名单预览"/>}
            {validation.preview?.payments && <DataPreview data={validation.preview.payments} title="付款记录预览"/>}
          </div>
        </section> : <div className="info-strip"><Info size={20}/><p>上传后点击“检查输入”。缺少字段、错误快照、钱包歧义等问题会阻止核对；待确认、未知钱包和重复导入会保留说明。</p></div>}
        <div className="bottom-actions"><button className="button button-ghost" onClick={() => setStep(0)}><ArrowLeft size={17}/>返回分配设置</button><div className="button-group">
          <button className="button button-secondary" disabled={!canRun} onClick={() => run('validate')}>{busy === 'validate' ? <LoaderCircle size={18} className="spin"/> : <FileCheck2 size={18}/>}检查输入</button>
          <button className="button button-primary" disabled={!canReconcile} title={!validation?.valid ? '请先检查输入并解决阻断问题' : undefined} onClick={() => run('reconcile')}>{busy === 'reconcile' ? <LoaderCircle size={18} className="spin"/> : <CheckCheck size={18}/>}开始核对<ArrowRight size={17}/></button>
        </div></div>
      </>}
      {step === 2 && result && <ResultsView key={`${result.metadata.input_fingerprints.rules}-${result.metadata.input_fingerprints.holders}-${result.metadata.input_fingerprints.payments}`} result={result} holdersName={holders?.name || 'holders.csv'} paymentsName={payments?.name || 'payments.csv'} busy={Boolean(busy)} onExport={() => run('export')} onEdit={() => setStep(0)}/>}
      <footer className="workspace-footer"><span>AF5640-gorup · DistributionCheck</span><span>当前输入仅保留在页面会话中，刷新后需重新上传。</span></footer>
    </main>
  </div>;
}
