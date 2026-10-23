import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, FileCheck2, FileSpreadsheet, Flag, Maximize2, Minimize2, Presentation, Printer, Search, Users, Wallet } from 'lucide-react';
import { amount, CODE_LABELS, issueCopy } from '../presentation';
import type { Result } from '../types';
import evidence from './evidence.json';
import './project.css';

const CASES = evidence.cases as { core: Result; comprehensive: Result };
const CHAPTERS = [
  { id: 'overview', title: '项目概览', heading: '每个人的钱，真的发对了吗？', subtitle: 'DistributionCheck 帮助收益发放团队，逐人核对该发多少、已经发了多少，以及哪里需要再检查。' },
  { id: 'audience', title: '谁会需要', heading: '先为负责发钱、查账的人服务', subtitle: '从代币化基金、债券的一次收益发放开始，寻找一个具体、可以验证的使用场景。' },
  { id: 'problem', title: '问题在哪里', heading: '总数看起来够了，有人仍没收齐', subtitle: '用一个可复现的例子，看清为什么只比较总金额还不够。' },
  { id: 'approach', title: '我们的方法', heading: '把三份信息，变成一份能解释的结果', subtitle: '使用者提供发放规则、收款名单和付款记录。工具算出差别，再指向原始表格。' },
  { id: 'evidence', title: '演示与证据', heading: '100 人的发放，问题落在哪一笔？', subtitle: '下面的数字由当前程序读取演示表格生成。可以选择一个问题，看看为什么被提醒。' },
  { id: 'business', title: '怎么做生意', heading: '让一次核对，成为值得付费的服务', subtitle: '先验证有人愿意用，再验证他们愿意为什么付费。以下是商业设想，尚未经过客户验证。' },
  { id: 'next', title: '下一步验证', heading: '用证据，把选题变成创业项目', subtitle: '现有原型支持展示解决办法；需求、差异和商业价值，还需要继续研究和验证。' },
] as const;
const HKMA_REPORT = 'https://www.hkma.gov.hk/media/eng/doc/key-information/press-release/2023/20230824e3a1.pdf';
const DATS_JUDGING = 'https://datsawards.org/#/judging';
const DATS_AWARDS = 'https://datsawards.org/#/awards';

function chapterIndex(hash: string): number {
  const id = hash.replace(/^#\/project\/?/, '').split('/')[0];
  const index = CHAPTERS.findIndex(chapter => chapter.id === id);
  return index < 0 ? 0 : index;
}
function Reference({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="story-reference">{children}<ExternalLink size={13}/></a>;
}
function EvidenceLabel({ kind, children }: { kind: 'built' | 'public' | 'demo' | 'hypothesis'; children: React.ReactNode }) {
  return <span className={`evidence-label evidence-label-${kind}`}>{children}</span>;
}

export default function ProjectStory({ active, hash, presenting, onPresentingChange, onOpenTool }: {
  active: boolean; hash: string; presenting: boolean; onPresentingChange: (value: boolean) => void; onOpenTool: () => void;
}) {
  const index = chapterIndex(hash);
  const chapter = CHAPTERS[index];
  const sourceDetailsRef = useRef<HTMLDetailsElement>(null);
  const [revenue, setRevenue] = useState<'per-run' | 'subscription'>('per-run');
  const [issueId, setIssueId] = useState(() => CASES.comprehensive.anomalies.find(issue => issue.holder_id === 'H002')?.id || CASES.comprehensive.anomalies[0].id);
  const demo = CASES.comprehensive;
  const core = CASES.core;
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
      if (event.altKey || event.ctrlKey || event.metaKey || target instanceof HTMLElement && target.closest('input,textarea,select,[contenteditable="true"],[data-local-keys]')) return;
      if (event.key === 'Escape' && presenting) { onPresentingChange(false); return; }
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
              <h2>把“发完了”，<br/>变成“逐人查清楚了”。</h2>
              <p>谁少收、谁多收、哪笔还在等确认，以及该回到哪一行检查，都放在同一个地方。</p>
              <div className="story-cover-proof"><EvidenceLabel kind="built">已有可操作原型</EvidenceLabel><EvidenceLabel kind="hypothesis">客户需求待验证</EvidenceLabel></div>
              <button className="button button-primary" onClick={onOpenTool}><CheckCheck size={18}/>打开核对工具</button>
            </div><div className="story-cover-visual" aria-label="规则、名单和付款记录，经核对后生成逐人结果及问题清单">
              <div className="story-input-docs"><div><FileSpreadsheet size={20}/><span>谁该收钱</span></div><div><Wallet size={20}/><span>实际付了多少</span></div><div><ClipboardList size={20}/><span>按什么规则发</span></div></div>
              <div className="story-check-line"><span/><CheckCheck size={23}/><span/></div>
              <div className="story-output-doc"><div><FileCheck2 size={24}/><strong>一次收益发放核对</strong></div><p><Check size={16}/>每个人该收与已付的钱</p><p><Search size={16}/>需要检查的问题与原因</p><p><ClipboardList size={16}/>可回查的原始记录</p><div className="story-output-stamp">结果可以解释，也可以保存</div></div>
            </div></div>
            <footer className="story-slide-note">当前范围：按上传表格核对一次发放，不自动查询实际交易或执行转账。</footer>
          </>}

          {item.id === 'audience' && <>
            <div className="story-audience-intro"><EvidenceLabel kind="hypothesis">目标客户设想，尚未访谈验证</EvidenceLabel><p>重点寻找会定期发放收益、手里已有名单和付款记录的团队。</p></div>
            <div className="story-audiences">
              <article><Building2 size={25}/><div><h2>基金或债券的发行团队</h2><p>一次发放结束后，确认每位收款人是否收齐。</p></div><span>可能使用者：运营人员<br/>可能购买者：项目负责人</span></article>
              <article><ClipboardList size={25}/><div><h2>为基金处理日常事务的服务商</h2><p>为客户整理发放记录，并给出可以回查的解释。</p></div><span>可能使用者：核对人员<br/>可能购买者：服务负责人</span></article>
              <article><Users size={25}/><div><h2>代币发行平台的运营团队</h2><p>把现有系统导出的表格，再做一次独立核对。</p></div><span>可能使用者：平台运营<br/>可能购买者：业务负责人</span></article>
            </div>
            <div className="story-question"><strong>第一轮访谈先问：</strong><p>你们上次发放如何核对？谁负责？哪里最费时？发现问题后，通常怎么回查？</p></div>
          </>}

          {item.id === 'problem' && <>
            <div className="story-problem-grid"><div className="story-problem-explanation"><EvidenceLabel kind="demo">5 人演示，不是真实客户数据</EvidenceLabel>
              <div className="story-total-comparison"><div><span>这次该发</span><strong>{amount(core.summary.expected_total)}</strong></div><div><span>表格里已发</span><strong>{amount(core.summary.confirmed_total)}</strong></div></div>
              <h2>付出的总数更多，<br/>B 和 C 仍然没收齐。</h2><p>多发给 D 的钱，不能替 B 和 C 算作已收到。逐人检查后，仍有 <strong>{amount(core.summary.shortfall_total)} USDC</strong> 没发齐。</p>
            </div><div className="story-mini-ledger"><div className="story-mini-ledger-head"><span>收款人</span><span>该收</span><span>已发</span><span>检查结果</span></div>{core.holders.map(holder => <div className={holder.issue_codes.length ? 'has-problem' : ''} key={holder.holder_id}><strong>{holder.holder_id}</strong><span>{amount(holder.expected)}</span><span>{amount(holder.confirmed_paid)}</span><b>{holder.balance_status === 'short' ? '还没收齐' : holder.balance_status === 'over' ? '多发了' : '对得上'}</b></div>)}<p>单位：USDC。所有结果来自当前程序和原始示例文件。</p></div></div>
            <div className="story-public-fact"><EvidenceLabel kind="public">公开行业背景</EvidenceLabel><p>香港金管局 2023 年报告已将付息列为代币化债券的实际业务环节。它说明这个场景存在；我们的目标客户是否缺少核对工具、是否愿意付费，仍需访谈。</p><Reference href={HKMA_REPORT}>金管局《Bond Tokenisation in Hong Kong》，第 4、18 页</Reference></div>
          </>}

          {item.id === 'approach' && <>
            <div className="story-workflow" aria-label="提供三份信息，逐人核对，生成可检查可保存的结果">
              <div className="workflow-input"><FileSpreadsheet size={27}/><h2>准备信息</h2><p>发放规则<br/>收款名单<br/>付款记录</p></div><ArrowRight className="workflow-arrow" size={23}/>
              <div className="workflow-process"><CheckCheck size={28}/><h2>逐人核对</h2><p>算该收的钱<br/>比较已确认付款<br/>保留待确认与失败记录</p></div><ArrowRight className="workflow-arrow" size={23}/>
              <div className="workflow-output"><FileCheck2 size={27}/><h2>检查并保存</h2><p>哪里不对<br/>接下来怎么查<br/>对应哪一行</p></div>
            </div>
            <div className="story-differences"><h2>针对这类发放，当前原型多做了三件事</h2><div><article><strong>名单和地址一起核对</strong><p>不知道付给谁的钱单独列出，不会按金额相同就随便归给某个人。</p></article><article><strong>区分重复记录与分次付款</strong><p>同一笔重复上传不多算；不同的付款记录可以是正常分次付款。</p></article><article><strong>告诉你为什么提醒</strong><p>把金额、付款状态、规则和原始行号连起来，方便回查。</p></article></div></div>
            <footer className="story-slide-note"><EvidenceLabel kind="built">以上能力已经实现</EvidenceLabel><span>与现有产品相比是否有足够差异，仍需进一步调研。</span></footer>
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
            <div className="story-business-grid"><div className="story-buyer"><EvidenceLabel kind="hypothesis">商业设想，未确定定价</EvidenceLabel><h2>付费理由应该来自<br/>真实的核对成本。</h2><p>我们希望减少反复整理表格、查找差别和解释结果的工作。目前还没有客户访谈、付费订单或节时测量结果。</p><div className="story-buying-chain"><span><Users size={18}/>核对人员使用</span><ArrowRight size={18}/><span><Building2 size={18}/>业务负责人决定采购</span></div></div>
              <div className="story-revenue"><div className="story-revenue-options" role="group" aria-label="收费方式设想" data-local-keys><button aria-pressed={revenue === 'per-run'} onClick={() => setRevenue('per-run')}>按次使用</button><button aria-pressed={revenue === 'subscription'} onClick={() => setRevenue('subscription')}>项目订阅</button></div>
                <h3>{revenue === 'per-run' ? '先从一次发放开始' : '服务持续发放的项目'}</h3><p>{revenue === 'per-run' ? '让不常发放的小团队，按一次核对或一个批次购买服务。先验证是否愿意为这一次工作付费。' : '让定期发放的团队按项目订阅。历史记录、多人复查和持续服务是否值得付费，需要先确认；这些能力目前尚未实现。'}</p>
                <dl><div><dt>要验证的价值</dt><dd>节省整理和回查的时间</dd></div><div><dt>要验证的付费条件</dt><dd>谁有预算，为什么愿意购买</dd></div><div><dt>报价前还需要</dt><dd>实际耗时、记录量和服务成本</dd></div></dl>
              </div></div>
            <div className="story-question"><strong>差异需要验证：</strong><p>客户现有的表格或发行平台，已经能做到哪些？独立核对和可解释报告，是否足以让他们增加一个工具？</p></div>
          </>}

          {item.id === 'next' && <>
            <div className="story-next-columns"><article><EvidenceLabel kind="built">已有基础</EvidenceLabel><h2>用原型说明方案</h2><ul><li>上传自己的表格并检查输入</li><li>逐人核对金额和付款情况</li><li>查看问题原因及原始行号</li><li>导出结果、规则与完整记录</li></ul></article>
              <article><EvidenceLabel kind="hypothesis">计划验证</EvidenceLabel><h2>补足商业与研究证据</h2><ul><li>访谈目标：3–5 个相关运营或服务团队</li><li>记录现有流程、耗时与常见问题</li><li>用同一组数据比较人工与工具核对</li><li>比较已有产品，测试付费意愿</li></ul></article>
              <article><EvidenceLabel kind="hypothesis">准备申报</EvidenceLabel><h2>按老师要求整理提交</h2><ul><li>把选题写成有依据的创业方案</li><li>从老师指定的三个类别中选一类</li><li>按学生奖报名表准备所需材料</li><li>归档实际提交内容，再上传课程平台</li></ul></article></div>
            <details className="story-source-details" ref={sourceDetailsRef}><summary>查看参赛方向与资料依据</summary><div><p><strong>方向建议：</strong>作为提供核对软件的项目，初步考虑 Ecosystem Infrastructure &amp; Technology Awards。最终类别和材料格式以报名表及老师说明为准；本页面不表示已经报名。</p><p><strong>学生奖公开评审重点：</strong>研究质量 30%、行业相关性 25%、创新 25%、展示 20%。这是奖项的公开标准，不是老师另行给出的课程评分表。</p><div className="story-source-links"><Reference href={DATS_AWARDS}>DATS 奖项类别</Reference><Reference href={DATS_JUDGING}>DATS 学生奖评审说明</Reference><Reference href={HKMA_REPORT}>金管局行业资料，2023</Reference></div><p>演示数据来自项目内的 5 人与 100 人样本，由当前核对程序生成。现有资料没有证明客户需求强度、付费意愿或节时效果，后续访谈和对比实验需要补充。</p></div></details>
            <footer className="story-slide-note"><Flag size={17}/><span>先把问题、证据、方案与商业逻辑讲清楚，再按验证结果安排产品开发。</span></footer>
          </>}
        </section>)}
        <footer className="story-pagination"><button className="button button-secondary" disabled={index === 0} onClick={() => goTo(index - 1)}><ChevronLeft size={18}/>上一页</button><div><span role="status">{index + 1} / {CHAPTERS.length}</span><small>可用键盘左右键翻页</small></div><button className="button button-primary" disabled={index === CHAPTERS.length - 1} onClick={() => goTo(index + 1)}>下一页<ChevronRight size={18}/></button></footer>
        <button className="text-link story-return" onClick={onOpenTool}><ArrowLeft size={16}/>回到核对工具，当前输入会保留</button>
      </div>
    </div>
  </main>;
}
