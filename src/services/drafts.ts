import type { NoteType } from '../types';
const PREFIX='paper-reader:draft:';
export interface NoteDraft { text:string; kind:NoteType; editingId:string|null; annotationId:string|null; page:number }
/** @param value Untrusted persisted value. @returns Whether it is a supported note draft. */
export function isNoteDraft(value:unknown):value is NoteDraft {
  if(typeof value!=='object'||value===null)return false;
  const row=value as Record<string,unknown>;
  return typeof row.text==='string'&&['thought','question','critique','idea'].includes(String(row.kind))
    &&(row.editingId===null||typeof row.editingId==='string')&&(row.annotationId===null||typeof row.annotationId==='string')
    &&typeof row.page==='number'&&Number.isInteger(row.page)&&row.page>0;
}
/** @param paperId Paper hash. @returns Local draft, or null; corrupt storage is reported to the caller. */
export function readDraft(paperId:string):NoteDraft|null {
  const raw=localStorage.getItem(PREFIX+paperId);if(!raw)return null;
  const value:unknown=JSON.parse(raw);if(!isNoteDraft(value))throw new Error('草稿格式损坏，未覆盖原始内容');return value;
}
/** @param paperId Paper hash. @param draft Current editor state, or null to discard. @returns Nothing; synchronous storage prevents an asynchronous close race. */
export function writeDraft(paperId:string,draft:NoteDraft|null):void {
  if(draft)localStorage.setItem(PREFIX+paperId,JSON.stringify(draft));else localStorage.removeItem(PREFIX+paperId);
}
/** @returns All app-owned draft strings for local backup. */
export function exportDrafts():Record<string,NoteDraft> {
  const result:Record<string,NoteDraft>={};
  for(let index=0;index<localStorage.length;index++){const key=localStorage.key(index);if(key?.startsWith(PREFIX)){const id=key.slice(PREFIX.length);const draft=readDraft(id);if(draft)result[id]=draft;}}
  return result;
}
/** @param value Backup draft data. @returns Validated draft map; throws before changing storage. */
export function validateDrafts(value:unknown):Record<string,NoteDraft> {
  if(typeof value!=='object'||value===null||Array.isArray(value))throw new Error('备份草稿格式无效');
  for(const [id,draft] of Object.entries(value))if(!/^[a-f0-9]{64}$/.test(id)||!isNoteDraft(draft))throw new Error('备份草稿格式无效');
  return value as Record<string,NoteDraft>;
}
/** @param drafts Validated backup drafts. @returns Nothing; restores previous values if local storage is full. */
export function importDrafts(drafts:Record<string,NoteDraft>):void {
  const previous=exportDrafts();
  const replace=(values:Record<string,NoteDraft>):void=>{for(const id of Object.keys(exportDrafts()))writeDraft(id,null);for(const [id,draft] of Object.entries(values))writeDraft(id,draft);};
  try{replace(drafts);}catch(error:unknown){replace(previous);throw error;}
}
