import type { RefObject } from 'react';
import { Search,X } from 'lucide-react';
import type { Paper } from '../types';
import type { Collection,LibraryTag,ShelfPaper,LibraryFilter } from '../services/library';
interface Props {
  papers:ShelfPaper[]; activeId:string|null; query:string; onQuery:(query:string)=>void;
  filter:LibraryFilter; onFilter:(filter:LibraryFilter)=>void; tags:LibraryTag[]; collections:Collection[];
  searchRef:RefObject<HTMLInputElement>; modifier:string; onSelect:(paper:Paper)=>void;
  onOrganize:(paper:Paper)=>void; onDelete:(kind:'paper'|'tag'|'collection',id:string)=>void;
}

/** Searchable shelf with visible per-paper labels and direct naming/classification actions. */
export function LibraryShelf({papers,activeId,query,onQuery,filter,onFilter,tags,collections,searchRef,modifier,onSelect,onOrganize,onDelete}:Props) {
  const selectedTag=tags.find(tag=>tag.id===filter.tagId);
  const selectedCollection=collections.find(collection=>collection.id===filter.collectionId);
  const selectGroup=(value:LibraryFilter):void=>onFilter({...value,sort:filter.sort});
  return <>
    <label className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2"><Search size={14} className="shrink-0 text-slate-400"/><input ref={searchRef} className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none" aria-label="搜索论文" placeholder="名称、作者、年份、标签…" value={query} maxLength={300} onChange={event=>onQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onQuery('');}if(event.key==='Enter'&&papers[0])onSelect(papers[0]);}}/>{query&&<button className="text-stone-400" aria-label="清空搜索" onClick={()=>onQuery('')}><X size={13}/></button>}</label>
    <p className="mb-3 mt-1.5 text-[10px] leading-4 text-slate-400">{modifier}+K 快速检索 · 空格组合关键词 · Enter 打开首条</p>
    <div className="mb-3 flex gap-1"><button className={`small-button flex-1 ${!filter.tagId&&!filter.collectionId&&!filter.untagged?'bg-teal-50 text-teal-800':''}`} onClick={()=>selectGroup({})}>全部论文</button><button className={`small-button flex-1 ${filter.untagged?'bg-teal-50 text-teal-800':''}`} onClick={()=>selectGroup({untagged:true})}>未打标签</button></div>
    {(tags.length>0||collections.length>0)&&<div className="mb-4 space-y-3 border-b border-stone-200 pb-3">
      {(['collection','tag'] as const).map(kind=><section key={kind}><h2 className="mb-1 text-[10px] font-semibold text-slate-400">{kind==='tag'?'按标签筛选':'按收藏夹筛选'}</h2><div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">{(kind==='tag'?tags:collections).map(group=><div key={group.id} className={`flex max-w-full items-center rounded-md border ${filter.tagId===group.id||filter.collectionId===group.id?'border-teal-200 bg-teal-50 text-teal-800':'border-stone-200 bg-white text-slate-500'}`}><button className="min-w-0 truncate px-2 py-1 text-xs" title={group.name} onClick={()=>selectGroup(kind==='tag'?{tagId:group.id}:{collectionId:group.id})}>{kind==='tag'?'# ':''}{group.name} <span className="text-[10px] opacity-60">{group.paper_count}</span></button><button className="pr-1 opacity-50 hover:opacity-100" aria-label={`删除${kind==='tag'?'标签':'收藏夹'}：${group.name}`} onClick={()=>onDelete(kind,group.id)}><X size={10}/></button></div>)}</div></section>)}
    </div>}
    <div className="mb-2 flex items-center justify-between gap-2"><p role="status" className="min-w-0 truncate text-xs text-slate-500">{selectedTag?`# ${selectedTag.name}`:selectedCollection?.name??(filter.untagged?'未打标签':'论文')} · {papers.length} 篇</p><select aria-label="论文排序" className="max-w-28 rounded border bg-white p-1 text-[10px]" value={filter.sort??'recent'} onChange={event=>onFilter({...filter,sort:event.target.value as LibraryFilter['sort']})}><option value="recent">最近阅读</option><option value="title">名称 A–Z</option><option value="year">年份最新</option></select></div>
    {(query||filter.tagId||filter.collectionId||filter.untagged)&&<button className="mb-2 text-[10px] text-teal-700 underline" onClick={()=>{onQuery('');selectGroup({});}}>清除搜索与筛选</button>}
    <div className="space-y-2">{papers.map(paper=><article key={paper.id} className={`rounded-xl border ${activeId===paper.id?'border-teal-200 bg-white shadow-sm':'border-transparent hover:bg-white/70'}`}>
      <button className="w-full px-3 pt-3 text-left" title={paper.title} onClick={()=>onSelect(paper)}><p className="line-clamp-2 break-words text-xs font-medium leading-5">{paper.title}</p>{paper.source_name&&paper.source_name.replace(/\.pdf$/i,'')!==paper.title&&<p className="mt-1 truncate text-[10px] text-stone-400" title={paper.source_name}>{paper.source_name}</p>}<p className="mt-1 truncate text-[10px] text-slate-400">{paper.authors?.[0]?`${paper.authors[0]} · `:''}{paper.year??'年份未知'} · {paper.total_pages} 页</p></button>
      <div className="mt-2 flex flex-wrap gap-1 px-3">{paper.tags.map(tag=><button key={tag.id} className="max-w-full truncate rounded bg-teal-50 px-1.5 py-0.5 text-[10px] text-teal-800" title={`筛选标签：${tag.name}`} onClick={()=>selectGroup({tagId:tag.id})}># {tag.name}</button>)}{!paper.tags.length&&<button className="text-[10px] text-slate-400 hover:text-teal-700" onClick={()=>onOrganize(paper)}>＋ 添加标签</button>}</div>
      <div className="flex items-center justify-between px-3 pb-2 pt-2"><button className="text-[11px] text-teal-700" aria-label={`改名或分类：${paper.title}`} onClick={()=>onOrganize(paper)}>改名 / 分类</button><button className="text-[10px] text-stone-400 hover:text-red-700" aria-label={`移除论文：${paper.title}`} onClick={()=>onDelete('paper',paper.id)}>移除</button></div>
    </article>)}</div>
    {!papers.length&&<p className="py-8 text-center text-xs leading-6 text-slate-400">{query||filter.tagId||filter.collectionId||filter.untagged?'没有匹配的论文，试试减少关键词或清除筛选。':'书架还是空的，导入 PDF 后可逐篇改名和分类。'}</p>}
  </>;
}
