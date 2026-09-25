import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AiSelection, ReadingSnapshot, ReadingSource } from '../types/ai';

// A conservative UTF-8 byte cap bounds both multilingual context and provider costs.
export const MAX_CONTEXT_BYTES = 12000;
const encoder = new TextEncoder();

/** @param text Extracted text. @param bytes UTF-8 budget. @returns Unicode-safe prefix. */
export function boundedText(text: string, bytes: number): string {
  let used = 0;
  let result = '';
  for (const char of text) {
    used += encoder.encode(char).length;
    if (used > bytes) break;
    result += char;
  }
  return result;
}

/** @param paperId Content-addressed PDF ID. @param page Source page. @param text Extracted text.
 * @returns Revision-scoped content ID independent of zoom and viewport position. */
export async function sourceId(paperId: string, page: number, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${paperId}:text-v1:${page}:${text}`));
  return `s${Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** @param pdf Local worker-backed document. @param paperId PDF hash. @param page Current page.
 * @param selection Explicit same-paper selection, if any. @returns Bounded immutable request evidence.
 * Page-level provenance is intentional: this first delivery does not guess paragraph geometry. */
export async function buildReadingSnapshot(pdf: PDFDocumentProxy, paperId: string, page: number, selection?: AiSelection): Promise<ReadingSnapshot> {
  if (selection && selection.paperId !== paperId) throw new Error('选区不属于当前论文');
  const sourcePage = selection?.page ?? page;
  if (!Number.isInteger(sourcePage) || sourcePage < 1 || sourcePage > pdf.numPages) throw new Error('无效页码');
  const raw = selection ? selection.text : (await (await pdf.getPage(sourcePage)).getTextContent()).items
    .map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('');
  if (!raw.trim()) throw new Error('本页没有可提取的文字，可能需要 OCR。未发送任何内容。');
  const text = boundedText(raw.trim(), MAX_CONTEXT_BYTES);
  const source: ReadingSource = { id: await sourceId(paperId, sourcePage, text), page: sourcePage, text, rects: selection?.rects ?? [] };
  return { paperId, scope: selection ? 'selection' : 'page', extractionRevision: 'text-v1', sources: [source], truncated: text.length < raw.trim().length };
}

/** @param answer Model response. @param sources Request evidence. @returns Only validated citations. */
export function citedSources(answer: string, sources: readonly ReadingSource[]): ReadingSource[] {
  const ids = new Set(Array.from(answer.matchAll(/\[(s[a-f0-9]{64})\]/g), match => match[1]));
  return sources.filter(source => ids.has(source.id));
}
