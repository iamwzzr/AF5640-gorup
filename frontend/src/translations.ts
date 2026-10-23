import { TOOL_ENGLISH } from './translations/tool.ts';
import { STORY_ENGLISH } from './translations/story.ts';
import { SYSTEM_ENGLISH } from './translations/system.ts';
import { PRODUCT_ENGLISH } from './translations/product.ts';

/** Chinese is the source language. Placeholders hold data, never computed money. */
export const ENGLISH: Record<string, string> = { ...TOOL_ENGLISH, ...STORY_ENGLISH, ...SYSTEM_ENGLISH, ...PRODUCT_ENGLISH };
