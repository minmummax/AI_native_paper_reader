import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/** @param url Markdown destination. @returns Only explicit HTTP(S) links, never executable/local URLs. */
export function safeMarkdownUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}

/** @param text Untrusted streamed Markdown. @returns Local formatting; raw HTML and remote images never execute/load. */
export function MarkdownAnswer({ text }: { text: string }) {
  return <div className="ai-markdown"><Markdown skipHtml remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20 }]]} urlTransform={safeMarkdownUrl}
    components={{
      a: ({ href, children }) => href ? <a href={href} target="_blank" rel="noopener noreferrer" title={href}>{children}</a> : <span>{children}</span>,
      img: ({ alt }) => <span className="text-slate-500">[图片{alt ? `：${alt}` : ''}，未自动加载]</span>,
      table: ({ children }) => <div className="overflow-x-auto"><table>{children}</table></div>,
    }}>{text}</Markdown></div>;
}
