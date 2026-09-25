import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Channel, invoke, isTauri } from '@tauri-apps/api/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Paper } from '../types';
import type { AiProfile, AiRecord, AiStreamEvent, ChatTurn, ReadingSnapshot, ReadingSource, SelectionIntent } from '../types/ai';
import { citedSources } from '../pdf/readingContext';
import { buildPaperSnapshot, buildSelectionSnapshot } from '../pdf/paperContext';
import { boundedHistory } from '../lib/aiConversation';
import { saveAiRecord } from '../services/aiRecords';
import { MarkdownAnswer } from './MarkdownAnswer';
import 'katex/dist/katex.min.css';

interface Props {
  paper: Paper; pdf: PDFDocumentProxy; intent?: SelectionIntent | null;
  profileRevision: number; onSettings: () => void; onBusy: (value: boolean) => void;
  onJump: (source: ReadingSource) => void; onError?: (error: unknown) => void;
}
interface RunningRequest { id: string | null; turnId: string; cancelled: boolean; finished: boolean; controller: AbortController }

/** Paper questions use locally selected evidence; selection interactions are persisted with source snapshots. */
export function AiPanel({ paper, pdf, intent, profileRevision, onSettings, onBusy, onJump, onError }: Props) {
  const [profile, setProfile] = useState<AiProfile | null>(null);
  const [profileError, setProfileError] = useState('');
  const [activeIntent, setActiveIntent] = useState<SelectionIntent | null>(intent ?? null);
  const [snapshot, setSnapshot] = useState<ReadingSnapshot | null>(null);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [unsaved, setUnsaved] = useState<AiRecord | null>(null);
  const displayedTurns = useDeferredValue(turns);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const running = useRef<RunningRequest | null>(null);
  const translated = useRef<string | null>(null);
  const mounted = useRef(true);
  const messages = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const history = useMemo(() => boundedHistory(turns), [turns]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; const request = running.current; if (request) { request.cancelled = true; request.controller.abort(); if (request.id) void invoke('cancel_ai_request', { requestId: request.id }).catch(() => undefined); } };
  }, []);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => {
    let live = true; setProfile(null); setProfileError('');
    if (!isTauri()) { setProfileError('AI 请求仅在桌面应用中可用'); return; }
    void invoke<AiProfile>('get_ai_profile').then(value => { if (live) setProfile(value); })
      .catch((reason: unknown) => { if (live) setProfileError(String(reason)); });
    return () => { live = false; };
  }, [profileRevision]);
  useEffect(() => { setActiveIntent(intent ?? null); setQuestion(''); setSnapshot(null); }, [intent?.id]);
  useEffect(() => { if (follow.current && messages.current) messages.current.scrollTop = messages.current.scrollHeight; }, [displayedTurns, busy]);

  const stop = async (): Promise<void> => {
    const request = running.current; if (!request) return;
    request.cancelled = true; request.controller.abort(); setStatus('正在停止…');
    try { if (request.id) await invoke('cancel_ai_request', { requestId: request.id }); }
    catch (reason: unknown) { setStatus(`停止请求失败：${String(reason)}`); }
  };
  const send = async (kind: 'ask' | 'translate', preset?: string): Promise<void> => {
    if (!profile || (profile.requiresKey && !profile.hasKey) || running.current) return;
    const chosen = activeIntent;
    if (kind === 'translate' && !chosen) return;
    const prompt = kind === 'translate' ? '翻译选中的原文，保留公式和学术术语。' : (preset ?? question).trim();
    if (!prompt || new TextEncoder().encode(prompt).length > 2000) return;
    const request: RunningRequest = { id: null, turnId: crypto.randomUUID(), cancelled: false, finished: false, controller: new AbortController() };
    running.current = request; follow.current = true; setBusy(true); setStatus(chosen ? '正在准备选区上下文…' : '正在本机读取论文…');
    let turn: ChatTurn | undefined, record: AiRecord | undefined, recordStarted = false;
    const publish = (): void => { if (mounted.current && turn) { const next = { ...turn }; setTurns(previous => previous.map(item => item.id === next.id ? next : item)); } };
    try {
      const context = chosen ? await buildSelectionSnapshot(pdf, chosen.selection) : await buildPaperSnapshot(pdf, paper.id,
        `${includeHistory ? turns.filter(item => item.status === 'succeeded').slice(-1).map(item => item.question).join(' ') : ''} ${prompt}`,
        request.controller.signal, page => { if (mounted.current) setStatus(`本机提取 ${page} / ${pdf.numPages} 页…`); }, deep ? 48000 : 24000);
      request.controller.signal.throwIfAborted();
      setSnapshot(context);
      turn = { id: request.turnId, model: profile.model, question: prompt, answer: '', sources: context.sources, status: 'running' };
      const initial = { ...turn }; setTurns(previous => [...previous, initial]);
      if (chosen) {
        record = { ...turn, paperId: paper.id, kind, selectedText: chosen.selection.text, createdAt: new Date().toISOString() };
        await saveAiRecord(record); recordStarted = true;
      }
      request.controller.signal.throwIfAborted();
      request.id = await invoke<string>('begin_ai_request');
      if (request.cancelled || !mounted.current) { await invoke('cancel_ai_request', { requestId: request.id }); return; }
      setQuestion(''); setStatus('正在连接模型…');
      const channel = new Channel<AiStreamEvent>();
      channel.onmessage = event => {
        if (request.cancelled || request.finished || !turn || event.requestId !== request.id || event.paperId !== paper.id) return;
        if (event.kind === 'delta') { turn.answer += event.text ?? ''; if (mounted.current) setStatus('正在回答…'); }
        if (event.kind === 'usage') { turn.inputTokens = event.inputTokens; turn.outputTokens = event.outputTokens; }
        publish();
      };
      await invoke('run_ai_action', { input: { requestId: request.id, profileId: profile.profileId, model: profile.model, action: kind,
        question: prompt, context, history: !chosen && includeHistory ? history.messages : [] }, channel });
      turn.status = 'succeeded'; publish();
      if (mounted.current && !request.cancelled) setStatus(chosen ? '回答完成，正在保存到 AI 记录…' : '回答完成，可继续追问');
    } catch (reason: unknown) {
      if (turn) { turn.status = request.cancelled ? 'cancelled' : 'failed'; turn.error = request.cancelled ? undefined : String(reason); publish(); }
      if (mounted.current) setStatus(request.cancelled ? '已停止' : `请求未完成：${String(reason)}`);
    } finally {
      request.finished = true;
      if (turn && request.cancelled) { turn.status = 'cancelled'; publish(); }
      if (record && turn && recordStarted) {
        const completed = { ...record, ...turn };
        try { await saveAiRecord(completed); if (mounted.current && turn.status === 'succeeded') setStatus('已保存到右侧 AI 记录'); }
        catch (reason: unknown) { if (mounted.current) setUnsaved(completed); onError?.(new Error(`AI 记录保存失败：${String(reason)}`)); }
      }
      window.dispatchEvent(new Event('ai-usage-changed'));
      if (request.id) await invoke('cancel_ai_request', { requestId: request.id }).catch(() => undefined);
      if (running.current === request) running.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  useEffect(() => {
    if (activeIntent?.kind === 'translate' && profile && (!profile.requiresKey || profile.hasKey) && !busy && translated.current !== activeIntent.id) {
      translated.current = activeIntent.id; void send('translate');
    }
  }, [activeIntent, profile, busy]);
  const valid = !busy && Boolean(profile && (!profile.requiresKey || profile.hasKey));
  const oversized = new TextEncoder().encode(question.trim()).length > 2000;
  return <div className="flex min-h-0 flex-1 flex-col text-sm">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2"><p className="min-w-0 truncate text-xs text-slate-500" title={profile?.baseUrl}>{profile?.provider ?? '模型服务'} · {profile?.model ?? '读取配置中…'}</p><div className="flex shrink-0 gap-1"><button className="small-button" disabled={busy || !turns.length} onClick={() => { setTurns([]); setStatus(''); setQuestion(''); setSnapshot(null); }}>新对话</button><button className="small-button" onClick={onSettings}>应用设置</button></div></div>
    <div ref={messages} className="min-h-0 flex-1 space-y-4 overflow-auto p-4" aria-label="AI 对话记录" onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {!turns.length && <div className="py-5 text-center text-slate-500"><p className="font-medium text-slate-700">读懂这篇论文</p><p className="mt-2 text-xs leading-6">聊聊创新点、方法与尚未解决的问题。<br/>根据问题从全文中选择证据，避免反复发送所有正文。</p><div className="mt-4 flex flex-wrap justify-center gap-2">{['这篇论文的创新点是什么？','有哪些局限和待解决的问题？','总结主要方法和实验结论'].map(prompt => <button key={prompt} className="small-button border bg-stone-50" disabled={!valid} onClick={() => { void send('ask', prompt); }}>{prompt}</button>)}</div></div>}
      {profileError && <p role="alert" className="text-xs text-red-700">{profileError}</p>}
      {(!profile || (profile.requiresKey && !profile.hasKey)) && <button className="small-button w-full border border-dashed" onClick={onSettings}>前往应用设置配置模型</button>}
      {displayedTurns.map(turn => {
        const rendered = turn.sources.reduce((text, source) => text.split(`[${source.id}]`).join(`[第 ${source.page} 页]`), turn.answer);
        const citations = citedSources(turn.answer, turn.sources);
        return <article key={turn.id} className="space-y-3"><p className="ml-6 whitespace-pre-wrap break-words rounded-xl bg-teal-50 px-3 py-2 text-teal-950">{turn.question}</p><div className="rounded-xl border p-3"><p className="mb-2 text-[10px] text-slate-400">{turn.model}</p>
          {turn.answer ? <MarkdownAnswer text={rendered}/> : <p className="text-xs text-slate-400">{turn.status === 'running' ? '正在等待回答…' : '未收到回答'}</p>}
          {!!citations.length && <div className="mt-3 flex flex-wrap gap-2">{citations.map(source => <button key={source.id} className="small-button border text-teal-700" onClick={() => onJump(source)}>来源 · 第 {source.page} 页 ↗</button>)}</div>}
          {turn.error && <p role="alert" className="mt-2 text-xs text-red-700">{turn.error}</p>}{turn.status === 'cancelled' && <p className="mt-2 text-xs text-amber-800">已停止，内容可能不完整</p>}
          {turn.status !== 'running' && <p className="mt-2 text-[10px] text-slate-400">输入 {turn.inputTokens ?? '未知'} / 输出 {turn.outputTokens ?? '未知'} tokens</p>}
        </div></article>;
      })}
    </div>
    <div className="max-h-[55%] shrink-0 space-y-2 overflow-auto border-t bg-stone-50/70 p-3">
      {activeIntent ? <div className="rounded-lg border border-teal-100 bg-teal-50 p-2 text-xs"><div className="flex justify-between text-teal-800"><span>选区{activeIntent.kind === 'translate' ? '翻译' : '提问'} · 第 {activeIntent.selection.page} 页</span><button disabled={busy} onClick={() => { setActiveIntent(null); setSnapshot(null); }}>返回整篇问答</button></div><p className="mt-1 line-clamp-2 text-slate-600">{activeIntent.selection.text}</p><p className="mt-1 text-[10px] text-slate-400">结合邻近文字理解，原文与回答自动存入右侧 AI 记录。</p></div> : <>
        <div className="flex flex-wrap gap-3 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={includeHistory} disabled={busy} onChange={event => setIncludeHistory(event.target.checked)}/>携带最近对话</label><label className="flex items-center gap-1"><input type="checkbox" checked={deep} disabled={busy} onChange={event => setDeep(event.target.checked)}/>扩大证据预算</label></div>
        <p className="text-[10px] leading-4 text-slate-500">发送前在本机检索全文，正文上限 {deep ? '48' : '24'} KB；不上传 PDF 文件。{includeHistory ? `最近 ${history.messages.length / 2} 轮问答（最多 8 KB）` : '不携带历史'}。{history.omitted && includeHistory ? `已省略 ${history.omitted} 轮。` : ''}整篇对话仅保留在本次会话。</p>
      </>}
      {snapshot && <details className="text-xs"><summary className="cursor-pointer text-teal-700">本次证据 · {snapshot.coverage ? `${snapshot.coverage.selectedPages.length} / ${snapshot.coverage.totalPages} 页 · ${Math.ceil(snapshot.coverage.bytes / 1000)} KB` : '选区及邻近文字'}{snapshot.truncated ? ' · 非完整正文' : ''}</summary><div className="mt-1 max-h-32 overflow-auto rounded border bg-white p-2 text-[11px]">{snapshot.coverage && <p className="mb-2 text-amber-800">{snapshot.coverage.strategy}；可提取文字 {snapshot.coverage.readablePages} / {snapshot.coverage.totalPages} 页。片段可能遗漏细节，可扩大预算或直接选中原文提问。</p>}{snapshot.sources.map(source => <p key={source.id} className="mb-2 whitespace-pre-wrap">第 {source.page} 页：{source.text}</p>)}</div></details>}
      {unsaved && <button className="small-button text-red-700" onClick={() => { void saveAiRecord(unsaved).then(() => setUnsaved(null)).catch((reason: unknown) => onError?.(reason)); }}>记录保存失败，点击重试保存</button>}
      <textarea aria-label="向 AI 提问" className="block w-full resize-none rounded-lg border bg-white p-2 text-sm" rows={2} placeholder={activeIntent ? '针对选中的这段文字提问…' : '这篇论文解决了什么问题？还有哪些局限？'} value={question} disabled={busy} maxLength={2000} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing && valid && !oversized) { event.preventDefault(); void send('ask'); } }}/>
      <div className="flex flex-wrap items-center gap-2"><button className="primary-button" disabled={!valid || !question.trim() || oversized} onClick={() => { void send('ask'); }}>发送问题</button>{activeIntent && <button className="small-button border" disabled={!valid} onClick={() => { void send('translate'); }}>翻译并保存</button>}{busy && <button className="small-button text-red-700" onClick={() => { void stop(); }}>停止</button>}</div><p role="status" className="break-words text-[11px] text-slate-500">{status}</p>
      {oversized && <p className="text-xs text-amber-800">问题超过 2000 字节，请缩短后发送。</p>}
    </div>
  </div>;
}
