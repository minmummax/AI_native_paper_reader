import { useEffect,useRef,useState } from 'react';
import type { Paper } from '../types';
import * as library from '../services/library';
interface Props {
  paper:Paper; tags:library.LibraryTag[]; collections:library.Collection[];
  onClose:()=>void; onUpdated:(paper:Paper)=>void; onGroupsChanged:()=>void;
}

/** Per-paper naming and classification dialog; group changes persist immediately and preserve the reading position. */
export function PaperOrganizer({paper,tags,collections,onClose,onUpdated,onGroupsChanged}:Props) {
  const [title,setTitle]=useState(paper.title);const [members,setMembers]=useState<{tags:string[];collections:string[]}>({tags:[],collections:[]});
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [newName,setNewName]=useState('');const [kind,setKind]=useState<'tag'|'collection'>('tag');
  const dialog=useRef<HTMLDivElement>(null);const previousFocus=useRef(document.activeElement);
  useEffect(()=>{let live=true;void library.getMemberships(paper.id).then(value=>{if(live)setMembers(value);}).catch((reason:unknown)=>{if(live)setError(String(reason));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[paper.id]);
  useEffect(()=>{const element=previousFocus.current;return()=>{if(element instanceof HTMLElement&&element.isConnected)element.focus();};},[]);
  const update=async(action:()=>Promise<void>):Promise<void>=>{
    setBusy(true);setError('');try{await action();setMembers(await library.getMemberships(paper.id));onGroupsChanged();}catch(reason:unknown){setError(reason instanceof Error?reason.message:String(reason));}finally{setBusy(false);}
  };
  const rename=async(name:string):Promise<void>=>{await update(async()=>{const updated=await library.renamePaper(paper.id,name);setTitle(updated.title);onUpdated(updated);});};
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="organizer-title" className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-6 shadow-xl" onKeyDown={event=>{
      if(event.key==='Escape'){event.stopPropagation();if(!busy)onClose();}
      if(event.key==='Tab'){
        const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]);
        const first=elements[0],last=elements[elements.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }}>
      <div className="mb-5 flex items-center justify-between"><h2 id="organizer-title" className="font-semibold">论文名称与分类</h2><button className="small-button" disabled={busy} onClick={onClose}>完成</button></div>
      <form onSubmit={event=>{event.preventDefault();void rename(title);}}><label className="text-xs font-medium text-slate-600" htmlFor="paper-name">书架显示名称</label><div className="mt-2 flex gap-2"><input id="paper-name" autoFocus maxLength={500} className="min-w-0 flex-1 rounded-lg border p-2 text-sm" value={title} onChange={event=>setTitle(event.target.value)}/><button className="primary-button" disabled={busy||!title.trim()||title.trim()===paper.title}>保存名称</button></div></form>
      {paper.source_name?<div className="mt-2 text-xs text-slate-500"><p className="break-all">原文件：{paper.source_name}</p><button className="mt-1 text-teal-700 underline" disabled={busy} onClick={()=>{void rename(paper.source_name?.replace(/\.pdf$/i,'')??paper.title);}}>使用原文件名</button></div>:<p className="mt-2 text-xs leading-5 text-slate-400">这份旧记录未保留原文件名；可直接改名，或重新导入原 PDF 补回文件名，已有笔记会保留。</p>}
      {error&&<p role="alert" className="mt-3 text-xs text-red-700">{error}</p>}
      <p className="mt-6 text-xs text-slate-500">勾选后立即保存。同一篇论文可以属于多个标签或收藏夹。</p>
      {(['tag','collection'] as const).map(groupKind=><section key={groupKind} className="mt-4"><h3 className="mb-2 text-sm font-semibold">{groupKind==='tag'?'标签':'收藏夹'}</h3><div className="flex flex-wrap gap-2">{(groupKind==='tag'?tags:collections).map(group=><label key={group.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs"><input type="checkbox" disabled={loading||busy} checked={(groupKind==='tag'?members.tags:members.collections).includes(group.id)} onChange={event=>{const enabled=event.target.checked;void update(()=>library.setMembership(paper.id,groupKind,group.id,enabled));}}/>{group.name}</label>)}</div></section>)}
      <form className="mt-5 flex flex-wrap gap-2 border-t pt-4" onSubmit={event=>{event.preventDefault();void update(async()=>{const id=await library.createGroup(kind,newName);await library.setMembership(paper.id,kind,id,true);setNewName('');});}}><select aria-label="为论文新建分类类型" className="rounded-lg border p-2 text-xs" value={kind} onChange={event=>setKind(event.target.value as 'tag'|'collection')}><option value="tag">标签</option><option value="collection">收藏夹</option></select><input aria-label="新分类名称" className="min-w-0 flex-1 rounded-lg border p-2 text-xs" placeholder="如：待读、方法、课题名称" value={newName} maxLength={100} onChange={event=>setNewName(event.target.value)}/><button className="primary-button" disabled={loading||busy||!newName.trim()}>创建并添加</button></form>
    </div>
  </div>;
}
