import { useEffect, useState } from 'react';
import { Languages, MessageCircle, Trash2 } from 'lucide-react';
import type { AiRecord, ReadingSource } from '../types/ai';
import { deleteAiRecord, getAiRecords } from '../services/aiRecords';
import { MarkdownAnswer } from './MarkdownAnswer';
import 'katex/dist/katex.min.css';

/** Compact, persistent per-paper translations and questions with expandable Markdown answers. */
export function AiHistory({ paperId, onJump, busy }: { paperId: string; onJump: (source: ReadingSource) => void; busy: boolean }) {
  const [records, setRecords] = useState<AiRecord[]>([]);
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let live = true, generation = 0;
    const refresh = (): void => { const current = ++generation; void getAiRecords(paperId, limit).then(value => { if (live && current === generation) { setRecords(value); setError(''); } }).catch((reason: unknown) => { if (live) setError(String(reason)); }); };
    refresh(); window.addEventListener('ai-records-changed', refresh);
    return () => { live = false; window.removeEventListener('ai-records-changed', refresh); };
  }, [paperId, limit]);
  return <div className="min-h-0 flex-1 space-y-3 overflow-auto bg-stone-50/60 p-3" aria-label="AI 阅读记录">
    <p className="text-[11px] leading-5 text-slate-400">选区翻译与提问自动保存在本机，重开论文后仍可查看；随书架备份。</p>
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {!records.length && <p className="py-10 text-center text-xs leading-6 text-slate-400">选中一段正文，点击“翻译”或“问问 AI”。<br/>每次结果会收纳在这里。</p>}
    {records.map(record => <details key={record.id} className="group rounded-xl border border-stone-200 bg-white shadow-sm" onToggle={event => { const open = event.currentTarget.open; setExpanded(previous => { const next = new Set(previous); if (open) next.add(record.id); else next.delete(record.id); return next; }); }}>
      <summary className="cursor-pointer list-none p-3"><div className="mb-2 flex items-center gap-2 text-[10px] text-teal-700">{record.kind === 'translate' ? <Languages size={14}/> : <MessageCircle size={14}/>}<span>{record.kind === 'translate' ? '翻译' : '选区问答'} · 第 {record.sources[0]?.page ?? '?'} 页</span><span className="ml-auto text-stone-400">{new Date(record.createdAt).toLocaleDateString()}</span></div>
        <p className="line-clamp-2 text-xs font-medium leading-5">{record.kind === 'translate' ? record.selectedText : record.question}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-400">{record.sources.reduce((text, source) => text.split(`[${source.id}]`).join(`[第 ${source.page} 页]`), record.answer) || (record.status === 'running' ? '进行中 / 未完成' : record.error || '未收到回答')}</p><span className="mt-2 block text-[10px] text-teal-700 group-open:hidden">展开查看 ↗</span></summary>
      {expanded.has(record.id) && <div className="space-y-3 border-t p-3 text-xs"><blockquote className="max-h-36 overflow-auto whitespace-pre-wrap border-l-2 border-teal-200 pl-2 text-slate-500">{record.selectedText}</blockquote>
        <MarkdownAnswer text={record.sources.reduce((text, source) => text.split(`[${source.id}]`).join(`[第 ${source.page} 页]`), record.answer)}/>
        {record.status !== 'succeeded' && <p className="text-amber-800">{record.status === 'running' ? '此条记录尚未完成，可能因关闭应用而中断。' : record.error || '已停止，内容可能不完整。'}</p>}
        <p className="text-[10px] text-stone-400">{record.model} · {new Date(record.createdAt).toLocaleString()}</p><div className="flex justify-between"><button className="small-button text-teal-700" disabled={!record.sources[0]} onClick={() => { if (record.sources[0]) onJump(record.sources[0]); }}>定位原文</button><button className="small-button text-stone-400" aria-label="删除这条 AI 记录" disabled={busy} onClick={() => { if (window.confirm('删除这条翻译或问答记录？')) void deleteAiRecord(paperId, record.id).catch((reason: unknown) => setError(String(reason))); }}><Trash2 size={13}/></button></div>
      </div>}
    </details>)}
    {records.length >= limit && <button className="small-button w-full" onClick={() => setLimit(value => value + 50)}>加载更多记录</button>}
  </div>;
}
