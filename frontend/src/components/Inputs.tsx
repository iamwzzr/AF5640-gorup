import { useI18n } from "../i18n";
import { useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Info, UploadCloud } from 'lucide-react';
import { FIELD_LABELS } from '../presentation';
import type { Preview, Rules } from '../types';
import { Field } from './Common';

export function RulesForm({ rules, onChange, onContinue, advancedRef }: {
  rules: Rules; onChange: (key: keyof Rules, value: string | boolean) => void;
  onContinue: () => void; advancedRef: RefObject<HTMLDetailsElement | null>;
}) {
  const { t } = useI18n();
  const input = (key: keyof Rules, type = 'text') => <input type={type} value={key === 'project_name' && rules.synthetic ? t(String(rules[key])) : String(rules[key])}
    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(key, event.target.value)} required/>;
  return <form noValidate onSubmit={event => { event.preventDefault(); onContinue(); }}>
    <section className="panel rule-panel">
      <div className="panel-heading"><h2>{t("先填写这次的发放规则")}</h2></div>
      <div className="form-grid">
        <Field label={t("项目名称")}>{input('project_name')}</Field>
        <Field label={t("这次发放的编号")} hint={t("例如 2026-Q3，用来区分每次发放，应与付款表一致。")}>{input('batch_id')}</Field>
        <Field label={t("按哪天的持有数量计算")} hint={t("用这一天的名单和代币数量，算每人该收多少。")}>{input('record_date', 'date')}</Field>
        <Field label={t("每个代币发多少")} hint={t("例如填 0.2，最多填 6 位小数。")}>
          <div className="input-suffix">{input('payout_per_token')}<span>{rules.currency}</span></div>
        </Field>
        <Field label={t("最晚哪天发完")} hint={t("超过这个时间还没付清，就会提醒你。")}>{input('payment_due_at', 'datetime-local')}</Field>
        <Field label={t("查看截至什么时候的付款")} hint={t("只检查这个时间之前的付款。时间统一按北京时间填写。")}>{input('as_of', 'datetime-local')}</Field>
      </div>
      <details className="disclosure advanced-settings" ref={advancedRef}>
        <summary>{t("更多设置")}<span>{t("与表格中的信息保持一致")}</span></summary>
        <div className="form-grid">
          <Field label={t("项目编号")} hint={t("两份表格中的项目编号都要与这里相同。")}>{input('project_id')}</Field>
          <Field label={t("付款网络编号")} hint={t("照付款表中的网络编号填写。")}>{input('chain_id')}</Field>
          <Field label={t("代币识别地址")} hint={t("用来区分不同代币，请填写与付款表相同的地址。")} wide>{input('payment_token')}</Field>
          <Field label={t("发放币种")} hint={t("当前使用 USDC。")}><input value={rules.currency} readOnly/></Field>
        </div>
      </details>
      <label className="checkbox-row"><input type="checkbox" checked={rules.synthetic} onChange={event => onChange('synthetic', event.target.checked)}/>
        <span>{t("这些表格是演示数据")}<small>{t("如果上传的是实际业务表格，请取消勾选。")}</small></span>
      </label>
    </section>
    <div className="info-strip"><Info size={19}/><p>{t("每人该收多少 = 他持有的代币数量 × 每个代币发多少。")}</p></div>
    <div className="bottom-actions"><p className="muted">{t("下一步需要两份表格：收款名单、付款记录。")}</p>
      <button className="button button-primary" type="submit">{t("下一步，上传表格")}<ArrowRight size={18}/></button>
    </div>
  </form>;
}

export function UploadBox({ kind, file, onChange }: { kind: 'holders' | 'payments'; file: File | null; onChange: (file: File) => void }) {
  const { t } = useI18n();
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const title = kind === 'holders' ? t("收款名单") : t("付款记录");
  const onFile = (candidate: File | undefined) => { if (candidate) onChange(candidate); };
  return <section className={`upload-card ${file ? 'has-file' : ''} ${drag ? 'drag-active' : ''}`}>
    <div className="upload-card-top"><FileSpreadsheet size={26}/><div><h2>{title}</h2>
      <p>{kind === 'holders' ? t("谁应该收钱、收款地址是什么、持有多少代币。") : t("钱发给了谁、发了多少、付款是否成功。")}</p>
    </div></div>
    <button type="button" className="drop-zone" onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={event => { event.preventDefault(); setDrag(false); onFile(event.dataTransfer.files[0]); }}>
      {file ? <><CheckCircle2 size={28}/><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)}{t("KB · 点击或拖入文件以替换")}</span></>
        : <><UploadCloud size={30}/><strong>{t("选择表格，或拖到这里")}</strong><span>{t("请用 CSV 格式 · 最大 5 MiB · 最多 10,000 行")}</span></>}
    </button>
    <input ref={input} type="file" accept=".csv,text/csv" className="visually-hidden" aria-label={t("上传{0}", { "0": title })}
      onChange={event => { onFile(event.target.files?.[0]); event.target.value = ''; }}/>
    <a className="text-link" href={`/examples/templates/${kind}.csv`} download><Download size={17}/>{t("下载")}{title}{t("模板")}</a>
    <p className="table-note">{t("可先下载模板，用 Excel 填好后保存为 CSV 文件。")}</p>
  </section>;
}

export function DataPreview({ data, title }: { data: Preview; title: string }) {
  const { t } = useI18n();
  return <details className="disclosure data-preview">
    <summary>{title}<span>{data.row_count}{t("行 · ")}{data.filename}</span></summary>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={t("{0}原始数据", { "0": title })}>
      <table className="preview-table"><thead><tr>{data.columns.map(column => <th scope="col" key={column}>{t(FIELD_LABELS[column] || column)}<small>{column}</small></th>)}</tr></thead>
        <tbody>{data.rows.slice(0, 5).map((row, i) => <tr key={i}>{data.columns.map(column => <td key={column}>{String(row[column] ?? '—')}</td>)}</tr>)}</tbody>
      </table>
    </div><p className="table-note">{t("显示前 ")}{Math.min(data.rows.length, 5)}{t("行。原始 CSV 表头为第 1 行，数据从第 2 行开始。")}</p>
  </details>;
}
