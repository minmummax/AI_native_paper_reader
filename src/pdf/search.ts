import type { TextContent } from 'pdfjs-dist/types/src/display/api';

export interface SearchPart { item: number; start: number; end: number }
export interface SearchMatch { page: number; parts: SearchPart[]; excerpt: string }
/** @param content PDF.js text items. @param query Literal, case-insensitive query. @param page One-based page. @returns Matches mapped to original text item offsets. */
export function findPageMatches(content: TextContent, query: string, page: number): SearchMatch[] {
  const items = content.items.filter(item => 'str' in item);
  const starts: number[] = [];
  let text = '';
  for (const item of items) { starts.push(text.length); text += item.str + (item.hasEOL ? ' ' : ''); }
  const needle = query.trim();
  if (!needle) return [];
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'giu');
  const matches: SearchMatch[] = [];
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0, end = start + match[0].length;
    const parts = items.flatMap((item, index) => {
      const from = Math.max(0, start - (starts[index]??0)), to = Math.min(item.str.length, end - (starts[index]??0));
      return to > from ? [{item:index,start:from,end:to}] : [];
    });
    if (parts.length) matches.push({page,parts,excerpt:text.slice(Math.max(0,start-24),end+48)});
  }
  return matches;
}
