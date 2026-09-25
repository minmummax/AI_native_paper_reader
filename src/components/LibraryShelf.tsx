import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDownUp, ArrowLeft, BookOpen, ChevronRight, LayoutGrid, List, Search, X } from 'lucide-react';
import type { Paper } from '../types';
import type { Collection, LibraryTag, ShelfPaper, LibraryFilter } from '../services/library';
interface Props {
  papers: ShelfPaper[]; activeId: string | null; query: string; onQuery: (query: string) => void;
  filter: LibraryFilter; onFilter: (filter: LibraryFilter) => void; tags: LibraryTag[]; collections: Collection[];
  searchRef: RefObject<HTMLInputElement>; modifier: string; onSelect: (paper: Paper) => void;
  onOrganize: (paper: Paper) => void; onDelete: (kind: 'paper' | 'tag' | 'collection', id: string) => void;
  spacious?: boolean;
}
const colors = ['#315f56', '#8b6452', '#4f657a', '#887449', '#775f72', '#5f7660'];

/** A one-level tag bookshelf with optional intersecting tags, title covers and configurable ordering. */
export function LibraryShelf({ papers: availablePapers, activeId, query, onQuery, filter, onFilter, tags, collections, searchRef, modifier, onSelect, onOrganize, onDelete, spacious = false }: Props) {
  const [all, setAll] = useState(false);
  const [view, setView] = useState<'covers' | 'list'>('covers');
  const [limit, setLimit] = useState(60);
  const [taking, setTaking] = useState<string | null>(null);
  const timer = useRef<number>();
  const path = [...new Set([...(filter.tagIds ?? []), ...(filter.tagId ? [filter.tagId] : [])])];
  // Tag navigation uses already-loaded rows so opening a spine never flashes unrelated papers.
  const papers = availablePapers.filter(paper => (!filter.untagged || !paper.tags.length) && path.every(id => paper.tags.some(tag => tag.id === id)));
  const direction = filter.direction ?? (filter.sort === 'title' ? 'asc' : 'desc');
  const grouped = !all && !query && !path.length && !filter.collectionId && !filter.untagged;
  const pathKey = path.join(':');
  useEffect(() => { setLimit(60); }, [pathKey, query, filter.collectionId, filter.untagged]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const root = (): void => { setAll(false); onQuery(''); onFilter({ sort: filter.sort, direction: filter.direction }); };
  const enter = (ids: string[]): void => { setAll(false); onFilter({ ...filter, tagId: undefined, tagIds: ids, untagged: false }); };
  const take = (paper: Paper): void => {
    if (taking) return; setTaking(paper.id);
    timer.current = window.setTimeout(() => { onSelect(paper); setTaking(null); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 150);
  };
  const groups = tags.map(tag => ({ ...tag, count: papers.filter(paper => paper.tags.some(item => item.id === tag.id)).length }));
  const label = path.length ? tags.find(tag => tag.id === path.at(-1))?.name ?? '标签' : filter.untagged ? '未分类' : collections.find(item => item.id === filter.collectionId)?.name ?? '全部论文';
  return <div className={spacious ? 'mx-auto w-full max-w-6xl' : ''}>
    {spacious && <div className="mb-8 flex items-end justify-between"><div><p className="mb-2 text-[10px] tracking-[.25em] text-teal-700">MY READING ROOM</p><h1 className="font-serif text-3xl text-stone-800">我的书架</h1><p className="mt-2 text-xs text-stone-400">按主题收好论文，随时抽出一本继续阅读。</p></div><BookOpen size={34} strokeWidth={1} className="text-stone-300"/></div>}
    <label className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white/80 px-3"><Search size={15} className="shrink-0 text-stone-400"/><input ref={searchRef} className="min-w-0 flex-1 bg-transparent py-3 text-xs outline-none" aria-label="搜索论文" placeholder="搜索论文名称、作者、年份、标签…" value={query} maxLength={300} onChange={event => onQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onQuery(''); } if (event.key === 'Enter' && papers[0]) take(papers[0]); }}/>{query && <button aria-label="清空搜索" onClick={() => onQuery('')}><X size={13}/></button>}</label>
    <div className="my-4 flex flex-wrap items-center gap-2 text-[11px] text-stone-500"><button onClick={root} className="hover:text-teal-800">书架</button>{!grouped && <><ChevronRight size={12}/>{path.length ? path.map((id, index) => <span className="flex items-center gap-1" key={id}><button onClick={() => enter(path.slice(0, index + 1))}>{tags.find(tag => tag.id === id)?.name ?? '标签'}</button>{index < path.length - 1 && <ChevronRight size={11}/>}</span>) : <span>{label}</span>}</>}{query && <span>· 搜索“{query}”</span>}<span className="ml-auto text-[10px] text-stone-400">{modifier}+K</span></div>
    {grouped ? <div className="shelf-arrival">
      <div className="mb-5 flex gap-2"><button className="small-button border bg-white" onClick={() => setAll(true)}>全部论文 · {papers.length}</button><button className="small-button" onClick={() => onFilter({ ...filter, untagged: true })}>未分类 · {papers.filter(paper => !paper.tags.length).length}</button></div>
      <div className={`bookcase-grid ${spacious ? 'bookcase-wide' : ''}`} aria-label="标签书架">
        {groups.map((tag, index) => <div key={tag.id} className="book-spine-slot">
          <button className="book-spine" style={{ backgroundColor: colors[index % colors.length] }} aria-label={`打开标签：${tag.name}，${tag.count} 篇`} onClick={() => enter([tag.id])}><span className="book-spine-line"/><span className="book-spine-title">{tag.name}</span><span className="book-spine-count">{tag.count}<span>篇论文</span></span></button>
          <button className="spine-remove" aria-label={`删除标签：${tag.name}`} onClick={() => onDelete('tag', tag.id)}><X size={10}/></button>
        </div>)}
        {!tags.length && <button className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-stone-300 px-5 text-xs text-stone-400" onClick={() => setAll(true)}><BookOpen size={28} strokeWidth={1}/>查看论文并添加标签</button>}
      </div>
      {!!collections.length && <section className="mt-8"><h2 className="mb-3 text-xs text-stone-400">收藏夹</h2><div className="flex flex-wrap gap-2">{collections.map(collection => <div key={collection.id} className="flex rounded-lg border bg-white"><button className="small-button" onClick={() => onFilter({ sort: filter.sort, direction: filter.direction, collectionId: collection.id })}>{collection.name} · {collection.paper_count}</button><button className="px-1 text-stone-400" aria-label={`删除收藏夹：${collection.name}`} onClick={() => onDelete('collection', collection.id)}><X size={11}/></button></div>)}</div></section>}
    </div> : <div key={`${pathKey}:${filter.collectionId}:${filter.untagged}:${all}`} className="shelf-arrival">
      <div className="mb-4 flex flex-wrap items-center gap-2"><button className="small-button" aria-label="返回书架" onClick={root}><ArrowLeft size={14}/></button><p role="status" className="mr-auto text-xs text-stone-500">{papers.length} 篇论文</p><select aria-label="论文排序" className="rounded-lg border bg-white p-1.5 text-xs" value={filter.sort ?? 'recent'} onChange={event => onFilter({ ...filter, sort: event.target.value as LibraryFilter['sort'] })}><option value="recent">最近阅读</option><option value="added">入库时间</option><option value="year">发表年份</option><option value="title">论文名称</option></select><button className="small-button" aria-label="切换排序方向" title={direction === 'asc' ? '升序' : '降序'} onClick={() => onFilter({ ...filter, direction: direction === 'asc' ? 'desc' : 'asc' })}><ArrowDownUp size={13}/></button><button className="small-button" aria-label={view === 'covers' ? '切换紧凑列表' : '切换名称书封'} onClick={() => setView(value => value === 'covers' ? 'list' : 'covers')}>{view === 'covers' ? <List size={14}/> : <LayoutGrid size={14}/>}</button></div>
      {!!path.length && <details className="mb-4 text-[11px] text-stone-500"><summary className="cursor-pointer">继续按共同标签筛选（可选）</summary><div className="mt-2 flex flex-wrap gap-1">{groups.filter(tag => !path.includes(tag.id) && tag.count > 0).map(tag => <button key={tag.id} className="small-button border bg-white" onClick={() => enter([...path, tag.id])}># {tag.name} · {tag.count}</button>)}{!groups.some(tag => !path.includes(tag.id) && tag.count) && <span>没有其他共同标签</span>}</div></details>}
      <div className={view === 'covers' ? `paper-cover-grid ${spacious ? 'paper-cover-wide' : ''}` : 'space-y-2'}>
        {papers.slice(0, limit).map((paper, index) => <article key={paper.id} className={`paper-book ${view === 'list' ? 'paper-book-list' : ''} ${taking === paper.id ? 'paper-taking' : ''} ${activeId === paper.id ? 'paper-book-active' : ''}`}>
          <button className="paper-book-face" aria-label={`阅读论文：${paper.title}`} onClick={() => take(paper)}><span className="mb-3 flex w-full items-center justify-between text-[9px] uppercase tracking-widest text-stone-400"><span>{paper.year ?? 'PAPER'}</span><span>{String(index + 1).padStart(2, '0')}</span></span><span className="line-clamp-4 w-full break-words text-left font-serif text-sm leading-6 text-stone-800">{paper.title}</span><span className="mt-auto block w-full truncate pt-4 text-left text-[10px] text-stone-400">{paper.authors?.[0] ?? '研究论文'} · {paper.total_pages} 页</span>{activeId === paper.id && <span className="paper-bookmark">阅读中</span>}</button>
          <div className="flex flex-wrap gap-1 px-3 pt-2">{paper.tags.map(tag => <button key={tag.id} className="max-w-full truncate text-[10px] text-teal-700" onClick={() => enter([tag.id])}>#{tag.name}</button>)}</div>
          <div className="flex justify-between gap-2 px-3 py-2"><button className="text-[10px] text-stone-500 hover:text-teal-700" aria-label={`改名或分类：${paper.title}`} onClick={() => onOrganize(paper)}>改名 / 多标签</button><button className="text-[10px] text-stone-400 hover:text-red-700" aria-label={`移除论文：${paper.title}`} onClick={() => onDelete('paper', paper.id)}>移除</button></div>
        </article>)}
      </div>
      {papers.length > limit && <button className="small-button mt-5 w-full border" onClick={() => setLimit(value => value + 60)}>再显示 60 篇</button>}
      {!papers.length && <p className="py-12 text-center text-xs leading-6 text-stone-400">没有匹配的论文。<br/>试试减少关键词或返回书架。</p>}
    </div>}
  </div>;
}
