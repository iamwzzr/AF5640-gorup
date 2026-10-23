import { ENGLISH } from './translations.ts';

export type Language = 'zh' | 'en';
export type MessageValues = Record<string, unknown>;
export const LANGUAGE_STORAGE_KEY = 'distributioncheck.language';

export function translate(message: string, language: Language, values: MessageValues = {}): string {
  const template = language === 'en' ? ENGLISH[message] ?? message : message;
  return template.replace(/\{(\d+)\}/g, (placeholder, key: string) => Object.hasOwn(values, key) ? String(values[key]) : placeholder);
}

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const messagePatterns = Object.entries(ENGLISH).filter(([key]) => /\{\d+\}/.test(key)).map(([zh, en]) => {
  const makePattern = (template: string) => new RegExp('^' + template.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '([\\s\\S]*?)' : escapePattern(part)).join('') + '$');
  return { zh, en, zhPattern: makePattern(zh), enPattern: makePattern(en) };
});
const reverseMessages = new Map(Object.entries(ENGLISH).map(([zh, en]) => [en, zh]));

/** Localize stored notices without changing the underlying files or review result. */
export function localizeMessage(message: string, language: Language): string {
  if (!message) return message;
  if (Object.hasOwn(ENGLISH, message)) return translate(message, language);
  const original = reverseMessages.get(message);
  if (original !== undefined) return translate(original, language);
  for (const item of messagePatterns) {
    const match = message.match(language === 'en' ? item.zhPattern : item.enPattern);
    if (!match) continue;
    const source = language === 'en' ? item.zh : item.en;
    const target = language === 'en' ? item.en : item.zh;
    const slots = [...source.matchAll(/\{(\d+)\}/g)].map(part => part[1]);
    const values = Object.fromEntries(slots.map((slot, index) => {
      const value = match[index + 1];
      return [slot, language === 'en' ? ENGLISH[value] ?? value : reverseMessages.get(value) ?? value];
    }));
    return target.replace(/\{(\d+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
  }
  return message;
}
