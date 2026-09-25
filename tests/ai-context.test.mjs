import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

globalThis.crypto ??= webcrypto;
const result = await build({ entryPoints: [fileURLToPath(new URL('../src/pdf/readingContext.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node' });
const { boundedText, buildReadingSnapshot, citedSources, MAX_CONTEXT_BYTES } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const paperId = 'a'.repeat(64);
const pdf = (text) => ({ numPages: 3, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: text, hasEOL: true }] }) }) });

test('UTF-8 budget never splits Chinese or emoji and discloses truncation', async () => {
  assert.equal(boundedText('中😀a', 6), '中');
  assert.equal(boundedText('中😀a', 7), '中😀');
  const snapshot = await buildReadingSnapshot(pdf('中'.repeat(5000)), paperId, 2);
  assert.equal(snapshot.truncated, true);
  assert.ok(Buffer.byteLength(snapshot.sources[0].text) <= MAX_CONTEXT_BYTES);
  assert.equal(snapshot.sources[0].page, 2);
});

test('source identity is stable but isolated across text, papers and pages', async () => {
  const a = await buildReadingSnapshot(pdf('evidence'), paperId, 1);
  assert.deepEqual(a, await buildReadingSnapshot(pdf('evidence'), paperId, 1));
  for (const [text, paper, page] of [['other', paperId, 1], ['evidence', 'b'.repeat(64), 1], ['evidence', paperId, 2]]) {
    assert.notEqual(a.sources[0].id, (await buildReadingSnapshot(pdf(text), paper, page)).sources[0].id);
  }
});

test('selection sends only selected text and rejects cross-paper or invalid-page evidence', async () => {
  const selection = { paperId, page: 2, text: 'selected', rects: [] };
  const snapshot = await buildReadingSnapshot(pdf('private surrounding text'), paperId, 1, selection);
  assert.equal(snapshot.scope, 'selection');
  assert.equal(snapshot.sources[0].text, 'selected');
  await assert.rejects(buildReadingSnapshot(pdf('x'), 'b'.repeat(64), 1, selection));
  await assert.rejects(buildReadingSnapshot(pdf('x'), paperId, 0));
  await assert.rejects(buildReadingSnapshot(pdf('  '), paperId, 1));
});

test('only exact supplied citation IDs can become jump-back links', async () => {
  const { sources } = await buildReadingSnapshot(pdf('evidence'), paperId, 1);
  assert.deepEqual(citedSources(`[s${'0'.repeat(64)}] [第 99 页]`, sources), []);
  assert.deepEqual(citedSources(`answer [${sources[0].id}] [${sources[0].id}]`, sources), sources);
});
