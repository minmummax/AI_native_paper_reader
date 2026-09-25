import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { AiSelection, ReadingSnapshot, ReadingSource } from '../types/ai';
import { boundedText, sourceId } from './readingContext';

interface Chunk { page: number; text: string; order: number }
interface PaperText { chunks: Chunk[]; readablePages: number; totalPages: number; clipped: boolean }
const cache = new WeakMap<PDFDocumentProxy, PaperText>();
const encoder = new TextEncoder();
const length = (text: string): number => encoder.encode(text).length;

/** Extracts local text sequentially without rendering pages; cancellation never leaves a partial cache. */
async function extract(pdf: PDFDocumentProxy, signal: AbortSignal, progress: (page: number) => void): Promise<PaperText> {
  const cached = cache.get(pdf);
  if (cached) return cached;
  const chunks: Chunk[] = [];
  let readablePages = 0, bytes = 0, clipped = false;
  for (let page = 1; page <= pdf.numPages; page++) {
    signal.throwIfAborted();
    const content = await (await pdf.getPage(page)).getTextContent();
    signal.throwIfAborted();
    const raw = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
    if (raw) readablePages++;
    // Bound pathological PDFs in local memory, while still inspecting every page for coverage.
    const text = boundedText(raw, Math.min(60000, Math.max(0, 8_000_000 - bytes)));
    clipped ||= text.length < raw.length; bytes += length(text);
    let rest = text;
    while (rest) {
      let part = boundedText(rest, 1500);
      if (part.length < rest.length) {
        const boundary = Math.max(part.lastIndexOf('\n'), part.lastIndexOf('. '), part.lastIndexOf('。'));
        if (boundary > part.length / 2) part = part.slice(0, boundary + 1);
      }
      if (!part) break;
      chunks.push({ page, text: part.trim(), order: chunks.length }); rest = rest.slice(part.length).trimStart();
    }
    progress(page);
    await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
  const result = { chunks, readablePages, totalPages: pdf.numPages, clipped };
  cache.set(pdf, result); return result;
}

/** Expands common Chinese research questions with English terms for English-language papers. */
export function queryTerms(query: string): string[] {
  const expanded = query.toLowerCase()
    .replace(/创新|贡献|新颖/g, ' contribution novel novelty propose method 创新 ')
    .replace(/总结|概括|主要|概述/g, ' abstract introduction conclusion summary 总结 ')
    .replace(/局限|不足|待解决|未来|问题/g, ' limitation future challenge discussion problem 局限 ')
    .replace(/实验|结果|效果|比较/g, ' experiment result evaluation baseline comparison 实验 ')
    .replace(/方法|算法|如何/g, ' method approach algorithm 方法 ');
  const words = expanded.match(/[a-z0-9][a-z0-9_-]{2,}|[\p{Script=Han}]+/gu) ?? [];
  return [...new Set(words.flatMap(word => /\p{Script=Han}/u.test(word) ? Array.from({ length: Math.max(1, word.length - 1) }, (_, i) => word.slice(i, i + 2)) : [word]))].filter(word => !['the','and','this','that','what','how','does','paper'].includes(word));
}

/** Selects bounded evidence across the paper, retaining broad coverage for synthesis and exact term hits for detail questions. */
export function selectPaperChunks(chunks: readonly Chunk[], query: string, budget: number): Chunk[] {
  if (chunks.reduce((sum, chunk) => sum + length(chunk.text), 0) <= budget && chunks.length <= 64) return [...chunks];
  const terms = queryTerms(query);
  const global = /创新|贡献|总结|概括|局限|不足|待解决|未来|overview|summari|contribution|limitation|novel/i.test(query);
  const frequencies = terms.map(term => chunks.filter(chunk => chunk.text.toLowerCase().includes(term)).length);
  const score = (chunk: Chunk): number => {
    const text = chunk.text.toLowerCase();
    return terms.reduce((sum, term, index) => sum + (text.includes(term) ? Math.log(1 + chunks.length / (1 + (frequencies[index] ?? 0))) : 0), 0)
      + (global && /abstract|conclusion|limitation|contribution|future work|摘要|结论|局限/i.test(text) ? 3 : 0);
  };
  const ranked = [...chunks].sort((a, b) => score(b) - score(a) || a.order - b.order);
  const picked: Chunk[] = []; const ids = new Set<number>(); let used = 0;
  const add = (chunk: Chunk | undefined): void => {
    if (!chunk || ids.has(chunk.order) || picked.length >= 64 || used + length(chunk.text) > budget) return;
    picked.push(chunk); ids.add(chunk.order); used += length(chunk.text);
  };
  add(chunks[0]);
  // Reserve overview coverage before using the remaining budget for query-specific evidence.
  if (global) {
    ranked.filter(chunk => /conclusion|limitation|contribution|future work|结论|局限/i.test(chunk.text)).slice(0, 3).forEach(add);
    const samples = Math.min(6, Math.floor(budget / 4000));
    for (let i = 1; i <= samples; i++) add(chunks[Math.floor(i * (chunks.length - 1) / samples)]);
  }
  ranked.forEach(add);
  return picked.sort((a, b) => a.order - b.order);
}

/** Builds query-aware evidence locally. No provider request or document upload occurs here. */
export async function buildPaperSnapshot(pdf: PDFDocumentProxy, paperId: string, query: string, signal: AbortSignal,
  progress: (page: number) => void, budget = 24000): Promise<ReadingSnapshot> {
  const document = await extract(pdf, signal, progress); signal.throwIfAborted();
  if (!document.chunks.length) throw new Error('论文没有可提取的正文，需要带文字层的 PDF。');
  const selected = selectPaperChunks(document.chunks, query, Math.min(48000, budget));
  const sources = await Promise.all(selected.map(async chunk => ({ id: await sourceId(paperId, chunk.page, chunk.text), page: chunk.page, text: chunk.text, rects: [] })));
  // Repeated headers can yield identical content IDs; send each evidence block once.
  const unique = sources.filter((source, index) => sources.findIndex(item => item.id === source.id) === index);
  const truncated = document.clipped || selected.length < document.chunks.length || document.readablePages < document.totalPages;
  return { paperId, scope: 'paper', extractionRevision: 'text-v1', sources: unique, truncated,
    coverage: { totalPages: document.totalPages, readablePages: document.readablePages, selectedPages: [...new Set(unique.map(source => source.page))],
      bytes: unique.reduce((sum, source) => sum + length(source.text), 0), strategy: truncated ? '本机全文检索 · 问题相关片段与跨页概览' : '完整可提取正文' } };
}

/** Includes the explicit selection and nearby same-page text, never silently substitutes the whole page. */
export async function buildSelectionSnapshot(pdf: PDFDocumentProxy, selection: AiSelection): Promise<ReadingSnapshot> {
  const raw = (await (await pdf.getPage(selection.page)).getTextContent()).items.map(item => 'str' in item ? item.str + ' ' : '').join('').replace(/\s+/g, ' ').trim();
  const selected = boundedText(selection.text.trim(), 8000);
  if (!selected) throw new Error('请先选中论文正文。');
  const normalized = selection.text.replace(/\s+/g, ' ').trim();
  const start = raw.indexOf(normalized);
  const nearby = start < 0 ? '' : boundedText(raw.slice(Math.max(0, start - 450), start), 1500) + '\n' + boundedText(raw.slice(start + normalized.length, start + normalized.length + 450), 1500);
  const sources: ReadingSource[] = [{ id: await sourceId(selection.paperId, selection.page, selected), page: selection.page, text: selected, rects: selection.rects }];
  if (nearby.trim()) sources.push({ id: await sourceId(selection.paperId, selection.page, nearby), page: selection.page, text: nearby, rects: [] });
  return { paperId: selection.paperId, scope: 'selection', extractionRevision: 'text-v1', sources, truncated: selected.length < selection.text.trim().length };
}
