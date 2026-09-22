import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { invoke } from '@tauri-apps/api/core';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface PaperMetadata { title: string; authors: string[]; year: number | null; abstract: string | null; total_pages: number }

/**
 * Opens bytes in a dedicated local PDF.js worker; remote document URLs are never accepted.
 * @param data Owned PDF byte buffer (PDF.js transfers it to its worker).
 * @returns Loading task, including cancellation and password callbacks.
 */
export function loadPdf(data: Uint8Array) {
  // Resolve resources against the app document, not the worker script's /assets/ URL.
  // Explicitly use the DOM loader: it supports Tauri's custom protocol through asynchronous XHR.
  const resources = new URL('pdfjs/', new URL(import.meta.env.BASE_URL, document.baseURI));
  return getDocument({ data, cMapUrl: new URL('cmaps/', resources).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', resources).href,
    useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
}

/** @param id SHA-256 document ID. @returns Bytes read asynchronously from managed local storage. */
export async function readPdf(id: string): Promise<Uint8Array> {
  return new Uint8Array(await invoke<ArrayBuffer>('read_paper_file', { id }));
}

/**
 * Extracts local PDF metadata with first-page text heuristics, without OCR or network calls.
 * @param pdf Open PDF document. @param fallback Filename used when metadata lacks a title.
 * @returns Metadata; uncertain author/year/abstract fields remain empty rather than invented.
 */
export async function extractMetadata(pdf: PDFDocumentProxy, fallback: string): Promise<PaperMetadata> {
  const metadata = await pdf.getMetadata().catch(() => null);
  const info: unknown = metadata?.info;
  const fields = typeof info === 'object' && info !== null ? info as Record<string, unknown> : {};
  const first = await pdf.getPage(1);
  const content = await first.getTextContent();
  const text = content.items.map(item => 'str' in item ? item.str + ('hasEOL' in item && item.hasEOL ? '\n' : ' ') : '').join('');
  const title = typeof fields.Title === 'string' && fields.Title.trim() ? fields.Title.trim() : text.split('\n').find(line => line.trim().length > 8)?.trim() || fallback;
  const authors = typeof fields.Author === 'string' ? fields.Author.split(/;|\band\b/).map(name => name.trim()).filter(Boolean) : [];
  const year = text.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? (typeof fields.CreationDate === 'string' ? fields.CreationDate.match(/(?:19|20)\d{2}/)?.[0] : undefined);
  const abstract = text.match(/(?:abstract|摘要)\s*[:：—-]?\s*([\s\S]{20,2500}?)(?=\n\s*(?:\d?[.\s]*introduction|keywords|index terms|引言|关键词)|$)/i)?.[1]?.trim() ?? null;
  return { title: title.slice(0, 500), authors, year: year ? Number(year) : null, abstract, total_pages: pdf.numPages };
}
