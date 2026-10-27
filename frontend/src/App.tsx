import { localizeMessage } from './locale';
import { LanguageSwitch, useI18n } from "./i18n";
import { assetUrl, browserRuntime } from './site';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCheck, CheckCircle2, FileCheck2, Info, LoaderCircle, PanelsTopLeft, Play, X } from 'lucide-react';
import * as api from './api';
import { Badge, Issues } from './components/Common';
import { DataPreview, RulesForm, UploadBox } from './components/Inputs';
import { ResultsView } from './components/ResultsView';
import type { Issue, Result, Rules, Scenario, Validation } from './types';

const ProjectStory = lazy(() => import('./project/ProjectStory'));
const STEPS = ['填写规则', '上传表格', '查看结果'];
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
  const { t, language } = useI18n();
  const [surface, setSurface] = useState<'tool' | 'project'>(() => window.location.hash === '#/tool' ? 'tool' : 'project');
  const [routeHash, setRouteHash] = useState(() => window.location.hash);
  const [projectHref, setProjectHref] = useState(() => window.location.hash.startsWith('#/project') ? window.location.hash : '#/project/overview');
  const [projectVisited, setProjectVisited] = useState(() => window.location.hash !== '#/tool');
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
    fetch(assetUrl('examples/manifest.json'), { signal: c.signal }).then(response => {
      if (!response.ok) throw new Error();
      return response.json();
    }).then(data => setScenarios(data.scenarios || [])).catch(e => {
      if (e.name !== 'AbortError') setScenarioError(t("示例暂时无法载入，仍可上传自己的 CSV。"));
    });
    return () => { c.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    const navigate = () => {
      const hash = window.location.hash;
      if (hash === '#/tool') {
        setSurface('tool'); setRouteHash(hash);
      } else {
        setSurface('project'); setProjectVisited(true); setProjectHref(hash.startsWith('#/project') ? hash : '#/project/overview'); setRouteHash(hash);
      }
    };
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { document.title = surface === 'project' ? t("项目介绍 · DistributionCheck") : t("DistributionCheck · AF5640-gorup 收益分配核对"); }, [surface, t]);
  useEffect(() => { if (surface === 'tool') window.scrollTo(0, 0); }, [step, surface]);
  useEffect(() => { if (validation && surface === 'tool') validationSection.current?.scrollIntoView({ block: 'start' }); }, [validation, surface]);
  useEffect(() => { if (error && surface === 'tool') errorBanner.current?.scrollIntoView({ block: 'start' }); }, [error, surface]);

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
    if (file.size > 5 * 1024 * 1024) { setError(t("文件超过 5 MiB，请缩小文件后重新上传。")); return; }
    if (!file.name.toLowerCase().endsWith('.csv')) { setError(t("请上传 .csv 格式的文件。")); return; }
    if (kind === 'holders') setHolders(file); else setPayments(file);
  }
  function proceedToImport() {
    if ([rules.project_id, rules.chain_id, rules.payment_token].some(value => !value.trim())) {
      if (advancedRef.current) advancedRef.current.open = true;
      setError(t("请打开“更多设置”，补全项目编号和付款信息，并与表格核对。")); return;
    }
    if ([rules.project_name, rules.batch_id, rules.record_date, rules.payout_per_token].some(value => !value.trim())) {
      setError(t("请填写项目名称、本次发放编号、名单日期和每个代币发多少。")); return;
    }
    try {
      const payload = requestRules(rules);
      const recordStart = new Date(`${rules.record_date}T00:00:00+08:00`);
      if (Number.isNaN(recordStart.getTime()) || new Date(payload.payment_due_at) < recordStart || new Date(payload.as_of) < recordStart) {
        setError(t("最晚付款时间和检查截至时间，都不能早于名单日期。")); return;
      }
    } catch (e) { setError(e instanceof Error ? e.message : t("请检查填写的日期和时间。")); return; }
    setError(''); setStep(1); setShowScenarios(false);
  }
  async function loadScenario(scenario: Scenario) {
    invalidate();
    const requestVersion = version.current;
    const c = new AbortController(); controller.current = c; setBusy('scenario');
    try {
      const responses = await Promise.all([fetch(assetUrl(scenario.holders_url), { signal: c.signal }), fetch(assetUrl(scenario.payments_url), { signal: c.signal })]);
      if (responses.some(response => !response.ok)) throw new Error(t("示例文件无法下载，请重试。"));
      const [h, p] = await Promise.all(responses.map(response => response.blob()));
      if (version.current !== requestVersion) return;
      setHolders(new File([h], `${scenario.id}-holders.csv`, { type: 'text/csv' }));
      setPayments(new File([p], `${scenario.id}-payments.csv`, { type: 'text/csv' }));
      setRules({ ...scenario.rules, payment_due_at: localDate(scenario.rules.payment_due_at), as_of: localDate(scenario.rules.as_of) });
      setStep(1); setShowScenarios(false);
      setNotice(t("已载入「{0}」，表格仅用于演示。请检查表格后开始核对。", { "0": t(scenario.name) }));
    } catch (e) {
      if (version.current === requestVersion && !(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : t("示例载入失败。"));
    } finally { if (version.current === requestVersion) setBusy(null); }
  }
  async function run(action: 'validate' | 'reconcile' | 'export') {
    if (!holders || !payments) { setError(t("请先上传收款名单和付款记录两份表格。")); setStep(1); return; }
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
        setNotice(t("报告包已生成，已开始下载。"));
      }
    } catch (e) {
      if (version.current === requestVersion && !(e instanceof DOMException && e.name === 'AbortError')) {
        setError(e instanceof Error ? e.message : t("操作未完成，请重试。"));
        setErrorIssues(e instanceof api.ApiError ? e.issues : []);
        if (e instanceof api.ApiError && e.issues.length) setStep(1);
      }
    } finally { if (version.current === requestVersion) setBusy(null); }
  }
  const canRun = Boolean(holders && payments && !busy);
  const canReconcile = canRun && validation?.valid === true;
  const scenarioOrder = [...scenarios].sort((a, b) => Number(b.id === 'comprehensive') - Number(a.id === 'comprehensive'));

  return <div className={`app-shell ${surface === 'project' ? 'is-project' : 'is-tool'}`}>
    <a className="skip-link" href={surface === 'project' ? '#project-content' : '#main-content'} onClick={event => { event.preventDefault(); document.getElementById(surface === 'project' ? 'project-content' : 'main-content')?.focus(); }}>{t("跳到主要内容")}</a>
    <header className="app-header"><div className="header-inner"><a className="brand" href="#/project/overview" aria-label="DistributionCheck"><span className="brand-mark"><CheckCheck size={25}/></span><div><strong>DistributionCheck</strong></div></a>
      <nav className="global-nav" aria-label={t("网站页面")}><a href={projectHref} aria-current={surface === 'project' ? 'page' : undefined}><PanelsTopLeft size={18}/><span>{t("项目介绍")}</span></a><a href="#/tool" aria-current={surface === 'tool' ? 'page' : undefined}><CheckCheck size={18}/><span>{t("收益核对")}</span></a></nav>
      <div className="header-actions"><LanguageSwitch/></div>
    </div></header>
    <div className="workspace-container">
    <div className="surface tool-surface" hidden={surface !== 'tool'}>
    <nav className="process-nav" aria-label={t("核对步骤")}><ol>{STEPS.map((title, index) => <li key={title}><button aria-current={step === index ? 'step' : undefined} disabled={index === 2 && !result} onClick={() => setStep(index)}><span className="step-index">{index < step ? <Check size={17}/> : index + 1}</span><span>{t(title)}</span></button></li>)}</ol><div className="process-actions"><p>{t("一次发放，逐人检查")}</p><button className="scenario-toggle" onClick={() => setShowScenarios(!showScenarios)} aria-expanded={showScenarios} aria-controls="scenario-picker"><Play size={17}/>{showScenarios ? t("收起示例") : t("试用示例")}</button></div></nav>
    <main id="main-content" tabIndex={-1}>
      {browserRuntime && <div className="info-strip pages-runtime-note"><Info size={19}/><p>{t("本页在浏览器中核对表格，文件不会上传到服务器。首次使用会加载核对功能，请稍等片刻。")}</p></div>}
      {showScenarios && <section className="scenario-panel" id="scenario-picker"><div className="section-line"><div><h2>{t("先用示例试一次")}</h2><p>{t("不用准备表格，选一个例子就能开始。")}</p></div><Badge tone="warning">{t("演示用数据")}</Badge></div>
        <div className="scenario-grid">{scenarioOrder.map(scenario => <button key={scenario.id} aria-label={t("载入{0}", { "0": t(scenario.name) })} className={`scenario-option ${scenario.id === 'comprehensive' ? 'featured-scenario' : ''}`} onClick={() => loadScenario(scenario)} disabled={Boolean(busy)}><strong>{t(scenario.name)}</strong><p>{t(scenario.description)}</p><span>{t("载入示例")}<ArrowRight size={16}/></span></button>)}</div>
        {!scenarios.length && <p className="muted">{localizeMessage(scenarioError, language) || t("正在读取示例…")}</p>}
      </section>}
      {error && <div ref={errorBanner} className="alert alert-error" role="alert"><AlertTriangle size={21}/><div><strong>{t("操作未完成")}</strong><p>{localizeMessage(error, language)}</p></div><button className="icon-button" onClick={() => setError('')} aria-label={t("关闭错误提示")}><X size={19}/></button></div>}
      {notice && <div className="alert alert-notice" role="status"><CheckCircle2 size={21}/><p>{localizeMessage(notice, language)}</p><button className="icon-button" onClick={() => setNotice('')} aria-label={t("关闭提示")}><X size={19}/></button></div>}
      {busy === 'scenario' && <div className="alert alert-notice" role="status"><LoaderCircle size={21} className="spin"/>{t("正在载入示例文件…")}</div>}
      <Issues issues={errorIssues}/>
      {step === 0 && <><div className="page-heading"><div><h1>{t("核对这次收益有没有发对")}</h1><p>{t("看看谁该收多少、已经发了多少、哪里需要再检查。")}</p></div></div>
        <RulesForm rules={rules} onChange={updateRule} onContinue={proceedToImport} advancedRef={advancedRef}/>
      </>}
      {step === 1 && <>
        <div className="page-heading"><div><h1>{t("上传两份表格")}</h1><p>{t("一份是收款名单，一份是付款记录。没有现成表格可以先下载模板。")}</p></div><button className="button button-secondary" onClick={() => setStep(0)}>{t("修改发放规则")}</button></div>
        <div className="input-context"><div><strong>{rules.synthetic ? t(rules.project_name) : rules.project_name}</strong><span>{t("本次编号 ")}{rules.batch_id}{t("· 按 ")}{rules.record_date}{t("的名单计算")}</span></div><Badge tone={rules.synthetic ? 'warning' : 'neutral'}>{rules.synthetic ? t("演示用数据") : t("你上传的数据")}</Badge></div>
        <div className="upload-grid"><UploadBox kind="holders" file={holders} onChange={file => updateFile('holders', file)}/><UploadBox kind="payments" file={payments} onChange={file => updateFile('payments', file)}/></div>
        {validation ? <section ref={validationSection} className="panel validation-panel" aria-label={t("输入检查结果")}>
          <div className="panel-heading"><div className="section-line">{validation.valid ? <CheckCircle2 className="success-text" size={25}/> : <AlertTriangle className="danger-text" size={25}/>}<h2>{validation.valid ? t("表格已检查，可以开始核对") : t("请先改好表格里的问题")}</h2></div><Badge tone={validation.valid ? 'success' : 'danger'}>{validation.valid ? t("表格可以使用") : t("改好后再试")}</Badge></div>
          <div className="validation-body"><Issues issues={validation.issues}/>
            {validation.valid && <p className="validation-summary">{t("已读到 ")}{validation.preview.holders.row_count}{t("位收款人、")}{validation.preview.payments.row_count}{t("行付款记录。表格可以用来计算了，接下来看看有没有少发、多发或其他问题。")}</p>}
            {validation.warnings.length > 0 && <details className="disclosure validation-warnings"><summary>{t("这些地方也请留意")}<span>{validation.warnings.length}{t("项，结果里会说明")}</span></summary><Issues issues={validation.warnings} warning/></details>}
            {validation.preview?.holders && <DataPreview data={validation.preview.holders} title={t("看看收款名单")}/>}
            {validation.preview?.payments && <DataPreview data={validation.preview.payments} title={t("看看付款记录")}/>}
          </div>
        </section> : <div className="info-strip"><Info size={20}/><p>{t("两份表格都上传后，点击“检查表格”。如果缺少内容或填错了，页面会告诉你改哪里。")}</p></div>}
        <div className="bottom-actions"><button className="button button-ghost" onClick={() => setStep(0)}><ArrowLeft size={17}/>{t("返回填写规则")}</button><div className="button-group">
          <button className="button button-secondary" disabled={!canRun} onClick={() => run('validate')}>{busy === 'validate' ? <LoaderCircle size={18} className="spin"/> : <FileCheck2 size={18}/>}{t("检查表格")}</button>
          <button className="button button-primary" disabled={!canReconcile} title={!validation?.valid ? t("请先检查表格，并改好发现的问题") : undefined} onClick={() => run('reconcile')}>{busy === 'reconcile' ? <LoaderCircle size={18} className="spin"/> : <CheckCheck size={18}/>}{t("开始核对")}<ArrowRight size={17}/></button>
        </div></div>
      </>}
      {step === 2 && result && <ResultsView key={`${result.metadata.input_fingerprints.rules}-${result.metadata.input_fingerprints.holders}-${result.metadata.input_fingerprints.payments}`} result={result} holdersName={holders?.name || 'holders.csv'} paymentsName={payments?.name || 'payments.csv'} busy={Boolean(busy)} onExport={() => run('export')} onEdit={() => setStep(0)}/>}
      <footer className="workspace-footer"><span>AF5640-gorup · DistributionCheck</span><span>{t("刷新页面后，需要重新上传表格。")}</span></footer>
    </main>
    </div>
    {projectVisited && <div className="surface project-surface" hidden={surface !== 'project'}><Suspense fallback={<div className="story-loading" role="status"><LoaderCircle size={22} className="spin"/>{t("正在打开项目介绍…")}</div>}><ProjectStory active={surface === 'project'} hash={routeHash} onOpenTool={() => { window.location.hash = '/tool'; }}/></Suspense></div>}
    </div>
  </div>;
}
