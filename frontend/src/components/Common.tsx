import { issueMessage } from '../locale-issues';
import { useI18n } from "../i18n";
import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { FIELD_LABELS, FILE_LABELS } from '../presentation';
import type { Issue } from '../types';

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function Field({ label, hint, children, wide = false }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return <label className={`field ${wide ? 'field-wide' : ''}`}>
    <span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}
  </label>;
}
export function Issues({ issues, warning = false }: { issues: Issue[]; warning?: boolean }) {
  const { t, language } = useI18n();
  if (!issues.length) return null;
  return <div className={`issue-list ${warning ? 'warning-list' : ''}`}>
    <strong>{warning ? t("这些地方请再看一下") : t("请更正 {0} 个表格问题", { "0": issues.length })}</strong>
    {issues.slice(0, 30).map((issue, i) => <div className="issue-item" key={`${issue.code}-${i}`}>
      <AlertTriangle size={17}/><div>
        <b>{t(FILE_LABELS[issue.file])}{issue.row != null ? t(" · 第 {0} 行", { "0": issue.row }) : ''}{issue.field ? ` · ${t(FIELD_LABELS[issue.field] || issue.field)}` : ''}</b>
        <p>{issueMessage(issue, language)}</p>
      </div>
    </div>)}
    {issues.length > 30 && <p>{t("其余 ")}{issues.length - 30}{t("项问题请更正后重新检查。")}</p>}
  </div>;
}
