import { invoke } from '@tauri-apps/api/core';
import { initializeDatabase } from './database';
import { extractMetadata, loadPdf, readPdf } from '../pdf/document';
import { serializeRects } from '../lib/coordinates';
import { buildPaperSearch, type LibraryFilter } from './libraryQueries';
export type { LibraryFilter } from './libraryQueries';
import type { Annotation, AnnotationInput, AnnotationRow, Note, NoteInput, Paper, PaperRow, Tag, NormalizedRect } from '../types';

export interface Collection { id: string; name: string; paper_count: number }
export interface LibraryTag extends Tag { paper_count: number }
export interface ShelfPaper extends Paper { tags: Tag[] }
interface ImportedFile { id: string; file_path: string; file_size: number; name: string; source_name: string }

function decodePaper(row: PaperRow): Paper {
  const value: unknown = row.authors ? JSON.parse(row.authors) : null;
  if (value !== null && (!Array.isArray(value) || !value.every(item => typeof item === 'string'))) throw new Error('论文作者数据损坏');
  return { ...row, authors: value as string[] | null };
}
function decodeAnnotation(row: AnnotationRow): Annotation {
  const value: unknown = JSON.parse(row.rects_json);
  if (!Array.isArray(value) || !value.every(item => typeof item === 'object' && item !== null
      && ['x','y','width','height'].every(key => typeof (item as Record<string, unknown>)[key] === 'number'))) throw new Error('标注坐标数据损坏');
  // Legacy DESIGN examples omit page inside a rect; page_number remains the authority.
  const rects = value.map(item => ({ ...item as NormalizedRect, page: row.page_number }));
  serializeRects(rects, row.page_number);
  const { rects_json: _json, ...rest } = row;
  return { ...rest, rects };
}

/** @param filter Local metadata/group/note search and optional grouping. @returns Papers with visible tag chips. */
export async function getPapers(filter: LibraryFilter = {}): Promise<ShelfPaper[]> {
  const db = await initializeDatabase();
  const {sql,params}=buildPaperSearch(filter);
  return (await db.select<Array<PaperRow & {tags_json:string}>>(sql,params)).map(row=>{
    const tags:unknown=JSON.parse(row.tags_json);
    if(!Array.isArray(tags)||!tags.every(tag=>typeof tag==='object'&&tag!==null&&typeof tag.id==='string'&&typeof tag.name==='string'))throw new Error('标签数据损坏');
    return {...decodePaper(row),tags:tags as Tag[]};
  });
}

/** @param id Paper ID. @param title Editable shelf name; does not rename files. @returns Updated paper. */
export async function renamePaper(id:string,title:string):Promise<Paper> {
  const name=title.trim();
  if(!name||name.length>500)throw new Error('论文名称需为 1–500 个字符');
  const db=await initializeDatabase();
  await db.execute('UPDATE papers SET title=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1',[id,name]);
  const rows=await db.select<PaperRow[]>('SELECT * FROM papers WHERE id=$1',[id]);
  if(!rows[0])throw new Error('论文已被移除');
  return decodePaper(rows[0]);
}

/** @param filePath User-selected path. @returns Deduplicated paper after worker metadata extraction and SQLite persistence. */
export async function importPaper(filePath: string): Promise<Paper> {
  const db = await initializeDatabase();
  const file = await invoke<ImportedFile>('prepare_import', { filePath });
  const existing = await db.select<PaperRow[]>('SELECT * FROM papers WHERE id=$1', [file.id]);
  if (existing[0]) {
    // Re-import can recover filenames for legacy records without resetting titles, notes or tags.
    await db.execute('UPDATE papers SET source_name=COALESCE(source_name,$2) WHERE id=$1',[file.id,file.source_name]);
    return decodePaper({...existing[0],source_name:existing[0].source_name??file.source_name});
  }
  const task = loadPdf(await readPdf(file.id));
  // Password-protected imports are explicitly rejected rather than hanging on an invisible prompt.
  task.onPassword = () => { void task.destroy(); };
  try {
    const pdf = await task.promise;
    const meta = await extractMetadata(pdf, file.name);
    await db.execute(`INSERT OR IGNORE INTO papers(id,title,authors,year,abstract,file_path,file_size,total_pages,source_name,metadata_title)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [file.id,file.name,JSON.stringify(meta.authors),meta.year,meta.abstract,file.file_path,file.file_size,meta.total_pages,file.source_name,meta.title]);
    const rows = await db.select<PaperRow[]>('SELECT * FROM papers WHERE id=$1', [file.id]);
    if (!rows[0]) throw new Error('论文入库失败');
    return decodePaper(rows[0]);
  } catch (error: unknown) {
    throw new Error(`无法解析 PDF（加密文件请先解锁）：${error instanceof Error ? error.message : String(error)}`);
  } finally { await task.destroy(); }
}

/** @param folder Whether to select a folder. @returns Chosen paths; cancellation returns an empty list. */
export async function chooseImports(folder: boolean): Promise<string[]> {
  const selection = await invoke<string | string[] | null>('plugin:dialog|open', { options: {
    directory: folder, multiple: !folder, title: folder ? '选择论文文件夹' : '选择 PDF',
    filters: folder ? [] : [{ name: 'PDF', extensions: ['pdf'] }],
  } });
  if (!selection) return [];
  const paths = typeof selection === 'string' ? [selection] : selection;
  if (!folder) return paths;
  return (await Promise.all(paths.map(folderPath => invoke<string[]>('scan_folder', { folderPath })))).flat();
}

/** @param id Paper ID. @param page One-based current page. @returns Completion after valid progress is stored. */
export async function saveProgress(id: string, page: number): Promise<void> {
  const db = await initializeDatabase();
  await db.execute('UPDATE papers SET last_read_page=$2,last_read_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND $2 BETWEEN 1 AND total_pages', [id,page]);
}

/** @param paperId Owner. @param page Optional page filter for viewport fetching. @returns Decoded annotations. */
export async function getAnnotations(paperId: string, page?: number): Promise<Annotation[]> {
  const db = await initializeDatabase();
  return (await db.select<AnnotationRow[]>('SELECT * FROM annotations WHERE paper_id=$1 AND ($2 IS NULL OR page_number=$2) ORDER BY page_number,created_at', [paperId,page ?? null])).map(decodeAnnotation);
}

/** @param input Validated normalized annotation. @returns Newly stored annotation. */
export async function saveAnnotation(input: AnnotationInput): Promise<Annotation> {
  const db = await initializeDatabase();
  const id: string = crypto.randomUUID();
  await db.execute(`INSERT INTO annotations(id,paper_id,page_number,type,color,selected_text,rects_json)
    SELECT $1,$2,$3,$4,$5,$6,$7 FROM papers WHERE id=$2 AND $3 BETWEEN 1 AND total_pages`,
  [id,input.paper_id,input.page_number,input.type,input.color,input.selected_text,serializeRects(input.rects,input.page_number)]);
  const rows = await db.select<AnnotationRow[]>('SELECT * FROM annotations WHERE id=$1',[id]);
  if (!rows[0]) throw new Error('标注页码无效');
  return decodeAnnotation(rows[0]);
}

/** @param paperId Owner. @returns Notes ordered by latest edit. */
export async function getNotes(paperId: string): Promise<Note[]> {
  return (await initializeDatabase()).select<Note[]>('SELECT * FROM notes WHERE paper_id=$1 ORDER BY updated_at DESC',[paperId]);
}

/** @param input Note content and optional anchor. @param id Existing ID when editing. @returns Persisted note. */
export async function saveNote(input: NoteInput, id: string = crypto.randomUUID()): Promise<Note> {
  if (!input.content_markdown.trim()) throw new Error('笔记内容不能为空');
  const db = await initializeDatabase();
  // Validate anchor ownership in the same INSERT statement; never link another paper's annotation.
  await db.execute(`INSERT INTO notes(id,paper_id,annotation_id,page_number,note_type,content_markdown)
    SELECT $1,$2,$3,$4,$5,$6 FROM papers p WHERE p.id=$2 AND ($4 IS NULL OR $4 BETWEEN 1 AND p.total_pages)
    AND ($3 IS NULL OR EXISTS(SELECT 1 FROM annotations a WHERE a.id=$3 AND a.paper_id=$2 AND a.page_number=$4))
    ON CONFLICT(id) DO UPDATE SET content_markdown=excluded.content_markdown,note_type=excluded.note_type,updated_at=CURRENT_TIMESTAMP
    WHERE notes.paper_id=excluded.paper_id`, [id,input.paper_id,input.annotation_id,input.page_number,input.note_type,input.content_markdown.trim()]);
  const rows = await db.select<Note[]>('SELECT * FROM notes WHERE id=$1 AND paper_id=$2',[id,input.paper_id]);
  if (!rows[0]) throw new Error('笔记关联的论文或标注已不存在');
  return rows[0];
}

/** @param kind Record category. @param id Record ID. @returns Completion; original PDFs are retained when removing shelf records. */
export async function deleteRecord(kind: 'paper' | 'annotation' | 'note' | 'tag' | 'collection', id: string): Promise<void> {
  const tables = { paper:'papers', annotation:'annotations', note:'notes', tag:'tags', collection:'collections' } as const;
  await (await initializeDatabase()).execute(`DELETE FROM ${tables[kind]} WHERE id=$1`,[id]);
}

/** @returns All local tags and collections. */
export async function getGroups(): Promise<{ tags: LibraryTag[]; collections: Collection[] }> {
  const db = await initializeDatabase();
  const [tags,collections] = await Promise.all([db.select<LibraryTag[]>('SELECT t.*, (SELECT count(*) FROM paper_tags pt WHERE pt.tag_id=t.id) AS paper_count FROM tags t ORDER BY t.name'),db.select<Collection[]>('SELECT c.*, (SELECT count(*) FROM paper_collections pc WHERE pc.collection_id=c.id) AS paper_count FROM collections c ORDER BY c.name')]);
  return { tags,collections };
}

/** @param kind Group category. @param name Nonempty display name. @returns Completion; duplicate names are reused. */
export async function createGroup(kind: 'tag' | 'collection', name: string): Promise<string> {
  if (!name.trim()) throw new Error('名称不能为空');
  const db=await initializeDatabase();
  const table=kind==='tag'?'tags':'collections';
  await db.execute(`INSERT OR IGNORE INTO ${table}(id,name) VALUES ($1,$2)`,[crypto.randomUUID(),name.trim()]);
  const rows=await db.select<Array<{id:string}>>(`SELECT id FROM ${table} WHERE name=$1`,[name.trim()]);
  if(!rows[0])throw new Error('分组创建失败');
  return rows[0].id;
}

/** @param paperId Owner. @returns Associated group IDs for checkbox controls. */
export async function getMemberships(paperId: string): Promise<{ tags: string[]; collections: string[] }> {
  const db = await initializeDatabase();
  const [tags, collections] = await Promise.all([db.select<Array<{tag_id: string}>>('SELECT tag_id FROM paper_tags WHERE paper_id=$1',[paperId]),db.select<Array<{collection_id: string}>>('SELECT collection_id FROM paper_collections WHERE paper_id=$1',[paperId])]);
  return { tags: tags.map(row => row.tag_id), collections: collections.map(row => row.collection_id) };
}

/** @param paperId Owner. @param kind Group category. @param id Group ID. @param enabled Desired membership. @returns Completion. */
export async function setMembership(paperId: string, kind: 'tag'|'collection', id: string, enabled: boolean): Promise<void> {
  const table = kind === 'tag' ? 'paper_tags' : 'paper_collections';
  const column = kind === 'tag' ? 'tag_id' : 'collection_id';
  await (await initializeDatabase()).execute(enabled ? `INSERT OR IGNORE INTO ${table}(paper_id,${column}) VALUES ($1,$2)` : `DELETE FROM ${table} WHERE paper_id=$1 AND ${column}=$2`,[paperId,id]);
}

/** @param key Setting name. @param value Serialized value. @returns Completion. */
export async function saveSetting(key: string, value: string): Promise<void> {
  await (await initializeDatabase()).execute('INSERT INTO app_settings(key,value) VALUES ($1,$2) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP',[key,value]);
}
/** @param key Setting name. @returns Stored value, or null for a first launch. */
export async function getSetting(key: string): Promise<string | null> {
  const rows = await (await initializeDatabase()).select<Array<{value: string}>>('SELECT value FROM app_settings WHERE key=$1',[key]);
  return rows[0]?.value ?? null;
}
