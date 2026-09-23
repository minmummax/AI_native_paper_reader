import { useEffect,useLayoutEffect,useState } from 'react';
import type { Annotation,Note,NoteInput,NoteType,Paper,Tag } from '../types';
import { readDraft,writeDraft,type NoteDraft } from '../services/drafts';
import { AnnotationExcerpt } from './AnnotationExcerpt';
import type { Collection } from '../services/library';
interface Props {
  paper:Paper; page:number; notes:Note[]; annotations:Annotation[]; anchor:Annotation|null;
  tags:Tag[]; collections:Collection[]; membership:{tags:string[];collections:string[]};
  onSave:(input:NoteInput,id?:string)=>Promise<void>; onDelete:(kind:'note'|'annotation',id:string)=>void;
  onOrganize:()=>void;
  onJumpAnnotation:(id:string)=>void;
  onJump:(page:number)=>void; onAnchor:(annotation:Annotation|null)=>void;
  onMembership:(kind:'tag'|'collection',id:string,enabled:boolean)=>void; onDirty:(dirty:boolean)=>void;
}
const noteLabels:Record<NoteType,string>={thought:'思考',question:'问题',critique:'评议',idea:'想法'};

/** Edits local Markdown source notes and browses page-linked annotations without executing HTML. */
export function NotesPanel({paper,page,notes,annotations,anchor,tags,collections,membership,onSave,onDelete,onJump,onJumpAnnotation,onAnchor,onMembership,onDirty,onOrganize}:Props) {
  const [tab,setTab]=useState<'notes'|'annotations'|'details'>('notes');
  const [recovered]=useState(()=>{try{return {draft:readDraft(paper.id),error:''};}catch(reason:unknown){return {draft:null,error:String(reason)};}});
  const [text,setText]=useState(recovered.draft?.text??'');const [kind,setKind]=useState<NoteType>(recovered.draft?.kind??'thought');
  const [draftPage,setDraftPage]=useState(recovered.draft?.page??page);
  const [restoredAnchor,setRestoredAnchor]=useState(recovered.draft?.annotationId??null);
  const [draftStatus,setDraftStatus]=useState(recovered.draft?'已恢复上次草稿':'');
  const [storageError,setStorageError]=useState(recovered.error);
  const [editing,setEditing]=useState<Pick<Note,'id'|'annotation_id'|'page_number'>|null>(recovered.draft?.editingId?{id:recovered.draft.editingId,annotation_id:recovered.draft.annotationId,page_number:recovered.draft.page}:null);const [saving,setSaving]=useState(false);const [error,setError]=useState('');
  const anchorId=editing?editing.annotation_id:anchor?.id??restoredAnchor;
  const displayedAnchor=anchor??annotations.find(item=>item.id===restoredAnchor)??null;
  useLayoutEffect(()=>{
    if(recovered.error)return;
    const draft:NoteDraft={text,kind,editingId:editing?.id??null,annotationId:anchorId,page:editing?.page_number??anchor?.page_number??draftPage};
    try{writeDraft(paper.id,text.length?draft:null);setStorageError('');setDraftStatus(text.length?'草稿已自动保存在本机':'');}catch(reason:unknown){setStorageError(`草稿保存失败：${String(reason)}`);}
  },[paper.id,text,kind,editing,anchor,restoredAnchor,draftPage,recovered.error,anchorId]);
  useEffect(()=>onDirty(Boolean(storageError)&&text.length>0),[text,storageError,onDirty]);
  useEffect(()=>{if(anchor)setTab('notes');},[anchor]);
  const save=async():Promise<void>=>{
    setSaving(true);setError('');
    try {await onSave({paper_id:paper.id,annotation_id:annotations.some(item=>item.id===anchorId)?anchorId:null,page_number:editing?editing.page_number:anchor?.page_number??draftPage,note_type:kind,content_markdown:text},editing?.id);setText('');setEditing(null);setRestoredAnchor(null);onAnchor(null);}
    catch(reason:unknown){setError(reason instanceof Error?reason.message:String(reason));}
    finally{setSaving(false);}
  };
  return <>
    <div className="border-b px-4 py-2"><button className="text-xs text-teal-700" onClick={onOrganize}>✎ 论文改名 / 添加标签 / 收藏夹</button></div>
    <nav className="flex shrink-0 border-b px-3">{(['notes','annotations','details'] as const).map(value=><button key={value} onClick={()=>setTab(value)} className={`flex-1 border-b-2 py-3 text-xs ${tab===value?'border-teal-700 text-teal-800':'border-transparent text-slate-400'}`}>{value==='notes'?`笔记 ${notes.length}`:value==='annotations'?`标注 ${annotations.length}`:'资料'}</button>)}</nav>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {tab==='notes'&&<>
        <form className="rounded-xl border border-stone-200 bg-stone-50 p-3" onSubmit={event=>{event.preventDefault();void save();}}>
          <div className="mb-2 flex items-center justify-between"><select aria-label="笔记类型" disabled={saving} value={kind} onChange={event=>setKind(event.target.value as NoteType)} className="rounded border bg-white p-1 text-xs">{Object.entries(noteLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><span className="text-[10px] text-slate-400">第 {editing?.page_number??anchor?.page_number??(text.length?draftPage:page)} 页</span></div>
          {displayedAnchor&&!editing&&<div className="mb-2 flex items-start gap-2 rounded border-l-2 border-teal-600 bg-white px-2 text-xs"><AnnotationExcerpt key={displayedAnchor.id} text={displayedAnchor.selected_text} label={`引用 · 第 ${displayedAnchor.page_number} 页`}/><button type="button" className="shrink-0 py-1.5 text-[10px] text-slate-400" aria-label="取消关联标注" disabled={saving} onClick={()=>{setDraftPage(displayedAnchor.page_number);setRestoredAnchor(null);onAnchor(null);}}>取消</button></div>}

          <textarea aria-label="笔记内容" value={text} disabled={saving||Boolean(recovered.error)} onChange={event=>{if(!text.length&&!editing)setDraftPage(anchor?.page_number??(restoredAnchor?draftPage:page));setText(event.target.value);}} rows={5} placeholder="记录思考或问题…（支持 Markdown 源文）" className="w-full resize-y rounded border border-stone-200 bg-white p-2 text-sm"/>
          {draftStatus&&<p role="status" className="text-[10px] text-teal-700">{draftStatus}</p>}{storageError&&<p role="alert" className="text-xs text-red-700">{storageError}</p>}
          {error&&<p role="alert" className="text-xs text-red-700">{error}</p>}
          <div className="mt-2 flex gap-2"><button className="primary-button flex-1" disabled={saving||!text.trim()}>{saving?'保存中…':editing?'保存修改':'保存笔记'}</button>{text.length>0&&<button type="button" disabled={saving} className="small-button" onClick={()=>{setEditing(null);setText('');setRestoredAnchor(null);onAnchor(null);}}>丢弃草稿</button>}</div>
        </form>
        {!notes.length&&<p className="py-8 text-center text-xs text-slate-400">论文中的思考与问题，将汇集在这里。</p>}
        <div className="mt-4 space-y-3">{notes.map(note=><article key={note.id} className="rounded-xl border border-stone-200 p-3"><div className="flex justify-between text-xs text-teal-800"><span>{noteLabels[note.note_type??'thought']}</span><button onClick={()=>{if(note.annotation_id&&annotations.some(item=>item.id===note.annotation_id))onJumpAnnotation(note.annotation_id);else onJump(note.page_number??1);}}>{note.annotation_id&&annotations.some(item=>item.id===note.annotation_id)?'定位标注':`第 ${note.page_number??1} 页`} ↗</button></div><p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{note.content_markdown}</p><div className="flex gap-3 text-xs text-slate-400"><button disabled={!!text.trim()} onClick={()=>{setEditing(note);setText(note.content_markdown);setKind(note.note_type??'thought');}}>编辑</button><button onClick={()=>onDelete('note',note.id)}>删除</button></div></article>)}</div>
      </>}
      {tab==='annotations'&&<div className="space-y-2">
        {!annotations.length&&<p className="py-8 text-center text-xs leading-6 text-slate-400">默认拖选只选择文字。<br/>请先在顶部选择高亮、下划线或框选工具，再添加标注。</p>}
        {annotations.map(annotation=><article key={annotation.id} className="min-w-0 rounded-lg border border-stone-200 border-l-4 px-2 py-1" style={{borderLeftColor:annotation.color}}>
          <AnnotationExcerpt text={annotation.selected_text} label={`第 ${annotation.page_number} 页 · ${annotation.type==='area'?'框选':annotation.type==='underline'?'下划线':'高亮'}`}>
            <div className="flex flex-wrap gap-3 py-2 text-xs text-slate-500"><button onClick={()=>onJumpAnnotation(annotation.id)}>定位标注 ↗</button><button onClick={()=>onAnchor(annotation)}>添加笔记</button><button onClick={()=>onDelete('annotation',annotation.id)}>删除</button></div>
          </AnnotationExcerpt>
        </article>)}
      </div>}
      {tab==='details'&&<div className="space-y-5 text-xs"><h2 className="text-sm font-semibold leading-6">{paper.title}</h2><p className="text-slate-500">{paper.authors?.join('; ')||'作者未识别'} · {paper.year??'年份未识别'}</p><p className="text-slate-400">{paper.total_pages} 页 · {(paper.file_size/1024/1024).toFixed(1)} MB</p>{paper.abstract&&<p className="whitespace-pre-wrap leading-6 text-slate-600">{paper.abstract}</p>}
        <div><h3 className="mb-2 font-semibold">标签</h3>{tags.map(tag=><label key={tag.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={membership.tags.includes(tag.id)} onChange={event=>onMembership('tag',tag.id,event.target.checked)}/>{tag.name}</label>)}{!tags.length&&<p className="text-slate-400">点击上方“论文改名 / 添加标签”创建并添加</p>}</div>
        <div><h3 className="mb-2 font-semibold">收藏夹</h3>{collections.map(collection=><label key={collection.id} className="flex items-center gap-2 py-1"><input type="checkbox" checked={membership.collections.includes(collection.id)} onChange={event=>onMembership('collection',collection.id,event.target.checked)}/>{collection.name}</label>)}{!collections.length&&<p className="text-slate-400">点击上方入口创建并添加收藏夹</p>}</div>
      </div>}
    </div>
  </>;
}
