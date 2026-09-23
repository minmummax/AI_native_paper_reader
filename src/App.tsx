import { useCallback,useEffect,useMemo,useRef,useState,type CSSProperties } from 'react';
import { isTauri,invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { BookOpen,ChevronLeft,ChevronRight,FolderOpen,Maximize,PanelLeft,PanelRight,RotateCw,Search,ShieldCheck,Upload,X } from 'lucide-react';
import type { Annotation,Note,Paper,ReaderTool } from './types';
import { ArxivImportDialog } from './components/ArxivImportDialog';
import { BackupDialog } from './components/BackupDialog';
import { PdfSearch } from './components/PdfSearch';
import type { SearchMatch } from './pdf/search';
import { writeDraft } from './services/drafts';
import { WindowControls } from './components/WindowControls';
import { DocumentNavigation } from './components/DocumentNavigation';
import { NotesPanel } from './components/NotesPanel';
import { LibraryShelf } from './components/LibraryShelf';
import { PaperOrganizer } from './components/PaperOrganizer';
import { PanelResizer } from './components/PanelResizer';
import { useDatabase } from './hooks/useDatabase';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { usePdfDocument } from './hooks/usePdfDocument';
import { primaryModifierLabel } from './lib/platform';
import { PdfReader,type ReaderHandle } from './pdf/PdfReader';
import type { SelectionDraft } from './pdf/PdfPage';
import * as library from './services/library';
import 'pdfjs-dist/web/pdf_viewer.css';

/** Offline library and virtualized reader with persisted annotations, notes and local organization. */
export function App() {
  const [arxivOpen,setArxivOpen]=useState(false);const arxivBusy=useRef(false);
  const [backupOpen,setBackupOpen]=useState(false);const backupBusy=useRef(false);
  const [findOpen,setFindOpen]=useState(false);const [searchMatch,setSearchMatch]=useState<SearchMatch|null>(null);
  const [leftOpen,setLeftOpen]=useState(()=>window.matchMedia('(min-width: 1024px)').matches);
  const [rightOpen,setRightOpen]=useState(()=>window.matchMedia('(min-width: 1024px)').matches);
  const [focusMode,setFocusMode]=useState(false);const [leftTab,setLeftTab]=useState<'shelf'|'outline'>('shelf');
  const [attempt,setAttempt]=useState(0);const database=useDatabase(attempt);
  const [papers,setPapers]=useState<library.ShelfPaper[]>([]);const [active,setActive]=useState<Paper|null>(null);
  const [query,setQuery]=useState('');const [filter,setFilter]=useState<library.LibraryFilter>({});
  const [tags,setTags]=useState<library.LibraryTag[]>([]);const [collections,setCollections]=useState<library.Collection[]>([]);
  const [membership,setMembership]=useState<{tags:string[];collections:string[]}>({tags:[],collections:[]});
  const [notes,setNotes]=useState<Note[]>([]);const [annotations,setAnnotations]=useState<Annotation[]>([]);
  const [anchor,setAnchor]=useState<Annotation|null>(null);const [page,setPage]=useState(1);const [pageInput,setPageInput]=useState('1');
  const [zoom,setZoom]=useState(1);const [rotation,setRotation]=useState(0);
  const [mode,setMode]=useState<ReaderTool>('select');const [color,setColor]=useState('#FFE066');
  const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const busyRef=useRef(false);const cancelImport=useRef(false);
  const [revision,setRevision]=useState(0);
  const [organizing,setOrganizing]=useState<Paper|null>(null);
  const [leftWidth,setLeftWidth]=useState(280);const [rightWidth,setRightWidth]=useState(320);
  const [windowWidth,setWindowWidth]=useState(window.innerWidth);const searchRef=useRef<HTMLInputElement>(null);
  const [deletePending,setDeletePending]=useState<{kind:'paper'|'annotation'|'note'|'tag'|'collection';id:string}|null>(null);
  const [dirty,setDirty]=useState(false);const [settingsLoaded,setSettingsLoaded]=useState(false);
  const initialized=useRef(false);const activeRef=useRef<string|null>(null);activeRef.current=active?.id??null;
  const reader=useRef<ReaderHandle>(null);const {pdf,loading,error:pdfError}=usePdfDocument(active?.id??null);
  const modifier=primaryModifierLabel();
  const report=useCallback((reason:unknown)=>setError(reason instanceof Error?reason.message:String(reason)),[]);
  const toggleLeft=useCallback(()=>{setLeftOpen(open=>!open);if(!window.matchMedia('(min-width: 1024px)').matches)setRightOpen(false);},[]);
  const toggleRight=useCallback(()=>{setRightOpen(open=>!open);if(!window.matchMedia('(min-width: 1024px)').matches)setLeftOpen(false);},[]);
  const toggleFocus=useCallback(()=>setFocusMode(value=>!value),[]);const exitFocus=useCallback(()=>setFocusMode(false),[]);
  const focusSearch=useCallback(()=>{setFocusMode(false);setLeftOpen(true);setLeftTab('shelf');if(!window.matchMedia('(min-width: 1024px)').matches)setRightOpen(false);window.requestAnimationFrame(()=>{searchRef.current?.focus();searchRef.current?.select();});},[]);
  const findInPdf=useCallback(()=>{setFindOpen(true);setFocusMode(false);if(!window.matchMedia('(min-width: 1024px)').matches){setLeftOpen(false);setRightOpen(false);}window.requestAnimationFrame(()=>document.getElementById('pdf-find-input')?.focus());},[]);
  const actions=useMemo(()=>({toggleLeft,toggleRight,toggleFocus,exitFocus,focusSearch,findInPdf}),[toggleLeft,toggleRight,toggleFocus,exitFocus,focusSearch,findInPdf]);useKeyboardShortcuts(actions);
  const selectPaper=useCallback((paper:Paper)=>{
    if(activeRef.current===paper.id){setActive(paper);return;}
    if(dirty&&!window.confirm('当前草稿自动保存失败，是否仍然切换论文？'))return;
    setSearchMatch(null);setFindOpen(false);setDirty(false);setActive(paper);setPage(paper.last_read_page??1);setZoom(1);setRotation(0);setMode('select');setAnchor(null);setAnnotations([]);setNotes([]);
    void library.saveSetting('active_paper',paper.id).catch(report);
  },[dirty,report]);
  useEffect(()=>{setPageInput(String(page));},[page]);
  useEffect(()=>{
    if(database.state!=='ready')return;let live=true;
    const timer=window.setTimeout(()=>{void library.getPapers({query,...filter}).then(value=>{if(live)setPapers(value);}).catch(report);},150);
    return()=>{live=false;window.clearTimeout(timer);};
  },[database.state,query,filter,revision,report]);
  useEffect(()=>{
    if(database.state!=='ready')return;let live=true;
    void library.getGroups().then(value=>{if(live){setTags(value.tags);setCollections(value.collections);}}).catch(report);
    return()=>{live=false;};
  },[database.state,revision,report]);
  useEffect(()=>{
    if(database.state!=='ready'||initialized.current)return;initialized.current=true;
    void (async()=>{
      const [layout,id]=await Promise.all([library.getSetting('layout'),library.getSetting('active_paper')]);
      if(layout){const value:unknown=JSON.parse(layout);if(typeof value==='object'&&value!==null){
        if('left' in value&&'right' in value&&typeof value.left==='boolean'&&typeof value.right==='boolean'&&window.matchMedia('(min-width: 1024px)').matches){setLeftOpen(value.left);setRightOpen(value.right);}
        if('leftWidth' in value&&typeof value.leftWidth==='number'&&Number.isFinite(value.leftWidth))setLeftWidth(Math.max(220,Math.min(480,value.leftWidth)));
        if('rightWidth' in value&&typeof value.rightWidth==='number'&&Number.isFinite(value.rightWidth))setRightWidth(Math.max(260,Math.min(560,value.rightWidth)));
      }}
      if(id){const all=await library.getPapers();const found=all.find(paper=>paper.id===id);if(found&&!activeRef.current){setActive(found);setPage(found.last_read_page??1);}}
    })().catch(report).finally(()=>setSettingsLoaded(true));
  },[database.state,report]);
  useEffect(()=>{
    if(!settingsLoaded)return;
    const timer=window.setTimeout(()=>{void library.saveSetting('layout',JSON.stringify({left:leftOpen,right:rightOpen,leftWidth,rightWidth})).catch(report);},250);
    return()=>window.clearTimeout(timer);
  },[leftOpen,rightOpen,leftWidth,rightWidth,settingsLoaded,report]);
  useEffect(()=>{const resize=():void=>setWindowWidth(window.innerWidth);window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
  const refreshDetails=useCallback(async(id:string)=>{
    const [newNotes,newAnnotations,newMembership]=await Promise.all([library.getNotes(id),library.getAnnotations(id),library.getMemberships(id)]);
    if(activeRef.current===id){setNotes(newNotes);setAnnotations(newAnnotations);setMembership(newMembership);}
  },[]);
  useEffect(()=>{if(active)void refreshDetails(active.id).catch(report);},[active,revision,refreshDetails,report]);
  useEffect(()=>{
    const listener=(event:BeforeUnloadEvent):void=>{if(dirty){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',listener);return()=>window.removeEventListener('beforeunload',listener);
  },[dirty]);
  useEffect(()=>{
    if(!isTauri())return;
    let stopped=false;let dispose:(()=>void)|undefined;
    void getCurrentWebviewWindow().onCloseRequested(event=>{if(backupBusy.current||arxivBusy.current){event.preventDefault();setNotice('文件操作进行中，请完成或取消后再关闭');}else if(dirty&&!window.confirm('草稿自动保存失败，仍然关闭窗口？')){event.preventDefault();}}).then(unlisten=>{if(stopped)unlisten();else dispose=unlisten;}).catch(report);
    return()=>{stopped=true;dispose?.();};
  },[report,dirty]);
  const importPaths=useCallback(async(paths:string[])=>{
    if(busyRef.current||backupBusy.current||!paths.length)return;busyRef.current=true;cancelImport.current=false;setBusy(true);setError('');
    let success=0;const failures:string[]=[];let last:Paper|undefined;
    try{
      for(const [index,path] of paths.entries()){
        if(cancelImport.current)break;
        setNotice(`正在导入 ${index+1} / ${paths.length}…`);
        try{last=await library.importPaper(path);success+=1;}catch(reason:unknown){failures.push(`${path}：${reason instanceof Error?reason.message:String(reason)}`);}
      }
      setRevision(value=>value+1);setNotice(`${cancelImport.current?'已停止。':''}已处理 ${success} 份 PDF（相同内容自动去重）${failures.length?`，失败 ${failures.length} 份`:''}`);
      if(failures.length)setError(failures.join('\n'));
      if(last)selectPaper(last);
    }finally{busyRef.current=false;setBusy(false);}
  },[selectPaper]);
  const choose=async(folder:boolean):Promise<void>=>{try{await importPaths(await library.chooseImports(folder));}catch(reason:unknown){report(reason);}};
  useEffect(()=>{
    if(!isTauri()||database.state!=='ready')return;
    let dispose:(()=>void)|undefined;let stopped=false;
    void getCurrentWebviewWindow().onDragDropEvent(event=>{
      if(event.payload.type!=='drop')return;
      const paths=event.payload.paths;
      void (async()=>{
        const expanded:string[]=[];
        for(const path of paths){if(/\.pdf$/i.test(path))expanded.push(path);else expanded.push(...await invoke<string[]>('scan_folder',{folderPath:path}));}
        await importPaths(expanded);
      })().catch(report);
    }).then(unlisten=>{if(stopped)unlisten();else dispose=unlisten;}).catch(report);
    return()=>{stopped=true;dispose?.();};
  },[database.state,importPaths,report]);
  const jump=useCallback((next:number)=>{if(Number.isFinite(next))reader.current?.jumpTo(next);},[]);
  const showMatch=useCallback((match:SearchMatch|null)=>{setSearchMatch(match);if(match)reader.current?.jumpTo(match.page);},[]);
  const jumpToAnnotation=useCallback((id:string)=>{
    const annotation=annotations.find(item=>item.id===id);
    if(!annotation)return;
    if(!reader.current){setNotice('论文正在加载，请稍后定位标注');return;}
    reader.current.jumpToAnnotation(annotation);
    if(!window.matchMedia('(min-width: 1024px)').matches){setLeftOpen(false);setRightOpen(false);}
  },[annotations]);
  const onPage=useCallback((next:number)=>{setPage(next);if(activeRef.current)void library.saveProgress(activeRef.current,next).catch(report);},[report]);
  const onSelection=(draft:SelectionDraft):void=>{
    if(!active||mode==='select')return;const id=active.id;
    setMode('select');
    void library.saveAnnotation({paper_id:id,page_number:draft.page,type:draft.type,color,selected_text:draft.text||null,rects:draft.rects}).then(async annotation=>{
      if(activeRef.current===id)setNotice(`已保存第 ${annotation.page_number} 页标注，可在右侧“标注”中查看`);
      await refreshDetails(id);
    }).catch(report);
  };
  const remove=async():Promise<void>=>{
    if(!deletePending)return;
    const {kind,id}=deletePending;
    try{await library.deleteRecord(kind,id);setDeletePending(null);setRevision(value=>value+1);
      if(kind==='paper')writeDraft(id,null);
      if(kind==='paper'&&active?.id===id){setActive(null);setDirty(false);await library.saveSetting('active_paper','');}
      if(kind==='annotation'&&anchor?.id===id)setAnchor(null);
      if(kind==='tag'||kind==='collection')setFilter({});
    }catch(reason:unknown){report(reason);}
  };
  const leftVisible=leftOpen&&!focusMode,rightVisible=rightOpen&&!focusMode;
  // Keep at least 360 CSS pixels for reading; oversized preferences shrink proportionally on smaller windows.
  const available=Math.max(480,windowWidth-376);
  const minimum=(leftVisible?220:0)+(rightVisible?260:0);
  const extra=(leftVisible?leftWidth-220:0)+(rightVisible?rightWidth-260:0);
  const factor=extra>0?Math.min(1,Math.max(0,(available-minimum)/extra)):1;
  const displayedLeft=220+(leftWidth-220)*factor,displayedRight=260+(rightWidth-260)*factor;
  const layoutStyle={ '--left-panel-width':`${displayedLeft}px`,'--right-panel-width':`${displayedRight}px` } as CSSProperties;
  const leftMax=Math.max(220,Math.min(480,windowWidth-376-(rightVisible?displayedRight:0)));
  const rightMax=Math.max(260,Math.min(560,windowWidth-376-(leftVisible?displayedLeft:0)));
  const ready=database.state==='ready';
  return <div style={layoutStyle} className="flex h-dvh min-h-0 flex-col overflow-hidden">
    {!focusMode&&<header className="flex h-14 shrink-0 items-center gap-2 border-b border-stone-200 bg-white px-3 sm:px-5">
      <button className="icon-button" aria-label="切换书架与目录" aria-expanded={leftVisible} title={`书架 (${modifier}+B)`} onClick={toggleLeft}><PanelLeft size={19}/></button>
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center gap-2 self-stretch"><BookOpen size={18} className="pointer-events-none shrink-0 text-teal-700"/><span className="pointer-events-none truncate text-sm font-semibold">{active?.title||'论文阅读器'}</span></div>
      <button className="icon-button" aria-label="快速检索论文" title={`${modifier}+K 检索论文`} onClick={focusSearch}><Search size={17}/></button>
      <button className="icon-button" aria-label="导入 PDF" title="导入 PDF" disabled={!ready||busy} onClick={()=>{void choose(false);}}><Upload size={17}/></button>
      <button className="icon-button" aria-label="打开文件夹" title="扫描文件夹" disabled={!ready||busy} onClick={()=>{void choose(true);}}><FolderOpen size={17}/></button>
      <button className="small-button" disabled={!ready||busy} onClick={()=>setArxivOpen(true)}>arXiv 导入</button>
      <button className="small-button" disabled={!ready||busy} onClick={()=>setBackupOpen(true)}>备份</button>
      <button className="icon-button" aria-label="进入专注模式" title="专注模式 (F11)" onClick={toggleFocus}><Maximize size={17}/></button>
      <button className="icon-button" aria-label="切换笔记与标注" aria-expanded={rightVisible} title={`笔记 (${modifier}+Shift+B)`} onClick={toggleRight}><PanelRight size={19}/></button><WindowControls/>
    </header>}
    {error&&<div role="alert" className="flex max-h-28 shrink-0 gap-3 overflow-auto border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700"><p className="flex-1 whitespace-pre-wrap break-all">{error}</p><button className="self-start" aria-label="关闭错误提示" onClick={()=>setError('')}><X size={15}/></button></div>}
    <div className="relative flex min-h-0 flex-1">
      {(leftVisible||rightVisible)&&<button className="absolute inset-0 z-10 bg-slate-900/20 lg:hidden" aria-label="收起侧边面板" onClick={()=>{setLeftOpen(false);setRightOpen(false);}}/>}
      <aside aria-label="书架与目录" className={`${leftVisible?'flex':'hidden'} absolute inset-y-0 left-0 z-20 left-panel-width max-w-[85vw] shrink-0 flex-col border-r border-stone-200 bg-stone-50 shadow-xl lg:static lg:shadow-none`}>
        <div className="panel-heading"><span>文献库</span><button className="icon-button" aria-label="收起左侧栏" onClick={toggleLeft}><ChevronLeft size={16}/></button></div>
        <nav className="flex gap-1 p-3">{(['shelf','outline'] as const).map(tab=><button key={tab} onClick={()=>setLeftTab(tab)} className={`flex-1 rounded-lg py-2 text-sm ${leftTab===tab?'bg-white font-medium text-teal-800 shadow-sm':'text-slate-500'}`}>{tab==='shelf'?'书架':'目录'}</button>)}</nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {leftTab==='outline'?(pdf?<DocumentNavigation pdf={pdf} page={page} jump={jump} onError={report}/>:<p className="py-8 text-center text-xs text-slate-400">打开论文后浏览目录与缩略图</p>):<>
            <LibraryShelf papers={papers} activeId={active?.id??null} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} tags={tags} collections={collections} searchRef={searchRef} modifier={modifier} onSelect={selectPaper} onOrganize={setOrganizing} onDelete={(kind,id)=>setDeletePending({kind,id})}/>
          </>}
        </div><div className="flex items-center gap-2 border-t border-stone-200 p-4 text-xs text-slate-500"><ShieldCheck size={14} className="text-teal-700"/>文件与笔记仅保存在本机</div>
      </aside>
      {leftVisible&&<PanelResizer side="left" width={displayedLeft} min={220} max={leftMax} onChange={setLeftWidth} onReset={()=>setLeftWidth(280)}/>}
      <main aria-label="主阅读视口" className="relative flex min-w-0 flex-1 flex-col bg-[#f5f4f0]">
        {active&&pdf?<>
          {!focusMode&&<div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-b border-stone-200 bg-white/80 px-3 py-2">
            <button className="small-button" aria-label="上一页" disabled={page<=1} onClick={()=>jump(page-1)}>‹</button><form className="flex items-center gap-1 text-xs" onSubmit={event=>{event.preventDefault();jump(Number(pageInput));}}><input className="w-10 rounded border p-1 text-center" aria-label="页码" value={pageInput} onChange={event=>setPageInput(event.target.value)} inputMode="numeric"/><span>/ {pdf.numPages}</span></form><button className="small-button" aria-label="下一页" disabled={page>=pdf.numPages} onClick={()=>jump(page+1)}>›</button>
            <select aria-label="缩放" className="rounded border p-1 text-xs" value={zoom} onChange={event=>setZoom(Number(event.target.value))}>{[0.5,0.75,1,1.25,1.5,2].map(value=><option key={value} value={value}>{value===1?'适合宽度':`${value*100}%`}</option>)}</select><button className="small-button" aria-label="顺时针旋转" onClick={()=>setRotation(value=>(value+90)%360)}><RotateCw size={14}/></button>
            <select aria-label="标注工具" className="rounded border p-1 text-xs" value={mode} onChange={event=>{window.getSelection()?.removeAllRanges();setMode(event.target.value as ReaderTool);}}><option value="select">选择文字（不标注）</option><option value="highlight">文字高亮</option><option value="underline">下划线</option><option value="area">区域框选</option></select>
            <div className="flex gap-1" aria-label="标注颜色">{['#FFE066','#86EFAC','#93C5FD','#F9A8D4'].map(value=><button key={value} className={`h-5 w-5 rounded-full border-2 ${value===color?'border-slate-600':'border-white'}`} style={{backgroundColor:value}} aria-label={`颜色 ${value}`} aria-pressed={value===color} onClick={()=>setColor(value)}/>)}</div>
          </div>}
          {!focusMode&&<button className="small-button self-end mr-3" title={`${modifier}+F`} onClick={findInPdf}>查找正文</button>}
          {findOpen&&<PdfSearch key={active.id} pdf={pdf} onMatch={showMatch} onClose={()=>{setFindOpen(false);setSearchMatch(null);}}/>}
          <PdfReader searchMatch={searchMatch} key={active.id} ref={reader} pdf={pdf} zoom={zoom} rotation={rotation} initialPage={active.last_read_page??1} annotations={annotations} mode={mode} onError={report} onPage={onPage} onSelection={onSelection} onAnnotation={id=>{setAnchor(annotations.find(item=>item.id===id)??null);setRightOpen(true);}}/>
        </>:active?<div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">{loading?'正在加载本地 PDF…':pdfError||'正在准备阅读器…'}</div>:<div className="flex flex-1 flex-col items-center justify-center overflow-auto px-6 py-12 text-center"><div className="mb-7 flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-white text-teal-700 shadow-sm"><BookOpen size={34} strokeWidth={1.4}/></div><h1 className="text-xl font-semibold sm:text-2xl">拖入 PDF 开始阅读</h1><p className="mt-3 text-sm leading-7 text-slate-500">让论文、标注与想法，留在同一个地方。</p><div className="mt-7 flex flex-wrap justify-center gap-3"><button className="primary-button" disabled={!ready||busy} onClick={()=>{void choose(false);}}>选择 PDF</button><button className="small-button border bg-white" disabled={!ready||busy} onClick={()=>{void choose(true);}}>打开文件夹</button></div><p className="mt-5 text-xs leading-6 text-slate-400">{ready?'支持文件拖入与 arXiv 链接导入 · 本地保存 · 自动去重':'浏览器仅预览布局，请在桌面应用中导入 PDF'}</p></div>}
      </main>
      {rightVisible&&<PanelResizer side="right" width={displayedRight} min={260} max={rightMax} onChange={setRightWidth} onReset={()=>setRightWidth(320)}/>}
      <aside aria-label="笔记与标注" className={`${rightVisible?'flex':'hidden'} absolute inset-y-0 right-0 z-20 right-panel-width max-w-[85vw] shrink-0 flex-col border-l border-stone-200 bg-white shadow-xl lg:static lg:shadow-none`}>
        <div className="panel-heading"><span>阅读记录</span><button className="icon-button" aria-label="收起右侧栏" onClick={toggleRight}><ChevronRight size={16}/></button></div>
        {active?<NotesPanel key={active.id} paper={active} page={page} notes={notes} annotations={annotations} anchor={anchor} tags={tags} collections={collections} membership={membership} onDirty={setDirty} onAnchor={setAnchor} onJump={jump} onJumpAnnotation={jumpToAnnotation} onOrganize={()=>setOrganizing(active)}
          onSave={async(input,id)=>{await library.saveNote(input,id);await refreshDetails(input.paper_id);setRevision(value=>value+1);}}
          onDelete={(kind,id)=>setDeletePending({kind,id})} onMembership={(kind,id,enabled)=>{void library.setMembership(active.id,kind,id,enabled).then(()=>refreshDetails(active.id)).then(()=>setRevision(value=>value+1)).catch(report);}}/>:<p className="px-6 pt-20 text-center text-xs leading-7 text-slate-400">打开一份论文，<br/>开始记录思考与问题。</p>}
      </aside>
    </div>
    {!focusMode&&<footer role="status" className={`flex shrink-0 items-center gap-2 border-t border-stone-200 bg-white px-4 py-2 text-xs ${database.state==='error'?'text-red-700':'text-slate-500'}`}><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ready?'bg-teal-600':'bg-amber-500'}`}/><span className="min-w-0 flex-1 truncate" title={notice||database.message}>{notice||database.message}</span>{busy&&!arxivOpen&&<button className="underline" onClick={()=>{cancelImport.current=true;}}>停止导入</button>}{database.state==='error'&&<button className="underline" onClick={()=>setAttempt(value=>value+1)}>重试</button>}<span className="hidden shrink-0 text-stone-400 xl:inline">{modifier}+B 书架 · {modifier}+Shift+B 笔记 · F11 专注</span></footer>}
    {focusMode&&<div className="fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border bg-white px-4 py-2 text-xs shadow-sm">{pdf&&<><button aria-label="上一页" onClick={()=>jump(page-1)}>‹</button><span>{page} / {pdf.numPages}</span><button aria-label="下一页" onClick={()=>jump(page+1)}>›</button></>}<button onClick={exitFocus}>退出专注</button></div>}
    {arxivOpen&&<ArxivImportDialog onClose={()=>setArxivOpen(false)} onBusy={value=>{arxivBusy.current=value;busyRef.current=value;setBusy(value);}} onImported={paper=>{setRevision(value=>value+1);selectPaper(paper);setNotice('arXiv 论文已保存到本机，可离线阅读');}}/>}
    {backupOpen&&<BackupDialog onBusy={value=>{backupBusy.current=value;}} onClose={()=>setBackupOpen(false)}/>}
    {organizing&&<PaperOrganizer key={organizing.id} paper={organizing} tags={tags} collections={collections} onClose={()=>setOrganizing(null)} onGroupsChanged={()=>setRevision(value=>value+1)} onUpdated={paper=>{setOrganizing(paper);setActive(current=>current?.id===paper.id?{...current,title:paper.title,source_name:paper.source_name}:current);setRevision(value=>value+1);}}/>}
    {deletePending&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-6"><div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"><h2 id="delete-title" className="font-semibold">确认删除？</h2><p className="my-4 text-sm leading-6 text-slate-500">{deletePending.kind==='paper'?'将移除书架记录及其笔记和标注。原始 PDF 与托管副本会保留。':deletePending.kind==='annotation'?'删除标注后，关联笔记会保留并解除关联。':'此记录将从本地数据库删除。'}</p><div className="flex justify-end gap-3"><button autoFocus className="small-button" onClick={()=>setDeletePending(null)}>取消</button><button className="rounded-lg bg-red-700 px-4 py-2 text-xs text-white" onClick={()=>{void remove();}}>确认删除</button></div></div></div>}
  </div>;
}
