import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { findPageMatches, type SearchMatch } from '../pdf/search';
interface Props { pdf:PDFDocumentProxy; onMatch:(match:SearchMatch|null)=>void; onClose:()=>void }
/** Searches pages sequentially through the local PDF worker; closing or changing a query cancels stale results. */
export function PdfSearch({pdf,onMatch,onClose}:Props) {
  const [query,setQuery]=useState('');const [matches,setMatches]=useState<SearchMatch[]>([]);
  const [index,setIndex]=useState(-1);const [scanned,setScanned]=useState(0);const [error,setError]=useState('');
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{input.current?.focus();},[]);
  useEffect(()=>{
    let live=true;setMatches([]);setIndex(-1);setScanned(0);setError('');onMatch(null);
    const timer=window.setTimeout(()=>{void(async()=>{
      if(!query.trim())return;
      const found:SearchMatch[]=[];let selected=false;
      for(let page=1;page<=pdf.numPages;page++) {
        const documentPage=await pdf.getPage(page);if(!live)return;
        const content=await documentPage.getTextContent();if(!live)return;
        found.push(...findPageMatches(content,query,page));
        setScanned(page);setMatches([...found]);
        if(found.length&&!selected){selected=true;setIndex(0);onMatch(found[0]??null);}
        // Yield between pages so typing and cancellation remain responsive on long documents.
        await new Promise<void>(resolve=>window.setTimeout(resolve,0));
      }
    })().catch((reason:unknown)=>{if(live)setError(String(reason));});},250);
    return()=>{live=false;window.clearTimeout(timer);};
  },[pdf,query,onMatch]);
  const move=(direction:number):void=>{if(!matches.length)return;const next=(index+direction+matches.length)%matches.length;setIndex(next);onMatch(matches[next]??null);};
  return <div className="shrink-0 border-b bg-white p-2 text-xs" role="search" aria-label="PDF 文内搜索">
    <div className="flex flex-wrap items-center gap-2"><input id="pdf-find-input" ref={input} aria-label="查找正文" className="min-w-0 flex-1 rounded border p-2" placeholder="查找正文…" value={query} maxLength={200} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.nativeEvent.isComposing)return;if(event.key==='Enter'){event.preventDefault();move(event.shiftKey?-1:1);}if(event.key==='Escape'){event.stopPropagation();onClose();}}}/>
      <span role="status">{matches.length?`${index+1} / ${matches.length}`:query.trim()&&scanned===pdf.numPages?'无匹配':'—'}{query.trim()&&scanned<pdf.numPages?` · ${scanned}/${pdf.numPages} 页`:''}</span>
      <button className="small-button" disabled={!matches.length} onClick={()=>move(-1)}>上一处</button><button className="small-button" disabled={!matches.length} onClick={()=>move(1)}>下一处</button><button className="small-button" onClick={onClose}>关闭</button></div>
    {matches[index]&&<p className="mt-1 truncate text-slate-500">第 {matches[index].page} 页 · {matches[index].excerpt}</p>}{error&&<p role="alert" className="text-red-700">搜索未完成：{error}</p>}
  </div>;
}
