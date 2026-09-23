import { useEffect,useRef,useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { importArxiv } from '../services/library';
import type { Paper } from '../types';
interface Props { onClose:()=>void; onBusy:(busy:boolean)=>void; onImported:(paper:Paper)=>void }
interface Progress { request_id:string; downloaded:number; total:number|null; stage:'connecting'|'downloading'|'importing' }
/** Explicit arXiv link download; successful PDFs follow the same local persistence path as file imports. */
export function ArxivImportDialog({onClose,onBusy,onImported}:Props) {
  const [input,setInput]=useState('');const [busy,setBusy]=useState(false);const [cancelling,setCancelling]=useState(false);
  const [error,setError]=useState('');const [progress,setProgress]=useState<Progress|null>(null);
  const request=useRef<string|null>(null);const previousFocus=useRef(document.activeElement);
  useEffect(()=>{const element=previousFocus.current;return()=>{if(element instanceof HTMLElement&&element.isConnected)element.focus();};},[]);
  const submit=async():Promise<void>=>{
    if(request.current||!input.trim())return;
    const id=crypto.randomUUID();request.current=id;setBusy(true);onBusy(true);setError('');setCancelling(false);setProgress(null);
    let unlisten:(()=>void)|undefined;
    try {
      unlisten=await listen<Progress>('arxiv-download-progress',event=>{if(event.payload.request_id===id)setProgress(event.payload);});
      const paper=await importArxiv(input.trim(),id);onImported(paper);onClose();
    }catch(reason:unknown){setError(String(reason));}
    finally{unlisten?.();request.current=null;setBusy(false);onBusy(false);}
  };
  const cancel=async():Promise<void>=>{if(!request.current)return;setCancelling(true);try{await invoke('cancel_arxiv_download',{requestId:request.current});}catch(reason:unknown){setError(String(reason));setCancelling(false);}};
  const mb=(bytes:number):string=>(bytes/1024/1024).toFixed(1);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="arxiv-title" className="w-full max-w-lg rounded-xl bg-white p-6" onKeyDown={event=>{
    if(event.key==='Escape'){event.stopPropagation();if(!busy)onClose();}
    if(event.key==='Tab'){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  }}><h2 id="arxiv-title" className="font-semibold">从 arXiv 导入论文</h2><p className="my-3 text-sm leading-6 text-slate-500">粘贴论文网页、PDF 链接或 arXiv 编号。点击下载后连接 arXiv，完成后即可离线阅读。</p>
    <form onSubmit={event=>{event.preventDefault();void submit();}}><label className="text-xs text-slate-600" htmlFor="arxiv-input">论文链接或编号</label><input id="arxiv-input" autoFocus disabled={busy} value={input} maxLength={2048} onChange={event=>setInput(event.target.value)} placeholder="https://arxiv.org/abs/1706.03762" className="mt-2 w-full rounded-lg border p-3 text-sm"/>
    <p className="mt-2 text-xs text-slate-400">支持指定版本，如 1706.03762v2 · 单篇最多 250 MB · 相同 PDF 自动去重</p>
    {busy&&<div role="status" className="mt-4 text-sm text-teal-700">{cancelling?'正在取消，请等待当前网络请求结束…':progress?.stage==='importing'?'下载完成，正在解析并加入书架…':progress?.stage==='downloading'?`已下载 ${mb(progress.downloaded)} MB${progress.total?` / ${mb(progress.total)} MB`:''}`:'正在连接 arXiv…'}{progress?.stage==='downloading'&&progress.total&&<progress className="mt-2 w-full" aria-label="论文下载进度" value={progress.downloaded} max={progress.total}/>}</div>}
    {error&&<p role="alert" className="mt-4 break-words text-sm text-red-700">{error}</p>}
    <div className="mt-5 flex justify-end gap-2">{busy?<button type="button" className="small-button" disabled={cancelling||progress?.stage==='importing'} onClick={()=>{void cancel();}}>取消下载</button>:<><button type="button" className="small-button" onClick={onClose}>关闭</button><button className="primary-button" disabled={!input.trim()}>下载并导入</button></>}</div></form>
  </section></div>;
}
