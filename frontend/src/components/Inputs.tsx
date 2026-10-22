import { useRef, useState } from 'react';
import type { ChangeEvent, RefObject } from 'react';
import { ArrowRight, CheckCircle2, Download, FileSpreadsheet, Info, UploadCloud } from 'lucide-react';
import { FIELD_LABELS } from '../presentation';
import type { Preview, Rules } from '../types';
import { Badge, Field } from './Common';

export function RulesForm({ rules, onChange, onContinue, advancedRef }: {
  rules: Rules; onChange: (key: keyof Rules, value: string | boolean) => void;
  onContinue: () => void; advancedRef: RefObject<HTMLDetailsElement | null>;
}) {
  const input = (key: keyof Rules, type = 'text') => <input type={type} value={String(rules[key])}
    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(key, event.target.value)} required/>;
  return <form noValidate onSubmit={event => { event.preventDefault(); onContinue(); }}>
    <section className="panel rule-panel">
      <div className="panel-heading"><h2>这一次，按什么规则分配？</h2><Badge>单项目、单批次</Badge></div>
      <div className="form-grid">
        <Field label="项目名称">{input('project_name')}</Field>
        <Field label="分配批次" hint="填写与付款文件一致的批次编号。">{input('batch_id')}</Field>
        <Field label="持仓记录日" hint="哪一天的持仓，决定这次谁能收款、应收多少。">{input('record_date', 'date')}</Field>
        <Field label="每枚代币分配多少" hint="使用普通小数，最多保留 6 位。">
          <div className="input-suffix">{input('payout_per_token')}<span>{rules.currency}</span></div>
        </Field>
        <Field label="最晚什么时候付款" hint="用于区分尚未到期和逾期未结清。">{input('payment_due_at', 'datetime-local')}</Field>
        <Field label="核对到什么时间" hint="只按这个时间之前的付款状态核对；所有时间均为 UTC+8。">{input('as_of', 'datetime-local')}</Field>
      </div>
      <details className="disclosure advanced-settings" ref={advancedRef}>
        <summary>项目编号、网络与付款资产<span>导入前请与 CSV 核对</span></summary>
        <div className="form-grid">
          <Field label="项目编号" hint="两份文件中的 project_id 必须一致。">{input('project_id')}</Field>
          <Field label="网络编号（Chain ID）" hint="例如：Ethereum 为 1。">{input('chain_id')}</Field>
          <Field label="付款代币合约" wide>{input('payment_token')}</Field>
          <Field label="付款币种" hint="当前版本支持 6 位小数的 USDC。"><input value={rules.currency} readOnly/></Field>
        </div>
      </details>
      <label className="checkbox-row"><input type="checkbox" checked={rules.synthetic} onChange={event => onChange('synthetic', event.target.checked)}/>
        <span>这是教学合成数据<small>报告会保留此标识；上传真实业务数据时请取消勾选。</small></span>
      </label>
    </section>
    <div className="info-strip"><Info size={19}/><p>应付金额 = 记录日持有数量 × 每枚分配额，逐人保留 6 位小数。付款状态以文件为准。</p></div>
    <div className="bottom-actions"><p className="muted">下一步准备两份 CSV：持有人名单、付款记录。</p>
      <button className="button button-primary" type="submit">继续，导入数据<ArrowRight size={18}/></button>
    </div>
  </form>;
}

export function UploadBox({ kind, file, onChange }: { kind: 'holders' | 'payments'; file: File | null; onChange: (file: File) => void }) {
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const title = kind === 'holders' ? '持有人名单' : '付款记录';
  const onFile = (candidate: File | undefined) => { if (candidate) onChange(candidate); };
  return <section className={`upload-card ${file ? 'has-file' : ''} ${drag ? 'drag-active' : ''}`}>
    <div className="upload-card-top"><FileSpreadsheet size={26}/><div><h2>{title}</h2>
      <p>{kind === 'holders' ? '记录日的持有人编号、登记钱包和持有数量。' : '交易事件、收款钱包、付款金额和状态。'}</p>
    </div></div>
    <button type="button" className="drop-zone" onClick={() => input.current?.click()}
      onDragOver={event => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={event => { event.preventDefault(); setDrag(false); onFile(event.dataTransfer.files[0]); }}>
      {file ? <><CheckCircle2 size={28}/><strong>{file.name}</strong><span>{(file.size / 1024).toFixed(1)} KB · 点击或拖入文件以替换</span></>
        : <><UploadCloud size={30}/><strong>选择 CSV 文件，或拖到这里</strong><span>UTF-8 CSV · 最大 5 MiB · 最多 10,000 行</span></>}
    </button>
    <input ref={input} type="file" accept=".csv,text/csv" className="visually-hidden" aria-label={`上传${title}`}
      onChange={event => { onFile(event.target.files?.[0]); event.target.value = ''; }}/>
    <a className="text-link" href={`/examples/templates/${kind}.csv`} download><Download size={17}/>下载{title}模板</a>
  </section>;
}

export function DataPreview({ data, title }: { data: Preview; title: string }) {
  return <details className="disclosure data-preview">
    <summary>{title}<span>{data.row_count} 行 · {data.filename}</span></summary>
    <div className="table-scroll" tabIndex={0} role="region" aria-label={`${title}原始数据`}>
      <table className="preview-table"><thead><tr>{data.columns.map(column => <th scope="col" key={column}>{FIELD_LABELS[column] || column}<small>{column}</small></th>)}</tr></thead>
        <tbody>{data.rows.slice(0, 5).map((row, i) => <tr key={i}>{data.columns.map(column => <td key={column}>{String(row[column] ?? '—')}</td>)}</tr>)}</tbody>
      </table>
    </div><p className="table-note">显示前 {Math.min(data.rows.length, 5)} 行。原始 CSV 表头为第 1 行，数据从第 2 行开始。</p>
  </details>;
}
