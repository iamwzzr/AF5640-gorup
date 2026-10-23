import { useI18n } from "../i18n";
import { ArrowDownToLine, ArrowLeft, FileSpreadsheet, FileText, Info, LoaderCircle } from 'lucide-react';
import { amount, displayTime, FILE_LABELS, isNonZero, resultConclusion } from '../presentation';
import type { Result } from '../types';
import { Badge } from './Common';

export function ReportView({ result, busy, onBack, onExport, holdersName, paymentsName }: {
  result: Result; busy: boolean; onBack: () => void; onExport: () => void; holdersName: string; paymentsName: string;
}) {
  const { t, language } = useI18n();
  const { metadata: meta, summary } = result;
  const files = [
    ['holders.csv', t("每个人收齐了吗"), t("每个人该收多少、已发多少、还差多少。")],
    ['anomalies.csv', t("需要检查的问题"), t("哪里不对、接下来怎么查。")],
    ['payment_ledger.csv', t("每笔付款的记录"), t("哪些已算作付款，哪些没算，以及原因。")],
    ['summary.json', t("这次的整体结果"), t("所有人的总金额，以及对应的表格信息。")],
    ['rules.json', t("这次填写的规则"), t("按哪天的名单、每个代币发多少、检查到什么时间。")],
  ];
  return <>
    <div className="page-heading"><div><button className="text-link" onClick={onBack}><ArrowLeft size={17}/>{t("返回核对结果")}</button><h1>{t("把这次的结果保存下来")}</h1><p>{t("下载报告，方便之后检查或分享给组员。")}</p></div>
      <button className="button button-primary" disabled={busy} onClick={onExport}>{busy ? <LoaderCircle size={18} className="spin"/> : <ArrowDownToLine size={18}/>}{t("下载完整报告")}</button>
    </div>
    <section className="panel report-summary"><div className="panel-heading"><h2>{meta.synthetic ? t(meta.project_name) : meta.project_name}</h2><Badge tone={meta.synthetic ? 'warning' : 'neutral'}>{meta.synthetic ? t("演示用数据") : t("你上传的数据")}</Badge></div>
      <div className="report-body"><p className="report-conclusion">{resultConclusion(result, language).title}{t("。")}{summary.issue_count ? t("共 {0} 个问题，其中 {1} 位名单上的收款人需要检查。不知道付给谁的记录单独列出。", { "0": summary.issue_count, "1": summary.affected_holder_count }) : t("已逐人比较 {0} 位收款人的付款情况。", { "0": summary.holder_count })}</p>
        <dl className="report-amounts"><div><dt>{t("这次该发多少")}</dt><dd>{amount(summary.expected_total)}</dd></div><div><dt>{t("表格里已发多少")}</dt><dd>{amount(summary.confirmed_total)}</dd></div><div><dt>{t("还有多少没发齐")}</dt><dd>{amount(summary.shortfall_total)}</dd></div></dl>
        <p className="table-note">{t("单位：")}{meta.currency}{t("，只按表格中的已确认付款统计。")}{isNonZero(summary.unmatched_confirmed_total) && t("已发金额中有 {0} 还不知道付给了谁。", { "0": amount(summary.unmatched_confirmed_total) })}{isNonZero(summary.pending_total) && t("另有 {0} 在等确认。", { "0": amount(summary.pending_total) })}{t("部分“没发齐”的钱可能还在确认，别直接照这个数补发。")}</p>
        <dl className="report-dl"><div><dt>{t("本次发放编号")}</dt><dd>{meta.batch_id}</dd></div><div><dt>{t("按哪天的名单")}</dt><dd>{meta.record_date}</dd></div><div><dt>{t("最晚付款时间")}</dt><dd>{displayTime(meta.payment_due_at, language)}</dd></div><div><dt>{t("检查截至时间")}</dt><dd>{displayTime(meta.as_of, language)}</dd></div><div><dt>{t("上传的表格")}</dt><dd>{summary.holder_count}{t("位收款人，")}{summary.payment_row_count}{t("行付款记录")}</dd></div><div><dt>{t("重复的记录")}</dt><dd>{summary.duplicate_row_count}{t("行重复，没有再算一次")}</dd></div></dl>
      </div>
    </section>
    <div className="report-grid">
      <section className="panel"><div className="panel-heading"><h2>{t("报告里有什么")}</h2><Badge>{t("一个压缩包")}</Badge></div><ul className="report-files">{files.map(([name, title, description]) => <li key={name}>{name.endsWith('.csv') ? <FileSpreadsheet size={21}/> : <FileText size={21}/>}<div><strong>{title}</strong><p>{description}</p></div></li>)}</ul></section>
      <section className="panel report-inputs"><div className="panel-heading"><h2>{t("用了哪些表格和规则")}</h2></div><div className="report-body">
        <p>{t("收款名单：")}<strong>{holdersName}</strong></p><p>{t("付款记录：")}<strong>{paymentsName}</strong></p>
        <details className="disclosure"><summary>{t("查看详细设置和计算方法")}</summary><dl className="report-dl">
          <div><dt>{t("项目编号")}</dt><dd>{meta.project_id}</dd></div><div><dt>{t("每个代币发多少")}</dt><dd>{meta.payout_per_token} {meta.currency}</dd></div><div><dt>{t("付款网络编号")}</dt><dd>{meta.chain_id}</dd></div><div><dt>{t("代币识别地址")}</dt><dd><code>{meta.payment_token}</code></dd></div><div><dt>{t("小数怎么处理")}</dt><dd>{t("每个人保留 6 位小数，四舍五入")}</dd></div><div><dt>{t("取小数造成的总差别")}</dt><dd>{amount(summary.rounding_adjustment, true)} {meta.currency}</dd></div><div><dt>{t("总金额相差多少")}</dt><dd>{amount(summary.net_difference)} {meta.currency}{t("，全部已确认付款减去全部该发金额；含收款人不明的付款，不能代替逐人检查。")}</dd></div><div><dt>{t("程序版本")}</dt><dd>{meta.algorithm_version}</dd></div>
        </dl></details>
        <details className="disclosure"><summary>{t("确认报告对应哪份表格")}</summary><p className="table-note">{t("下面的校验码用于辨认文件，不代表表格里的内容已被证实。")}</p><dl className="fingerprints">{Object.entries(meta.input_fingerprints).map(([key, value]) => <div key={key}><dt>{t(FILE_LABELS[key as keyof typeof FILE_LABELS] || key)}</dt><dd><code>{value}</code></dd></div>)}</dl></details>
        <details className="disclosure"><summary>{t("查看压缩包中的文件名")}</summary><dl className="fingerprints">{files.map(([name, title]) => <div key={name}><dt>{title}</dt><dd><code>{name}</code></dd></div>)}</dl></details>
      </div></section>
    </div>
    <div className="info-strip"><Info size={19}/><p>{t("报告按你上传的表格生成，不会替你转账，也不代表实际付款已被证实。修改规则或表格后，需要重新核对。")}</p></div>
    <div className="bottom-actions"><button className="button button-secondary" onClick={onBack}><ArrowLeft size={17}/>{t("返回核对结果")}</button></div>
  </>;
}
