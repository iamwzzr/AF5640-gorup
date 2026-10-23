import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, Building2, Check, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, FileCheck2, FileSpreadsheet, Flag, Maximize2, Minimize2, Presentation, Printer, Search, Users, Wallet } from 'lucide-react';
import { amount, CODE_LABELS, issueCopy } from '../presentation';
import type { Result } from '../types';
import evidence from './evidence.json';
import './project.css';

const CASES = evidence.cases as { core: Result; comprehensive: Result };
const CHAPTERS = [
  { id: 'overview', title: '项目概览', heading: '发完收益，每个人都收齐了吗？', subtitle: 'DistributionCheck 帮助小型发行团队，把规则、收款名单和付款记录逐人对起来。' },
  { id: 'audience', title: '谁会需要', heading: '小林要交出的，是一份说得清的结果', subtitle: '从小型债券发行团队的运营人员开始，看看一次季度付息后的复查工作。' },
  { id: 'problem', title: '问题在哪里', heading: '总数看起来够了，有人仍没收齐', subtitle: '小林先看发放总额，再逐人核对。这两步会得到不同的结论。' },
  { id: 'approach', title: '怎么查清', heading: '跟着一笔差额，查回原始记录', subtitle: '继续使用这组5人样本：从该收多少、已发多少，一路看到为什么提醒、该去哪里查。' },
  { id: 'evidence', title: '放到100人', heading: '同一套检查，放到100人的发放里', subtitle: '5人样本讲清方法；100人样本再检查少发、多发、付款待确认等情况。两组都是合成数据。' },
  { id: 'business', title: '现有办法与收费', heading: '小林为什么会多用一个工具？', subtitle: '先比较手工表格、已有发行平台和我们的原型，再验证独立复查是否值得付费。' },
  { id: 'next', title: '下一步验证', heading: '下一步，要测出它到底有没有用', subtitle: '先记录真实工作方式，再用同一组输入比较人工和工具。以下是待执行计划，还没有测量或付费结果。' },
] as const;
const HKMA_REPORT = 'https://www.hkma.gov.hk/media/eng/doc/key-information/press-release/2023/20230824e3a1.pdf';
const DATS_JUDGING = 'https://datsawards.org/#/judging';
const DATS_AWARDS = 'https://datsawards.org/#/awards';
const TOKENY_DEBT = 'https://tokeny.com/tokenized-debt/';
const TOKENY_PROCESS = 'https://tokeny.com/wp-content/uploads/2023/08/The-Complete-Tokenization-Process-Tokeny.pdf';
const ADDX = 'https://addx.co/en/';
const MDB = 'https://bm.hkust.edu.hk/news/2023/12/hkust-fintechstic-2023-concluded-resounding-success';

function chapterIndex(hash: string): number {
  const id = hash.replace(/^#\/project\/?/, '').split('/')[0];
  const index = CHAPTERS.findIndex(chapter => chapter.id === id);
  return index < 0 ? 0 : index;
}
function Reference({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="story-reference">{children}<ExternalLink size={13}/></a>;
}
function EvidenceLabel({ kind, children }: { kind: 'built' | 'public' | 'demo' | 'hypothesis'; children: ReactNode }) {
  return <span className={`evidence-label evidence-label-${kind}`}>{children}</span>;
}

export default function ProjectStory({ active, hash, presenting, onPresentingChange, onOpenTool }: {
  active: boolean; hash: string; presenting: boolean; onPresentingChange: (value: boolean) => void; onOpenTool: () => void;
}) {
  const index = chapterIndex(hash);
  const chapter = CHAPTERS[index];
  const sourceDetailsRef = useRef<HTMLDetailsElement>(null);
  const [revenue, setRevenue] = useState<'per-run' | 'subscription'>('per-run');
  const [coreHolderId, setCoreHolderId] = useState('B');
  const [issueId, setIssueId] = useState(() => CASES.comprehensive.anomalies.find(issue => issue.holder_id === 'H002')?.id || CASES.comprehensive.anomalies[0].id);
  const demo = CASES.comprehensive;
  const core = CASES.core;
  const coreHolder = core.holders.find(holder => holder.holder_id === coreHolderId)!;
  const coreIssue = core.anomalies.find(anomaly => anomaly.holder_id === coreHolderId)!;
  const coreText = issueCopy(coreIssue);
  const corePayments = core.payment_ledger.filter(row => row.holder_id === coreHolderId);
  const issue = demo.anomalies.find(item => item.id === issueId) || demo.anomalies[0];
  const selectedHolder = demo.holders.find(holder => holder.holder_id === issue.holder_id);
  const issueText = issueCopy(issue);
  const noPrompt = demo.holders.filter(holder => holder.issue_codes.length === 0).length;
  const unknownPayments = demo.anomalies.filter(item => item.code === 'UNMATCHED_WALLET').length;
  function goTo(next: number) {
    const bounded = Math.max(0, Math.min(CHAPTERS.length - 1, next));
    window.location.hash = `/project/${CHAPTERS[bounded].id}`;
  }
  useEffect(() => {
    if (!active) return;
    window.scrollTo(0, 0);
  }, [index, active]);
  useEffect(() => {
    if (!active) return;
    let wasOpen = false;
    const beforePrint = () => { if (sourceDetailsRef.current) { wasOpen = sourceDetailsRef.current.open; sourceDetailsRef.current.open = true; } };
    const afterPrint = () => { if (sourceDetailsRef.current) sourceDetailsRef.current.open = wasOpen; };
    window.addEventListener('beforeprint', beforePrint);
    window.addEventListener('afterprint', afterPrint);
    return () => { window.removeEventListener('beforeprint', beforePrint); window.removeEventListener('afterprint', afterPrint); };
  }, [active]);
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape' && presenting) { event.preventDefault(); onPresentingChange(false); return; }
      if (target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"],[data-local-keys]')) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); goTo(index + 1); }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goTo(index - 1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, index, presenting, onPresentingChange]);

  return <main id="project-content" tabIndex={-1} className="project-story" aria-label="DistributionCheck 创业项目介绍">
    <div className="story-toolbar"><div className="story-document-title"><Presentation size={20}/><span>创业项目说明</span><span className="story-draft">方案初稿</span></div><div className="story-tools">
      <button className="button button-secondary" onClick={() => onPresentingChange(!presenting)} aria-pressed={presenting}>{presenting ? <Minimize2 size={17}/> : <Maximize2 size={17}/>}<span>{presenting ? '退出演示' : '演示模式'}</span></button>
      <button className="button button-secondary" onClick={() => window.print()}><Printer size={17}/><span>打印 / 存为 PDF</span></button>
    </div></div>
    <div className="story-layout">
      <nav className="story-chapters" aria-label="介绍章节"><p>项目介绍</p>{CHAPTERS.map((item, i) => <a key={item.id} href={`#/project/${item.id}`} aria-current={i === index ? 'page' : undefined}><span>{String(i + 1).padStart(2, '0')}</span>{item.title}</a>)}
        <div className="story-legend"><span><i className="legend-built"/>已实现</span><span><i className="legend-demo"/>演示结果</span><span><i className="legend-hypothesis"/>待验证设想</span></div>
      </nav>
      <div className="story-content">
        <label className="story-mobile-chapters"><span>选择章节</span><select aria-label="选择介绍章节" value={chapter.id} onChange={event => goTo(CHAPTERS.findIndex(item => item.id === event.target.value))}>{CHAPTERS.map((item, i) => <option value={item.id} key={item.id}>{i + 1}. {item.title}</option>)}</select></label>
        {CHAPTERS.map((item, i) => <section className={`story-slide story-slide-${item.id}`} key={item.id} hidden={i !== index} aria-labelledby={`story-title-${item.id}`}>
          <header className="story-slide-heading"><div className="story-section-mark"><span>{String(i + 1).padStart(2, '0')}</span><p>{item.title}</p></div>
            <h1 id={`story-title-${item.id}`}>{item.heading}</h1><p>{item.subtitle}</p>
          </header>

          {item.id === 'overview' && <>
            <div className="story-cover-grid"><div className="story-cover-message"><p className="story-positioning">面向代币化基金与债券的收益发放核对工具</p>
              <h2>先查谁没收齐，<br/>再追到原始记录。</h2>
              <p>这次季度付息后，运营人员小林需要向负责人解释：谁少收了、为什么提醒，以及该回到哪里检查。</p>
              <div className="story-character-note"><span className="story-character-initial" aria-hidden="true">林</span><span>跟着小林完成一次复查<small>演示角色与情境，非真实客户案例</small></span></div>
              <div className="story-cover-proof"><EvidenceLabel kind="built">已有可操作原型</EvidenceLabel><EvidenceLabel kind="hypothesis">客户需求待验证</EvidenceLabel></div>
              <button className="button button-primary" onClick={onOpenTool}><CheckCheck size={18}/>打开核对工具</button>
            </div><div className="story-cover-visual" aria-label="规则、名单和付款记录，经核对后生成逐人结果及问题清单">
              <div className="story-input-docs"><div><FileSpreadsheet size={20}/><span>谁该收钱</span></div><div><Wallet size={20}/><span>实际付了多少</span></div><div><ClipboardList size={20}/><span>按什么规则发</span></div></div>
              <div className="story-check-line"><span/><CheckCheck size={23}/><span/></div>
              <div className="story-output-doc"><div><FileCheck2 size={24}/><strong>一次收益发放核对</strong></div><p><Check size={16}/>每个人该收与已付的钱</p><p><Search size={16}/>需要检查的问题与原因</p><p><ClipboardList size={16}/>可回查的原始记录</p><div className="story-output-stamp">结果可以解释，也可以保存</div></div>
            </div></div>
            <footer className="story-slide-note">本次故事：季度付息后的独立复查。当前按固定格式的表格核对，不自动查询实际交易或执行转账。</footer>
          </>}

          {item.id === 'audience' && <>
            <div className="story-role-grid"><article className="story-persona"><div className="story-persona-heading"><span className="story-character-initial" aria-hidden="true">林</span><div><EvidenceLabel kind="demo">演示角色</EvidenceLabel><h2>小林 · 发行团队运营</h2></div></div>
              <p>季度收益发放后，她拿到了付款记录。交出结果前，还要把每个人该收的钱与已确认付款对起来。</p>
              <dl><div><dt>她手里的信息</dt><dd>发放规则、收款名单、付款记录</dd></div><div><dt>她要交出的结果</dt><dd>逐人结果、待查问题、对应的原始记录</dd></div></dl>
            </article><div className="story-task-list"><h2>这次她要回答三个问题</h2><ol><li><strong>每个人都收齐了吗？</strong><p>总金额够了，也要查清每个人的金额。</p></li><li><strong>哪些付款还需要确认？</strong><p>还在等待、没有成功，和重复导入要分开看。</p></li><li><strong>负责人追问时，依据在哪？</strong><p>找到规则和原始表格中的对应行。</p></li></ol></div></div>
            <div className="story-user-buyer"><span><Users size={18}/><b>优先使用者</b>发行团队运营</span><span><Building2 size={18}/><b>可能采购者</b>业务负责人</span></div>
            <footer className="story-slide-note"><EvidenceLabel kind="hypothesis">目标客户尚未访谈验证</EvidenceLabel><span>优先了解小型发行团队；为基金处理日常事务的服务商、代币平台运营是相邻客户。先问他们是否已有足够好用的核对办法。</span></footer>
          </>}

          {item.id === 'problem' && <>
            <div className="story-problem-grid"><div className="story-problem-explanation"><EvidenceLabel kind="demo">5 人演示，不是真实客户数据</EvidenceLabel>
              <div className="story-total-comparison"><div><span>这次该发</span><strong>{amount(core.summary.expected_total)}</strong></div><div><span>表格里已发</span><strong>{amount(core.summary.confirmed_total)}</strong></div></div>
              <h2>付出的总数更多，<br/>B 和 C 仍然没收齐。</h2><p>小林发现：多发给 D 的钱，不能替 B 和 C 算作已收到。逐人检查后，仍有 <strong>{amount(core.summary.shortfall_total)} USDC</strong> 没发齐。</p><p className="story-story-next">下一页，选择一位收款人继续回查。</p>
            </div><div className="story-mini-ledger"><div className="story-mini-ledger-head"><span>收款人</span><span>该收</span><span>已发</span><span>检查结果</span></div>{core.holders.map(holder => <div className={holder.issue_codes.length ? 'has-problem' : ''} key={holder.holder_id}><strong>{holder.holder_id}</strong><span>{amount(holder.expected)}</span><span>{amount(holder.confirmed_paid)}</span><b>{holder.balance_status === 'short' ? '还没收齐' : holder.balance_status === 'over' ? '多发了' : '对得上'}</b></div>)}<p>单位：USDC。所有结果来自当前程序和原始示例文件。</p></div></div>
            <div className="story-public-fact"><EvidenceLabel kind="public">公开行业背景</EvidenceLabel><p>香港金管局 2023 年报告已将付息列为代币化债券的实际业务环节。它说明这个场景存在；我们的目标客户是否缺少核对工具、是否愿意付费，仍需访谈。</p><Reference href={HKMA_REPORT}>金管局《Bond Tokenisation in Hong Kong》，第 4、18 页</Reference></div>
          </>}

          {item.id === 'approach' && <>
            <div className="story-core-toolbar"><EvidenceLabel kind="demo">与上一页相同的5人样本</EvidenceLabel><div className="story-core-picker" role="group" aria-label="选择5人案例中的收款人" data-local-keys>{core.anomalies.map(anomaly => <button key={anomaly.id} aria-pressed={coreHolderId === anomaly.holder_id} onClick={() => setCoreHolderId(anomaly.holder_id!)}>收款人 {anomaly.holder_id}</button>)}</div></div>
            <div className="story-trace-grid"><div className="story-trace-sources"><h2>小林从这两处开始查</h2><article><FileSpreadsheet size={21}/><div><strong>收款名单 · 第 {coreHolder.source_row} 行</strong><p>{coreHolder.holder_id} 持有 {coreHolder.token_units} 个代币。规则是每个发 {amount(core.metadata.payout_per_token)} USDC。</p><Reference href="/examples/core/holders.csv">查看原始收款名单</Reference></div></article><article><Wallet size={21}/><div><strong>付款记录</strong>{corePayments.length ? corePayments.map(row => <p key={row.source_row}>第 {row.source_row} 行：{amount(row.amount)} USDC，表中标为已确认。</p>) : <p>表中没有找到这个收款地址的付款记录。还需核实是否漏传、未付或地址有误。</p>}<Reference href="/examples/core/payments.csv">查看原始付款记录</Reference></div></article></div>
              <div className="story-core-result" aria-live="polite"><span className="story-core-result-label">收款人 {coreHolder.holder_id} 的核对结果</span><dl><div><dt>这个人该收</dt><dd>{amount(coreHolder.expected)}</dd></div><div><dt>表中已确认</dt><dd>{amount(coreHolder.confirmed_paid)}</dd></div></dl><h2>{coreText.title}</h2><p>{coreText.detail}</p><div className="story-next-action"><strong>接下来怎么查</strong><p>{coreText.action}</p></div></div>
            </div>
            <div className="story-handoff"><FileCheck2 size={23}/><div><strong>把结果交给负责人，也带上依据</strong><p>报告保存逐人结果、问题、付款明细和规则，方便复查；付款处理仍由授权人员决定。</p></div></div>
            <footer className="story-slide-note"><EvidenceLabel kind="built">结果与行号来自当前程序</EvidenceLabel><span>单位：USDC。在工具中选择“5人简单示例”可复现。</span><Reference href="/project/core-review.png">查看 B 在工具中的实际画面</Reference></footer>
          </>}

          {item.id === 'evidence' && <>
            <div className="story-demo-summary"><EvidenceLabel kind="demo">程序生成的演示结果</EvidenceLabel><span>{demo.summary.holder_count} 位收款人</span><span>{demo.summary.payment_row_count} 行付款记录</span><span>{demo.summary.issue_count} 个待查问题</span></div>
            <div className="story-evidence-grid"><div className="story-people-chart"><div className="story-people-grid" aria-hidden="true">{demo.holders.map(holder => <span key={holder.holder_id} className={`${holder.issue_codes.length ? 'person-flagged' : ''} ${holder.holder_id === issue.holder_id ? 'person-selected' : ''}`}>{holder.issue_codes.length ? '!' : ''}</span>)}</div>
                <div className="story-people-legend"><span><i/> {noPrompt} 人未触发提示</span><span><i/> {demo.summary.affected_holder_count} 人需要检查</span></div><p>每一格代表名单中的一人。另有 {unknownPayments} 笔付款找不到名单内的收款人，不放进这 100 格。</p>
              </div><div className="story-example-detail"><label>选一个问题看看<select aria-label="选择演示中的问题" value={issue.id} onChange={event => setIssueId(event.target.value)}>{demo.anomalies.map(anomaly => <option key={anomaly.id} value={anomaly.id}>{anomaly.holder_id || '收款人不明'} · {CODE_LABELS[anomaly.code]}</option>)}</select></label>
                <h2>{issueText.title}</h2><p>{issueText.detail}</p>
                {selectedHolder ? <dl><div><dt>这个人该收</dt><dd>{amount(selectedHolder.expected)}</dd></div><div><dt>已确认付款</dt><dd>{amount(selectedHolder.confirmed_paid)}</dd></div><div><dt>还在等确认</dt><dd>{amount(selectedHolder.pending_amount)}</dd></div></dl> : <div className="story-unassigned">这笔 {amount(issue.amount)} USDC 没有算到任何人名下，也不会自动归给同样少收这个金额的人。</div>}
                <div className="story-next-action"><strong>接下来怎么查</strong><p>{issueText.action}</p></div>
              </div></div>
            <footer className="story-slide-note"><span>这是合成样本中的功能验证，不代表真实客户采用、节时比例或实际付款已经证实。单位：USDC。</span><div><Reference href="/examples/comprehensive/holders.csv">原始收款名单</Reference><Reference href="/examples/comprehensive/payments.csv">原始付款记录</Reference></div></footer>
          </>}

          {item.id === 'business' && <>
            <table className="story-compare-table"><caption>现有办法与我们要验证的价值</caption><thead><tr><th scope="col">办法</th><th scope="col">已经能做什么</th><th scope="col">还要向客户核实</th></tr></thead><tbody>
              <tr><th scope="row">手工表格</th><td data-label="已经能做什么">用公式、筛选和逐笔检查完成核对。</td><td data-label="还要向客户核实">整理、维护和回查各花多久？</td></tr>
              <tr><th scope="row">已有发行平台<br/><small>以 Tokeny 为例</small></th><td data-label="已经能做什么">公开资料已介绍收益发放及报告能力。</td><td data-label="还要向客户核实">团队是否已在使用？还有哪些复查需要？</td></tr>
              <tr><th scope="row">DistributionCheck<br/><small>当前原型</small></th><td data-label="已经能做什么">读取固定格式的表格，逐人比较，列出原因和原始行号。</td><td data-label="还要向客户核实">整理成模板是否方便？独立复查是否值得增加一步？</td></tr>
            </tbody></table>
            <div className="story-competition-source"><Reference href={TOKENY_DEBT}>Tokeny 收益发放说明</Reference><Reference href={TOKENY_PROCESS}>Tokeny 流程与报告说明</Reference></div>
            <div className="story-commercial-grid"><div className="story-buyer"><EvidenceLabel kind="hypothesis">定位与收费待验证</EvidenceLabel><h2>先验证一次复查<br/>值不值得付费。</h2><p>假设小林使用工具、业务负责人决定采购。需要查清谁有预算、为什么购买，以及现有办法已经解决了多少。</p></div><div className="story-revenue"><div className="story-revenue-options" role="group" aria-label="收费方式设想" data-local-keys><button aria-pressed={revenue === 'per-run'} onClick={() => setRevenue('per-run')}>按次使用</button><button aria-pressed={revenue === 'subscription'} onClick={() => setRevenue('subscription')}>项目订阅</button></div><h3>{revenue === 'per-run' ? '先从一次发放开始' : '服务持续发放的项目'}</h3><p>{revenue === 'per-run' ? '考虑按一次核对或一个批次提供服务。先测量整理、运行和复查的总耗时，再了解负责人是否愿意购买。' : '考虑按项目持续服务。历史记录、多人复查是否值得付费要先确认；这些能力目前尚未实现。'}</p><p className="story-price-status">尚未确定价格，没有付费订单或节时测量结果。</p></div></div>
          </>}

          {item.id === 'next' && <>
            <div className="story-validation-intro"><EvidenceLabel kind="hypothesis">访谈与实验尚未执行</EvidenceLabel><p>先访谈 3–5 个相关团队，记录现有工具、工作步骤和常见问题，再检验下面三件事。</p></div>
            <div className="story-measurements"><article><span>耗时</span><h2>完整做一遍，要多久？</h2><p>同一组输入，分别人工核对和使用工具。把整理格式、运行、查原因的时间都记下来。</p><strong>留下：逐步计时记录</strong></article><article><span>找对问题</span><h2>漏掉多少，多报多少？</h2><p>先给合成样本中的已知问题做清单，再逐条比对人工与工具的发现，保留没找到和多报的记录。</p><strong>留下：问题逐条对照表</strong></article><article><span>采购</span><h2>谁愿意为什么付费？</h2><p>向实际预算负责人了解使用频率、采购条件，以及愿意购买或拒绝的原因。</p><strong>留下：访谈与采购条件记录</strong></article></div>
            <div className="story-course-delivery"><Flag size={19}/><p><strong>课程提交：</strong>选定奖项类别，整理创业方案与研究依据，按报名表准备材料；实际提交后归档，再上传课程平台。</p></div>
            <details className="story-source-details" ref={sourceDetailsRef}><summary>查看参赛方向与资料依据</summary><div><p><strong>方向建议：</strong>初步考虑 Ecosystem Infrastructure &amp; Technology Awards。最终类别和材料以报名表及老师说明为准；本页面不表示已经报名。</p><p><strong>学生奖公开评审重点：</strong>研究质量 30%、行业相关性 25%、创新 25%、展示 20%。这是奖项公开标准，不是课程评分表。</p><div className="story-source-links"><Reference href={DATS_AWARDS}>DATS 奖项类别</Reference><Reference href={DATS_JUDGING}>DATS 学生奖评审说明</Reference><Reference href={HKMA_REPORT}>金管局行业资料，2023</Reference><Reference href={TOKENY_DEBT}>Tokeny 产品说明</Reference><Reference href={TOKENY_PROCESS}>Tokeny 流程 PDF</Reference><Reference href={ADDX}>ADDX 用户场景</Reference><Reference href={MDB}>MDB 学生冠军报道</Reference></div><p>展示参考了公开官网、产品说明与校方报道，未取得完整原始参赛 PPT。小林为演示角色；数字来自当前程序生成的合成样本。需求、付费意愿和节时效果均待验证。</p></div></details>
          </>}
        </section>)}
        <footer className="story-pagination"><button className="button button-secondary" disabled={index === 0} onClick={() => goTo(index - 1)}><ChevronLeft size={18}/>上一页</button><div><span role="status">{index + 1} / {CHAPTERS.length}</span><small>可用键盘左右键翻页</small></div><button className="button button-primary" disabled={index === CHAPTERS.length - 1} onClick={() => goTo(index + 1)}>下一页<ChevronRight size={18}/></button></footer>
        <button className="text-link story-return" onClick={onOpenTool}><ArrowLeft size={16}/>回到核对工具，当前输入会保留</button>
      </div>
    </div>
  </main>;
}
