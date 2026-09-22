import { useCallback, useMemo, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, FileText, Folder, Highlighter, Library, ListTree, Maximize, MessageSquare, PanelLeft, PanelRight, ShieldCheck, Tags, X } from 'lucide-react';
import { WindowControls } from './components/WindowControls';
import { useDatabase } from './hooks/useDatabase';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { primaryModifierLabel } from './lib/platform';

/** Responsive, offline reader shell. PDF import/rendering belongs to the next step. */
export function App() {
  // Keep desktop panel preferences while CSS presents them as drawers in narrow windows.
  const [leftOpen, setLeftOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [rightOpen, setRightOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  const [focusMode, setFocusMode] = useState(false);
  const [leftTab, setLeftTab] = useState<'shelf' | 'outline'>('shelf');
  const [rightTab, setRightTab] = useState<'notes' | 'annotations'>('notes');
  const [attempt, setAttempt] = useState(0);
  const database = useDatabase(attempt);
  const modifier = primaryModifierLabel();
  const toggleLeft = useCallback(() => {
    setLeftOpen(open => !open);
    if (!window.matchMedia('(min-width: 1024px)').matches) setRightOpen(false);
  }, []);
  const toggleRight = useCallback(() => {
    setRightOpen(open => !open);
    if (!window.matchMedia('(min-width: 1024px)').matches) setLeftOpen(false);
  }, []);
  const toggleFocus = useCallback(() => setFocusMode(value => !value), []);
  const exitFocus = useCallback(() => setFocusMode(false), []);
  const actions = useMemo(() => ({ toggleLeft, toggleRight, toggleFocus, exitFocus }), [toggleLeft, toggleRight, toggleFocus, exitFocus]);
  useKeyboardShortcuts(actions);
  const leftVisible = leftOpen && !focusMode;
  const rightVisible = rightOpen && !focusMode;

  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
    {!focusMode && <header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3 sm:px-5">
      <button className="icon-button" aria-label="切换书架与目录" aria-expanded={leftVisible} aria-controls="left-sidebar" title={`书架与目录 (${modifier}+B)`} onClick={toggleLeft}><PanelLeft size={19} /></button>
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2 self-stretch">
        <BookOpen size={18} className="pointer-events-none shrink-0 text-teal-700" />
        <span className="pointer-events-none truncate text-sm font-semibold tracking-wide">论文阅读器</span>
        <span className="pointer-events-none ml-3 hidden text-xs text-stone-400 sm:inline">你的本地研究空间</span>
      </div>
      <button className="icon-button" aria-label="进入专注模式" title="专注模式 (F11)" onClick={toggleFocus}><Maximize size={17} /></button>
      <button className="icon-button" aria-label="切换笔记与标注" aria-expanded={rightVisible} aria-controls="right-panel" title={`笔记与标注 (${modifier}+Shift+B)`} onClick={toggleRight}><PanelRight size={19} /></button>
      <WindowControls />
    </header>}

    <div className="relative flex min-h-0 flex-1">
      {(leftVisible || rightVisible) && <button className="absolute inset-0 z-10 bg-slate-900/20 lg:hidden" aria-label="收起侧边面板" onClick={() => { setLeftOpen(false); setRightOpen(false); }} />}
      <aside id="left-sidebar" aria-label="书架与目录" hidden={!leftVisible} className={`${leftVisible ? 'flex' : 'hidden'} absolute inset-y-0 left-0 z-20 w-64 max-w-[85vw] shrink-0 flex-col border-r border-stone-200 bg-stone-50 shadow-xl lg:static lg:shadow-none`}>
        <div className="panel-heading"><span>文献库</span><button className="icon-button" aria-label="收起左侧栏" onClick={toggleLeft}><ChevronLeft size={16} /></button></div>
        <nav aria-label="左侧内容" className="flex gap-1 p-3">
          <button aria-pressed={leftTab === 'shelf'} onClick={() => setLeftTab('shelf')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm ${leftTab === 'shelf' ? 'bg-white font-medium text-teal-800 shadow-sm' : 'text-slate-500'}`}><Library size={16} />书架</button>
          <button aria-pressed={leftTab === 'outline'} onClick={() => setLeftTab('outline')} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm ${leftTab === 'outline' ? 'bg-white font-medium text-teal-800 shadow-sm' : 'text-slate-500'}`}><ListTree size={16} />目录</button>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm">
          {leftTab === 'shelf' ? <>
            <div className="flex items-center gap-2 text-slate-600"><FileText size={16} /><span className="flex-1">全部论文</span><span className="text-xs text-slate-400">0</span></div>
            <div className="mt-9 flex items-center gap-2 text-xs font-medium text-slate-500"><Folder size={14} />收藏夹</div><p className="mt-3 text-xs leading-6 text-slate-400">尚无收藏夹</p>
            <div className="mt-7 flex items-center gap-2 text-xs font-medium text-slate-500"><Tags size={14} />标签</div><p className="mt-3 text-xs leading-6 text-slate-400">尚无标签</p>
          </> : <p className="py-6 text-center text-xs leading-6 text-slate-400">打开论文后，<br />在这里浏览章节目录。</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-stone-200 p-5 text-xs text-slate-500"><ShieldCheck size={14} className="text-teal-700" />文件与笔记仅保存在本机</div>
      </aside>

      <main aria-label="主阅读视口" className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-[#f5f4f0]">
        <div className="flex min-h-full flex-col items-center justify-center px-6 py-16 text-center">
          <div className="mb-7 flex h-20 w-20 items-center justify-center rounded-2xl border border-stone-200 bg-white text-teal-700 shadow-sm"><BookOpen size={34} strokeWidth={1.4} /></div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">拖入 PDF 开始阅读</h1>
          <p className="mt-3 max-w-sm text-sm leading-7 text-slate-500">让论文、标注与想法，留在同一个地方。</p>
          <div className="mt-8 w-full max-w-sm rounded-xl border border-dashed border-stone-300 px-5 py-6 text-xs leading-6 text-slate-400">阅读空间已准备好<br />PDF 导入与阅读将在下一步接入</div>
        </div>
      </main>

      <aside id="right-panel" aria-label="笔记与标注" hidden={!rightVisible} className={`${rightVisible ? 'flex' : 'hidden'} absolute inset-y-0 right-0 z-20 w-72 max-w-[85vw] shrink-0 flex-col border-l border-stone-200 bg-white shadow-xl lg:static lg:shadow-none`}>
        <div className="panel-heading"><span>阅读记录</span><button className="icon-button" aria-label="收起右侧栏" onClick={toggleRight}><ChevronRight size={16} /></button></div>
        <nav aria-label="右侧内容" className="flex border-b border-stone-100 px-5">
          <button aria-pressed={rightTab === 'notes'} onClick={() => setRightTab('notes')} className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-4 text-xs ${rightTab === 'notes' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400'}`}><MessageSquare size={14} />笔记</button>
          <button aria-pressed={rightTab === 'annotations'} onClick={() => setRightTab('annotations')} className={`flex flex-1 items-center justify-center gap-2 border-b-2 py-4 text-xs ${rightTab === 'annotations' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-400'}`}><Highlighter size={14} />标注</button>
        </nav>
        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-6 pt-20 text-center text-slate-400">
          {rightTab === 'notes' ? <MessageSquare size={25} strokeWidth={1.3} /> : <Highlighter size={25} strokeWidth={1.3} />}
          <p className="mt-4 text-sm">{rightTab === 'notes' ? '让想法有所归属' : '留下阅读的痕迹'}</p>
          <p className="mt-2 text-xs leading-6">{rightTab === 'notes' ? '论文中的思考与问题，将汇集在这里。' : '选中的段落与区域，将汇集在这里。'}</p>
        </div>
      </aside>
    </div>

    {!focusMode && <footer role="status" className={`flex shrink-0 items-center gap-2 border-t border-stone-200 bg-white px-4 py-2 text-xs ${database.state === 'error' ? 'text-red-700' : 'text-slate-500'}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${database.state === 'ready' ? 'bg-teal-600' : database.state === 'error' ? 'bg-red-600' : 'bg-amber-500'}`} />
      <span className="min-w-0 flex-1 break-words">{database.message}</span>
      {database.state === 'error' && <button onClick={() => setAttempt(value => value + 1)} className="shrink-0 rounded px-2 py-1 underline">重试</button>}
      <span className="hidden shrink-0 text-stone-400 xl:inline">{modifier}+B 书架 · {modifier}+Shift+B 笔记 · F11 专注</span>
    </footer>}
    {focusMode && <button onClick={exitFocus} className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm" title="Esc / F11"><X size={14} />退出专注模式</button>}
  </div>;
}
