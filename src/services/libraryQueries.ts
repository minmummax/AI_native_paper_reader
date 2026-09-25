export interface LibraryFilter {
  query?: string;
  tagId?: string;
  tagIds?: string[];
  collectionId?: string;
  untagged?: boolean;
  sort?: 'recent' | 'title' | 'year' | 'added';
  direction?: 'asc' | 'desc';
}
export interface SqlQuery { sql: string; params: (string | number | null)[] }

/**
 * Builds a parameterized AND-of-keywords search across local metadata, groups and notes.
 * @param filter Search text and optional grouping; quoted phrases remain together.
 * @returns SQL and bound values; wildcard characters in user input are matched literally.
 */
export function buildPaperSearch(filter: LibraryFilter = {}): SqlQuery {
  const terms=Array.from((filter.query??'').trim().matchAll(/"([^"]+)"|(\S+)/g),match=>match[1]??match[2]??'').filter(Boolean);
  const params:SqlQuery['params']=[];
  const bind=(value:string|number|null):string=>{params.push(value);return `$${params.length}`;};
  const conditions=terms.map(term=>{
    const value=bind(`%${term.replace(/[\\%_]/g,character=>`\\${character}`)}%`);
    return `(
      p.title LIKE ${value} ESCAPE '\\' OR p.source_name LIKE ${value} ESCAPE '\\'
      OR p.metadata_title LIKE ${value} ESCAPE '\\' OR p.authors LIKE ${value} ESCAPE '\\'
      OR CAST(p.year AS TEXT) LIKE ${value} ESCAPE '\\' OR p.abstract LIKE ${value} ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM notes n WHERE n.paper_id=p.id AND n.content_markdown LIKE ${value} ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM paper_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.paper_id=p.id AND t.name LIKE ${value} ESCAPE '\\')
      OR EXISTS (SELECT 1 FROM paper_collections pc JOIN collections c ON c.id=pc.collection_id WHERE pc.paper_id=p.id AND c.name LIKE ${value} ESCAPE '\\')
    )`;
  });
  for(const id of new Set([...(filter.tagIds??[]),...(filter.tagId?[filter.tagId]:[])]))conditions.push(`EXISTS (SELECT 1 FROM paper_tags pt WHERE pt.paper_id=p.id AND pt.tag_id=${bind(id)})`);
  if(filter.collectionId)conditions.push(`EXISTS (SELECT 1 FROM paper_collections pc WHERE pc.paper_id=p.id AND pc.collection_id=${bind(filter.collectionId)})`);
  if(filter.untagged)conditions.push('NOT EXISTS (SELECT 1 FROM paper_tags pt WHERE pt.paper_id=p.id)');
  const direction=filter.direction==='asc'?'ASC':'DESC';
  const order=filter.sort==='title'?`p.title COLLATE NOCASE ${filter.direction==='desc'?'DESC':'ASC'}`:filter.sort==='year'?`p.year ${direction}, p.title COLLATE NOCASE`:filter.sort==='added'?`p.created_at ${direction}`:`p.last_read_at ${direction}, p.created_at DESC`;
  return {sql:`SELECT p.*,
    (SELECT json_group_array(json_object('id',t.id,'name',t.name,'color',t.color)) FROM paper_tags pt JOIN tags t ON t.id=pt.tag_id WHERE pt.paper_id=p.id) AS tags_json
    FROM papers p ${conditions.length?`WHERE ${conditions.join(' AND ')}`:''} ORDER BY ${order},p.id`,params};
}
