import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowUp, ArrowUpRight, Check, CheckCheck, ChevronRight, ExternalLink, FileCheck2, FileSpreadsheet, Layers3, Printer, Search, Users } from 'lucide-react';
import { useI18n } from '../i18n';
import { assetUrl } from '../site';
import { amount, CODE_LABELS, issueCopy } from '../presentation';
import type { Holder, Result } from '../types';
import evidence from './evidence.json';
import './project.css';

const CASES = evidence.cases as { core: Result; comprehensive: Result };
const SECTIONS = ['overview', 'problem', 'approach', 'audience', 'evidence', 'business', 'next'] as const;
type Section = typeof SECTIONS[number];
const HKMA_REPORT = 'https://www.hkma.gov.hk/media/eng/doc/key-information/press-release/2023/20230824e3a1.pdf';

function routeSection(hash: string): Section {
  const id = hash.replace(/^#\/project\/?/, '').split('/')[0];
  return SECTIONS.find(section => section === id) || 'overview';
}
function Reference({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href.startsWith('/') ? assetUrl(href) : href} target="_blank" rel="noreferrer" className="product-reference">{children}<ExternalLink size={13} aria-hidden="true"/></a>;
}
function Illustration({ scene }: { scene: 'review' | 'handoff' }) {
  const { t } = useI18n();
  return <figure className={`product-illustration product-illustration-${scene}`}>
    <img src={assetUrl(scene === 'review' ? 'project/payout-review.webp' : 'project/report-handoff.webp')} width={1200} height={800} loading="lazy" decoding="async"
      alt={t(scene === 'review' ? '运营人员在电脑与三份记录之间逐人核对收益发放的场景插画' : '运营人员向负责人交付复查报告与原始依据的场景插画')}/>
    <figcaption>{t('场景插画，不是真实客户影像')}</figcaption>
  </figure>;
}
function ProductPreview({ selected, onSelect, onTrace }: { selected: Holder; onSelect: (id: string) => void; onTrace: () => void }) {
  const { t, language } = useI18n();
  const core = CASES.core;
  const issue = core.anomalies.find(item => item.holder_id === selected.holder_id)!;
  const copy = issueCopy(issue, language);
  return <figure className="product-preview">
    <div className="product-window" role="region" aria-label={t('交互预览：一次收益核对')}>
      <div className="window-titlebar"><span className="window-dots" aria-hidden="true"><i/><i/><i/></span><span>DistributionCheck</span><span className="preview-sample">{t('5人合成示例')}</span></div>
      <div className="preview-workspace">
        <div className="preview-overview"><div className="preview-heading"><div><p>{core.metadata.batch_id}</p><h2>{t('季度收益核对')}</h2></div><span className="preview-state"><span/>{t('核对已完成')}</span></div>
          <div className="preview-totals"><div><span>{t('这次该发')}</span><strong>{amount(core.summary.expected_total)}<small>USDC</small></strong></div><div><span>{t('表中已确认')}</span><strong>{amount(core.summary.confirmed_total)}<small>USDC</small></strong></div></div>
          <p className="preview-finding"><Search size={16} aria-hidden="true"/>{t('{0} 位收款人需要检查', { 0: core.summary.affected_holder_count })}</p>
          <table className="preview-table"><caption className="visually-hidden">{t('点击 B、C 或 D，查看各自的差额')}</caption><thead><tr><th scope="col">{t('收款人')}</th><th scope="col">{t('该收')}</th><th scope="col">{t('已发')}</th><th scope="col">{t('检查结果')}</th></tr></thead><tbody>{core.holders.map(holder => <tr key={holder.holder_id} className={selected.holder_id === holder.holder_id ? 'is-selected' : ''}>
            <th scope="row">{holder.issue_codes.length ? <button onClick={() => onSelect(holder.holder_id)} aria-pressed={selected.holder_id === holder.holder_id} aria-label={t('查看收款人 {0}', { 0: holder.holder_id })}>{holder.holder_id}</button> : <span className="preview-recipient">{holder.holder_id}</span>}</th>
            <td>{amount(holder.expected)}</td><td>{amount(holder.confirmed_paid)}</td><td><span className={holder.issue_codes.length ? 'preview-flag' : 'preview-match'}>{holder.balance_status === 'short' ? t('还没收齐') : holder.balance_status === 'over' ? t('多发了') : <><Check size={13} aria-hidden="true"/>{t('对得上')}</>}</span></td>
          </tr>)}</tbody></table>
        </div>
        <aside className="preview-detail" aria-live="polite"><span className="preview-avatar">{selected.holder_id}</span><p>{t('收款人 {0}', { 0: selected.holder_id })}</p><h3>{copy.title}</h3><dl><div><dt>{t('这个人该收')}</dt><dd>{amount(selected.expected)}</dd></div><div><dt>{t('表中已确认')}</dt><dd>{amount(selected.confirmed_paid)}</dd></div></dl><p className="preview-detail-copy">{t('每一条提醒，都能继续查到名单与付款记录。')}</p><button className="product-text-button" onClick={onTrace}>{t('查看对应依据')}<ChevronRight size={16} aria-hidden="true"/></button><small>{t('单位：USDC · 合成数据')}</small></aside>
      </div>
    </div>
    <figcaption>{t('交互预览，使用当前程序生成的示例结果。点击 B、C 或 D 试试看。')}</figcaption>
  </figure>;
}

export default function ProjectStory({ active, hash, onOpenTool }: { active: boolean; hash: string; onOpenTool: () => void }) {
  const { t, language } = useI18n();
  const [coreHolderId, setCoreHolderId] = useState('B');
  const [issueId, setIssueId] = useState(() => CASES.comprehensive.anomalies.find(item => item.holder_id === 'H002')?.id || CASES.comprehensive.anomalies[0].id);
  const [revenue, setRevenue] = useState<'per-run' | 'subscription'>('per-run');
  const [visibleSection, setVisibleSection] = useState<Section>(routeSection(hash));
  const mainRef = useRef<HTMLElement>(null);
  const position = useRef({ hash: '', y: 0, visited: false });
  const core = CASES.core;
  const demo = CASES.comprehensive;
  const coreHolder = core.holders.find(holder => holder.holder_id === coreHolderId)!;
  const coreIssue = core.anomalies.find(item => item.holder_id === coreHolderId)!;
  const coreText = issueCopy(coreIssue, language);
  const corePayments = core.payment_ledger.filter(row => row.holder_id === coreHolderId);
  const issue = demo.anomalies.find(item => item.id === issueId) || demo.anomalies[0];
  const selectedHolder = demo.holders.find(holder => holder.holder_id === issue.holder_id);
  const issueText = issueCopy(issue, language);
  const noPrompt = demo.holders.filter(holder => holder.issue_codes.length === 0).length;
  const unknownPayments = demo.anomalies.filter(item => item.code === 'UNMATCHED_WALLET').length;
  const screenshot = assetUrl(language === 'zh' ? 'project/core-review.png' : 'project/core-review-en.png');
  function goTo(section: Section) {
    if (routeSection(window.location.hash) === section) document.getElementById(`project-${section}`)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    else window.location.hash = `/project/${section}`;
  }
  useEffect(() => {
    if (!active) return;
    const saved = position.current;
    const section = routeSection(hash);
    const rememberPosition = () => { position.current = { hash, y: window.scrollY, visited: true }; };
    const frame = window.requestAnimationFrame(() => {
      if (saved.visited && saved.hash === hash) window.scrollTo(0, saved.y);
      else document.getElementById(`project-${section}`)?.scrollIntoView({ block: 'start' });
      setVisibleSection(section);
    });
    window.addEventListener('scroll', rememberPosition, { passive: true });
    window.addEventListener('hashchange', rememberPosition);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('scroll', rememberPosition); window.removeEventListener('hashchange', rememberPosition); };
  }, [active, hash]);
  useEffect(() => {
    if (!active) return;
    const observer = new IntersectionObserver(entries => {
      const entry = entries.find(item => item.isIntersecting);
      if (entry) setVisibleSection(entry.target.id.replace('project-', '') as Section);
    }, { rootMargin: '-150px 0px -55% 0px', threshold: 0 });
    mainRef.current?.querySelectorAll('[data-product-section]').forEach(section => observer.observe(section));
    return () => observer.disconnect();
  }, [active]);
  useEffect(() => {
    if (!active) return;
    let states: { element: HTMLDetailsElement; open: boolean }[] = [];
    const beforePrint = () => {
      states = Array.from(mainRef.current?.querySelectorAll<HTMLDetailsElement>('.product-project-details details') || []).map(element => ({ element, open: element.open }));
      states.forEach(({ element }) => { element.open = true; });
    };
    const afterPrint = () => { states.forEach(({ element, open }) => { element.open = open; }); };
    window.addEventListener('beforeprint', beforePrint); window.addEventListener('afterprint', afterPrint);
    return () => { window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', afterPrint); };
  }, [active]);

  return <main id="project-content" ref={mainRef} tabIndex={-1} className="product-story" aria-label={t('DistributionCheck 产品介绍')}>
    <nav className="product-section-nav" aria-label={t('产品介绍导航')}><div className="product-inner"><span>{t('收益发放核对工具')}</span><div>{([
      ['overview', '产品概览'], ['approach', '怎么使用'], ['audience', '谁会需要'], ['next', '了解更多'],
    ] as const).map(([id, label]) => <a key={id} href={`#/project/${id}`} onClick={event => { event.preventDefault(); goTo(id); }} aria-current={visibleSection === id ? 'location' : undefined}>{t(label)}</a>)}</div></div></nav>
    <section id="project-overview" className="product-hero" data-product-section aria-labelledby="product-title"><div className="product-inner">
      <div className="product-hero-copy"><p className="product-name">DistributionCheck</p><h1 id="product-title">{t('每一笔收益，')}<br/>{t('都对得明白。')}</h1><p className="product-hero-description">{t('为代币化基金与债券，做好每次发放后的核对。')}{' '}<br className="desktop-break"/>{t('把规则、名单和付款记录放在一起，查清谁少收、哪里要复查。')}</p><div className="product-actions"><button className="product-primary-button" onClick={onOpenTool}>{t('打开核对工具')}</button><a href="#/project/approach" className="product-text-button" onClick={event => { event.preventDefault(); goTo('approach'); }}>{t('看看如何核对')}<ChevronRight size={19} aria-hidden="true"/></a></div><p className="product-prototype-note">{t('可操作原型，以下示例均为合成数据。')}</p></div>
      <ProductPreview selected={coreHolder} onSelect={setCoreHolderId} onTrace={() => goTo('approach')}/>
      <div className="product-capabilities">{([
        [FileSpreadsheet, '算清每人该收多少', '按发放规则和当期名单计算。'],
        [Search, '查出需要复查的地方', '少发、多发和待确认，分别说明。'],
        [FileCheck2, '把结果和依据一起留下', '查回原始行，下载报告交接。'],
      ] as const).map(([Icon, title, copy]) => <article key={title}><Icon size={26} strokeWidth={1.5} aria-hidden="true"/><h2>{t(title)}</h2><p>{t(copy)}</p></article>)}</div>
    </div></section>
    <section id="project-problem" className="product-problem product-section" data-product-section aria-labelledby="problem-title"><div className="product-inner">
      <div className="product-section-heading"><h2 id="problem-title">{t('总额看起来够了，')}<br/>{t('有人却还没收齐。')}</h2><p>{t('多发给一个人的钱，不能算作另一个人已经收到。核对需要落到每个人。')}</p></div>
      <div className="product-total-story"><div><span>{t('这次该发')}</span><strong>{amount(core.summary.expected_total)}</strong><small>USDC</small></div><div><span>{t('表中已确认')}</span><strong>{amount(core.summary.confirmed_total)}</strong><small>USDC</small></div><p>{t('总额多了，B 和 C 仍合计少收 {0} USDC。', { 0: amount(core.summary.shortfall_total) })}</p></div>
      <div className="product-person-comparison">{core.holders.filter(holder => holder.issue_codes.length > 0).map(holder => <button key={holder.holder_id} onClick={() => { setCoreHolderId(holder.holder_id); goTo('approach'); }} aria-label={t('查看收款人 {0} 的依据', { 0: holder.holder_id })}><span className="comparison-avatar">{holder.holder_id}</span><span><strong>{t('收款人 {0}', { 0: holder.holder_id })}</strong><small>{t('该收 {0}，已确认 {1}', { 0: amount(holder.expected), 1: amount(holder.confirmed_paid) })}</small></span><ChevronRight size={19} aria-hidden="true"/></button>)}</div><p className="product-dark-note">{t('同一组5人合成示例 · 单位 USDC')}</p>
    </div></section>
    <section id="project-approach" className="product-section product-how" data-product-section aria-labelledby="approach-title"><div className="product-inner">
      <div className="product-section-heading"><h2 id="approach-title">{t('从一笔差额，')}<br/>{t('查到每一行依据。')}</h2><p>{t('选择一位收款人，看看结果如何从规则、名单和付款记录中得出。')}</p></div>
      <div className="product-inspector"><div className="product-inspector-toolbar"><span>{t('5人合成示例')}</span><div className="product-segmented" role="group" aria-label={t('选择5人案例中的收款人')}>{core.anomalies.map(anomaly => <button key={anomaly.id} aria-pressed={coreHolderId === anomaly.holder_id} onClick={() => setCoreHolderId(anomaly.holder_id!)}>{t('收款人 {0}', { 0: anomaly.holder_id! })}</button>)}</div></div>
        <div className="product-trace" aria-live="polite"><ol className="product-trace-steps"><li><span className="trace-step-number">1</span><div><h3>{t('先算该收多少')}</h3><p>{t('{0} 个代币 × 每个 {1} USDC', { 0: coreHolder.token_units, 1: amount(core.metadata.payout_per_token) })}</p><Reference href="/examples/core/holders.csv">{t('收款名单 · 第 {0} 行', { 0: coreHolder.source_row })}</Reference></div></li><li><span className="trace-step-number">2</span><div><h3>{t('再看已确认的付款')}</h3>{corePayments.length ? corePayments.map(row => <p key={row.source_row}>{t('第 {0} 行：{1} USDC，表中标为已确认。', { 0: row.source_row, 1: amount(row.amount) })}</p>) : <p>{t('表中没有找到这个收款地址的付款记录。还需核实是否漏传、未付或地址有误。')}</p>}<Reference href="/examples/core/payments.csv">{t('查看原始付款记录')}</Reference></div></li><li><span className="trace-step-number">3</span><div><h3>{t('给出下一步检查方向')}</h3><p>{coreText.action}</p></div></li></ol>
          <div className="product-trace-result"><span className="trace-result-caption">{t('收款人 {0}', { 0: coreHolder.holder_id })}</span><h3>{coreText.title}</h3><dl><div><dt>{t('这个人该收')}</dt><dd>{amount(coreHolder.expected)}</dd></div><div><dt>{t('表中已确认')}</dt><dd>{amount(coreHolder.confirmed_paid)}</dd></div></dl><p>{coreText.detail}</p><span className="trace-result-unit">{t('单位：USDC · 合成数据')}</span></div>
        </div>
      </div>
      <div className="product-tool-feature"><div><FileCheck2 size={32} strokeWidth={1.5} aria-hidden="true"/><h3>{t('交出结果，')}<br/>{t('也交出依据。')}</h3><p>{t('工具里可以展开原始记录，报告里可以保留逐人结果、问题与付款明细。负责人追问时，沿着同一条线回查。')}</p><a className="product-text-button" href={screenshot} target="_blank" rel="noreferrer">{t('查看完整工具截图')}<ArrowUpRight size={18} aria-hidden="true"/></a></div><figure className="product-tool-image"><a href={screenshot} target="_blank" rel="noreferrer"><img src={screenshot} width={1280} height={1500} loading="lazy" alt={t('实际工具中 B 的金额、提示与原始记录')}/></a><figcaption>{t('实际工具截图：B 的复查记录，使用5人合成示例。')}</figcaption></figure></div>
    </div></section>
    <section id="project-audience" className="product-section product-audience" data-product-section aria-labelledby="audience-title"><div className="product-inner product-audience-layout"><Illustration scene="review"/><div><div className="product-section-heading"><h2 id="audience-title">{t('给每次发放后，')}<br/>{t('还要再确认一遍的人。')}</h2><p>{t('从小型发行团队的运营人员开始，把一轮发放后的复查与交接做清楚。')}</p></div><ul className="product-audience-list"><li><Users size={23} strokeWidth={1.5} aria-hidden="true"/><div><h3>{t('发行团队运营')}</h3><p>{t('核对这次收益是否按名单发齐。')}</p></div></li><li><Layers3 size={23} strokeWidth={1.5} aria-hidden="true"/><div><h3>{t('基金日常运营服务商')}</h3><p>{t('整理客户项目的发放结果和待查事项。')}</p></div></li><li><CheckCheck size={23} strokeWidth={1.5} aria-hidden="true"/><div><h3>{t('代币平台运营团队')}</h3><p>{t('在已有发放流程之后，多做一次独立复查。')}</p></div></li></ul><p className="product-caption">{t('以上为目标用户设想。')}</p></div></div></section>
    <section id="project-evidence" className="product-section product-evidence" data-product-section aria-labelledby="evidence-title"><div className="product-inner"><div className="product-section-heading"><h2 id="evidence-title">{t('100人的发放，')}<br/>{t('也能逐个看清。')}</h2><p>{t('用更完整的合成样本，检查少发、多发、付款待确认和重复导入等情况。')}</p></div>
      <div className="product-evidence-layout"><div className="product-people-chart"><div className="product-people-grid" aria-hidden="true">{demo.holders.map(holder => <span key={holder.holder_id} className={`${holder.issue_codes.length ? 'person-flagged' : ''} ${holder.holder_id === issue.holder_id ? 'person-selected' : ''}`}>{holder.issue_codes.length ? '!' : ''}</span>)}</div><div className="product-people-legend"><span><i/>{t('{0} 人未触发提示', { 0: noPrompt })}</span><span><i/>{t('{0} 人需要检查', { 0: demo.summary.affected_holder_count })}</span></div><p>{t('每格代表名单中的一人。另外 {0} 笔付款找不到名单内的收款人，不放进这100格。', { 0: unknownPayments })}</p></div>
        <div className="product-evidence-detail"><label htmlFor="product-issue-picker">{t('选择一个问题，查看解释')}</label><select id="product-issue-picker" value={issue.id} onChange={event => setIssueId(event.target.value)}>{demo.anomalies.map(anomaly => <option key={anomaly.id} value={anomaly.id}>{anomaly.holder_id ? `${anomaly.holder_id} · ` : ''}{t(CODE_LABELS[anomaly.code])}</option>)}</select><div className="product-issue-copy" aria-live="polite"><h3>{issueText.title}</h3><p>{issueText.detail}</p>{selectedHolder ? <dl><div><dt>{t('这个人该收')}</dt><dd>{amount(selectedHolder.expected)}</dd></div><div><dt>{t('已确认付款')}</dt><dd>{amount(selectedHolder.confirmed_paid)}</dd></div><div><dt>{t('还在等确认')}</dt><dd>{amount(selectedHolder.pending_amount)}</dd></div></dl> : <p className="product-unassigned">{t('这笔 {0} USDC 没有算到任何人名下，也不会自动归给同样少收这个金额的人。', { 0: amount(issue.amount) })}</p>}<div className="product-next-action"><strong>{t('接下来怎么查')}</strong><p>{issueText.action}</p></div></div></div>
      </div><div className="product-evidence-footnote"><p>{t('100位收款人、102行付款记录、10个待查问题。结果来自当前程序，不代表真实客户使用效果。')}</p><div><Reference href="/examples/comprehensive/holders.csv">{t('原始收款名单')}</Reference><Reference href="/examples/comprehensive/payments.csv">{t('原始付款记录')}</Reference></div></div>
    </div></section>
    <section id="project-business" className="product-section product-business" data-product-section aria-labelledby="business-title"><div className="product-inner product-business-layout"><div className="product-section-heading"><h2 id="business-title">{t('一次复查，')}<br/>{t('一份能接着用的结果。')}</h2><p>{t('把逐人结果、待查问题和原始依据整理好，让后续处理有据可循。')}</p><ul className="product-deliverables"><li><Check size={18} aria-hidden="true"/>{t('每个人该收与已确认的金额')}</li><li><Check size={18} aria-hidden="true"/>{t('需要检查的原因和对应行号')}</li><li><Check size={18} aria-hidden="true"/>{t('可下载的完整报告包')}</li></ul><button className="product-text-button" onClick={onOpenTool}>{t('在工具中试一次')}<ChevronRight size={18} aria-hidden="true"/></button></div><Illustration scene="handoff"/></div></section>
    <section id="project-next" className="product-section product-next" data-product-section aria-labelledby="next-title"><div className="product-inner"><div className="product-section-heading"><h2 id="next-title">{t('关于这个工具')}</h2><p>{t('了解当前功能、商业设想和项目依据。')}</p></div>
      <div className="product-project-details">
        <details><summary>{t('已有表格和平台，为什么还要做它？')}<span aria-hidden="true">+</span></summary><div><p>{t('手工表格可以用公式和筛选完成核对；Tokeny 等已有平台也提供收益发放和报告能力。DistributionCheck 将一次发放的逐人差额、问题原因和原始行号集中展示，方便独立复查。')}</p><Reference href="https://tokeny.com/tokenized-debt/">{t('Tokeny 收益发放说明')}</Reference><Reference href="https://tokeny.com/wp-content/uploads/2023/08/The-Complete-Tokenization-Process-Tokeny.pdf">{t('Tokeny 流程与报告说明')}</Reference></div></details>
        <details><summary>{t('准备怎样提供服务和收费？')}<span aria-hidden="true">+</span></summary><div><p>{t('设想由运营人员使用、业务负责人决定采购。以下是两种可考虑的收费方式。')}</p><div className="product-segmented" role="group" aria-label={t('收费方式设想')}><button aria-pressed={revenue === 'per-run'} onClick={() => setRevenue('per-run')}>{t('按次使用')}</button><button aria-pressed={revenue === 'subscription'} onClick={() => setRevenue('subscription')}>{t('项目订阅')}</button></div><h3>{revenue === 'per-run' ? t('先从一次发放开始') : t('服务持续发放的项目')}</h3><p>{revenue === 'per-run' ? t('按一次核对或一个发放批次提供服务。') : t('按项目或使用周期收费，适合需要定期核对的团队。当前版本暂不提供历史记录与多人协作。')}</p><p className="product-caption">{t('收费方式为商业设想，尚未定价。')}</p></div></details>
        <details><summary>{t('当前工具支持到哪一步？')}<span aria-hidden="true">+</span></summary><div><p>{t('当前处理一次发放：填写规则，导入固定格式的收款名单和付款记录，检查输入，再查看结果并下载报告。')}</p><p>{t('付款状态来自上传的表格。工具不自动查询链上交易、不执行转账；账号、历史记录和多人协作尚未实现。')}</p><p>{t('查看介绍或切换语言会保留本次输入，刷新页面后需要重新上传。')}</p></div></details>
        <details><summary>{t('项目依据与参赛方向')}<span aria-hidden="true">+</span></summary><div><p>{t('香港金管局2023年报告将付息列为代币化债券的业务环节，该资料用于说明项目的业务背景。')}</p><Reference href={HKMA_REPORT}>{t('金管局《Bond Tokenisation in Hong Kong》，第 4、18 页')}</Reference><p>{t('初步考虑 Ecosystem Infrastructure & Technology Awards。最终类别和材料以报名表及老师说明为准；本页面不表示已经报名。')}</p><p>{t('课程提交：选定类别、整理创业方案与研究依据，按报名表准备材料；实际提交后归档，再上传课程平台。')}</p><div className="product-source-links"><Reference href="https://datsawards.org/#/awards">{t('DATS 奖项类别')}</Reference><Reference href="https://datsawards.org/#/judging">{t('DATS 学生奖评审说明')}</Reference><Reference href="https://www.addx.co/en/">{t('ADDX 产品网站')}</Reference><Reference href="https://bm.hkust.edu.hk/news/2023/12/hkust-fintechstic-2023-concluded-resounding-success">{t('MDB 学生冠军报道')}</Reference></div><p className="product-caption">{t('设计参考公开产品网站，未取得完整原始参赛PPT。图片为场景插画，示例数字来自当前程序生成的合成样本。')}</p></div></details>
      </div>
      <div className="product-final-cta"><CheckCheck size={42} strokeWidth={1.5} aria-hidden="true"/><h2>{t('让下一次核对，')}<br/>{t('从清楚开始。')}</h2><p>{t('可以先用示例，走完一次完整核对。')}</p><button className="product-primary-button" onClick={onOpenTool}>{t('打开核对工具')}</button></div>
      <footer className="product-footer"><div><strong>DistributionCheck</strong><p>{t('面向代币化基金与债券的收益发放核对工具')}</p></div><button className="product-text-button" onClick={() => window.print()}><Printer size={16} aria-hidden="true"/>{t('打印 / 存为 PDF')}</button><a href="#/project/overview" className="product-back-top" onClick={event => { event.preventDefault(); goTo('overview'); }} aria-label={t('回到页面顶部')}><ArrowUp size={18} aria-hidden="true"/></a></footer>
    </div></section>
  </main>;
}
