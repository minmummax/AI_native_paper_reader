import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { exportDrafts,importDrafts,validateDrafts,type NoteDraft } from '../services/drafts';
interface Props { onClose:()=>void; onBusy:(busy:boolean)=>void }
/** Local folder backup and explicit replacement restore; existing data gets a recovery snapshot first. */
export function BackupDialog({onClose,onBusy}:Props) {
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const [selected,setSelected]=useState<{folder:string;drafts:Record<string,NoteDraft>}|null>(null);
  const choose=async():Promise<string|null>=>invoke<string|null>('plugin:dialog|open',{options:{directory:true,multiple:false,title:'选择本地备份文件夹'}});
  const run=async(action:()=>Promise<void>):Promise<void>=>{setBusy(true);onBusy(true);setError('');setMessage('');try{await action();}catch(reason:unknown){setError(String(reason));}finally{setBusy(false);onBusy(false);}};
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"><section role="dialog" aria-modal="true" aria-labelledby="backup-title" className="max-h-[90dvh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();if(!busy)onClose();}if(event.key==='Tab'){const controls=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled)'));const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}}}>
    <h2 id="backup-title" className="font-semibold">本地备份与恢复</h2><p className="my-3 text-sm leading-6 text-slate-500">备份包含书架、PDF、标注、笔记、分类、阅读进度和草稿。请选择本机文件夹，保留生成的整个备份目录。</p>
    <div className="flex flex-wrap gap-2"><button autoFocus className="primary-button" disabled={busy} onClick={()=>{void run(async()=>{const folder=await choose();if(!folder)return;const path=await invoke<string>('create_backup',{folder,drafts:exportDrafts()});setMessage(`备份完成：${path}`);});}}>创建备份</button>
      <button className="small-button" disabled={busy} onClick={()=>{void run(async()=>{const folder=await choose();if(!folder)return;const value=await invoke<{version:number;drafts:unknown}>('inspect_backup',{folder});setSelected({folder,drafts:validateDrafts(value.drafts)});});}}>选择备份恢复</button></div>
    {selected&&<div className="my-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm"><p className="break-all">所选备份：{selected.folder}</p><p className="my-2 leading-6">恢复将替换当前书架和草稿，并重新加载应用。当前资料会先自动备份到本机 recovery 文件夹。</p><button className="primary-button" disabled={busy} onClick={()=>{void run(async()=>{
      const previous=exportDrafts();
      // Verify local storage capacity before the database is replaced; roll back drafts if restore fails.
      importDrafts(selected.drafts);
      try{await invoke<string>('restore_backup',{folder:selected.folder,drafts:previous});}catch(reason:unknown){importDrafts(previous);throw reason;}
      window.location.reload();
    });}}>确认替换并恢复</button><button className="small-button ml-2" disabled={busy} onClick={()=>setSelected(null)}>取消恢复</button></div>}
    {busy&&<p role="status" className="mt-4 text-sm">正在处理本地文件，请稍候…</p>}{message&&<p role="status" className="mt-4 break-all text-sm text-teal-700">{message}</p>}{error&&<p role="alert" className="mt-4 break-all text-sm text-red-700">{error}</p>}
    <div className="mt-5 text-right"><button className="small-button" disabled={busy} onClick={onClose}>关闭</button></div>
  </section></div>;
}
