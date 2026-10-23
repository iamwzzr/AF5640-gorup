import { localizeMessage } from './locale.ts';
import type { Language } from './locale';
import type { Issue } from './types';

export function issueMessage(issue: Issue, language: Language): string {
  if (language === 'zh') return issue.message;
  if (issue.code === 'INVALID_COLUMNS') {
    const missing = issue.message.match(/缺少字段：([^；。]+)/)?.[1].replaceAll('、', ', ');
    const extra = issue.message.match(/不支持的字段：([^；。]+)/)?.[1].replaceAll('、', ', ');
    return [missing && `Missing columns: ${missing}.`, extra && `Unsupported columns: ${extra}.`, 'Use the current template.'].filter(Boolean).join(' ');
  }
  return localizeMessage(issue.message, language);
}
