import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { translate, localizeMessage } from '../src/locale.ts';
import { ENGLISH } from '../src/translations.ts';
import { issueMessage } from '../src/locale-issues.ts';
import { amount, displayTime, issueCopy, ledgerExplanation, ledgerStatus, ledgerTreatment, matchesAnomaly, matchesLedger, resultConclusion } from '../src/presentation.ts';

const { cases } = JSON.parse(fs.readFileSync(new URL('../src/project/evidence.json', import.meta.url), 'utf8'));
const hasChinese = value => /[\u3400-\u9fff]/u.test(value);

test('language changes preserve exact amounts, IDs and original user content', () => {
  const precise = amount('9007199254740993.000001');
  assert.equal(translate('少发了 {0}', 'en', {0: precise}), 'Short by 9,007,199,254,740,993.000001');
  assert.equal(translate('少发了 {0}', 'zh', {0: precise}), '少发了 9,007,199,254,740,993.000001');
  assert.equal(translate('客户原始项目名', 'en'), '客户原始项目名');
  assert.equal(translate('0x0000000000000000000000000000000000000002', 'en'), '0x0000000000000000000000000000000000000002');
  assert.equal(localizeMessage('', 'zh'), '');
});

test('stored notices change language in both directions without resetting the loaded example', () => {
  const zh='已载入「5人简单示例」，表格仅用于演示。请检查表格后开始核对。';
  const en=localizeMessage(zh,'en');
  assert.match(en,/Loaded “Five-person example”/);
  assert.equal(localizeMessage(en,'zh'),zh);
  assert.equal(localizeMessage('报告包已生成，已开始下载。','en'),'The report package is ready and the download has started.');
});

test('every translation preserves the source placeholder set', () => {
  const slots=text=>[...new Set([...text.matchAll(/\{(\d+)\}/g)].map(m=>m[1]))].sort();
  for(const [zh,en] of Object.entries(ENGLISH)) assert.deepEqual(slots(en),slots(zh),zh);
});

test('all static UI messages and chapter labels have English translations', () => {
  const files=['App.tsx','components/Common.tsx','components/Inputs.tsx','components/ResultsView.tsx','components/EvidenceDialog.tsx','components/ReportView.tsx','project/ProjectStory.tsx'];
  for(const file of files) {
    const source=ts.createSourceFile(file,fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    const visit=node=>{
      let key;
      if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node))key=node.text;
      else if(ts.isTemplateExpression(node))key=node.head.text+node.templateSpans.map((span,index)=>'{'+index+'}'+span.literal.text).join('');
      if(key&&hasChinese(key))assert.equal(Object.hasOwn(ENGLISH,key),true,`${file}: ${key}`);
      if(ts.isJsxText(node))assert.equal(hasChinese(node.text),false,`${file}: unlocalized JSX text`);
      ts.forEachChild(node,visit);
    };
    visit(source);
  }
});

test('both published examples have English issue guidance, full records and payment explanations', () => {
  for(const result of Object.values(cases)) {
    assert.equal(hasChinese(JSON.stringify(resultConclusion(result,'en'))),false);
    for(const item of result.anomalies) {
      assert.equal(hasChinese(JSON.stringify(issueCopy(item,'en'))),false,item.code);
      assert.equal(hasChinese(localizeMessage(item.message,'en')),false,item.message);
      assert.equal(hasChinese(localizeMessage(item.suggested_action,'en')),false,item.code);
    }
    for(const row of result.payment_ledger) {
      assert.equal(hasChinese(ledgerStatus(row,'en')+ledgerTreatment(row,'en')+ledgerExplanation(row,'en')),false,row.reason);
      assert.equal(hasChinese(localizeMessage(row.reason,'en')),false,row.reason);
    }
    for(const item of result.warnings) assert.equal(hasChinese(issueMessage(item,'en')),false,item.message);
  }
});

test('English guidance keeps pending, duplicate and unknown payments distinct', () => {
  const pending=issueCopy({code:'PENDING_PAYMENT',amount:'0.000001'},'en');
  assert.match(pending.title,/0\.000001.*pending/);
  assert.match(pending.action,/Check.*before paying again/);
  assert.match(issueCopy({code:'DUPLICATE_IMPORT',amount:'10'},'en').action,/does not mean.*sent twice/);
  const unknown=cases.comprehensive.anomalies.find(a=>a.code==='UNMATCHED_WALLET');
  assert.match(issueCopy(unknown,'en').detail,/not been assigned/);
  assert.match(resultConclusion(cases.comprehensive,'en').detail,/8 recipients.*1 payment has/);
});

test('search supports English terms alongside the original Chinese terms', () => {
  const unknown=cases.comprehensive.anomalies.find(a=>a.code==='UNMATCHED_WALLET');
  assert.equal(matchesAnomaly(unknown,'unknown','identity'),true);
  assert.equal(matchesAnomaly(unknown,'收款人不明','identity'),true);
  const row=cases.comprehensive.payment_ledger.find(row=>row.status==='pending');
  assert.equal(matchesLedger(row,'pending','pending'),true);
  assert.equal(matchesLedger(row,'等确认','pending'),true);
  assert.deepEqual(cases.core.anomalies.filter(item=>matchesAnomaly(item,'B','all')).map(item=>item.holder_id),['B']);
});

test('validation errors keep column names, source rows and duplicate references readable in English', () => {
  const invalid={code:'INVALID_COLUMNS',file:'payments',row:1,field:null,message:'缺少字段：amount、status；不支持的字段：wrong。请使用当前模板。'};
  assert.equal(issueMessage(invalid,'en'),'Missing columns: amount, status. Unsupported columns: wrong. Use the current template.');
  assert.equal(issueMessage(invalid,'zh'),invalid.message);
  assert.equal(issueMessage({...invalid,code:'DUPLICATE_HOLDER',message:'持有人编号与第 3 行重复，快照存在歧义。'},'en'),'The recipient ID repeats row 3, so the holder list is ambiguous.');
});

test('localized dates identify the same UTC+8 cutoff and preserve empty values', () => {
  assert.match(displayTime('2026-10-15T04:00:00Z','en'),/15\/10\/2026.*12:00:00.*UTC\+8/);
  assert.match(displayTime('2026-10-15T04:00:00Z','zh'),/12:00:00.*北京时间/);
  assert.equal(displayTime(null,'en'),'—');
});
