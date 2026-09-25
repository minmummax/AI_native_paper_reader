import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

async function load(file) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(file, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { MarkdownAnswer, safeMarkdownUrl } = await load('../src/components/MarkdownAnswer.tsx');
const { boundedHistory } = await load('../src/lib/aiConversation.ts');
const { totalUsage, usageByModel, dailyUsage } = await load('../src/lib/aiUsage.ts');
const { clampAssistant } = await load('../src/components/FloatingAssistant.tsx');

test('Markdown renders GFM, code and formulas without executing HTML or fetching images', () => {
  const text = '# 标题\n\n**重点**\n\n- 条目\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst n = 1;\n```\n\n$E=mc^2$\n\n<script>alert(1)</script>\n\n![追踪](https://example.com/tracker)\n\n[危险](javascript:alert%281%29)';
  const html = renderToStaticMarkup(createElement(MarkdownAnswer, { text }));
  for (const marker of ['<h1>', '<strong>', '<ul>', '<table>', '<pre>', 'katex']) assert.ok(html.includes(marker), marker);
  assert.ok(!/<script|<iframe|<img|javascript:/i.test(html));
  assert.ok(html.includes('未自动加载'));
  for (const url of ['javascript:alert(1)', 'file:///secret', 'data:text/html,test', '//example.com', 'https://user:pass@example.com']) assert.equal(safeMarkdownUrl(url), '');
  assert.equal(safeMarkdownUrl('https://example.com/paper'), 'https://example.com/paper');
});

test('multi-turn context includes only complete paired history within UTF-8 budget', () => {
  const turn = (n, status = 'succeeded') => ({ id: String(n), question: `Q${n}`, answer: `A${n}`, status });
  const history = boundedHistory([turn(0, 'failed'), ...Array.from({ length: 8 }, (_, i) => turn(i + 1)), turn(9, 'cancelled')]);
  assert.equal(history.messages.length, 12);
  assert.equal(history.messages[0].content, 'Q3');
  assert.equal(history.omitted, 2);
  assert.deepEqual(history.messages.map(m => m.role), Array.from({ length: 12 }, (_, i) => i % 2 ? 'assistant' : 'user'));
  assert.equal(boundedHistory([{ ...turn(1), answer: '中'.repeat(3000) }]).messages.length, 0);
});

test('usage totals preserve missing-count metadata and group model/provider separately', () => {
  const row = { day: '2026-09-24', provider: 'A', model: 'one', requests: 2, succeeded: 1, failed: 0, cancelled: 1, pending: 0, unknownUsage: 1, inputTokens: 100, outputTokens: 20 };
  const rows = [row, { ...row, provider: 'B' }];
  assert.equal(totalUsage(rows).inputTokens, 200);
  assert.equal(totalUsage(rows).unknownUsage, 2);
  assert.equal(usageByModel(rows).length, 2);
  const daily = dailyUsage(rows, 7, new Date(2026, 8, 24, 12));
  assert.equal(daily.length, 7);
  assert.equal(daily[0].day, '2026-09-18');
  assert.equal(daily[0].requests, 0);
  assert.equal(daily[6].requests, 4);
});

test('floating window stays reachable after dragging or resizing to a small viewport', () => {
  assert.deepEqual(clampAssistant({ x: -1000, y: -1000 }, { width: 360, height: 480 }), { x: 12, y: 16 });
  assert.deepEqual(clampAssistant({ x: 5000, y: 5000 }, { width: 360, height: 480 }), { x: 12, y: 16 });
  assert.deepEqual(clampAssistant({ x: 5000, y: 5000 }, { width: 1280, height: 900 }), { x: 808, y: 224 });
});
