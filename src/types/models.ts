/** SQLite CURRENT_TIMESTAMP text (UTC, YYYY-MM-DD HH:MM:SS). */
export type SqlTimestamp = string;
export type AnnotationType = 'highlight' | 'area' | 'underline';
export type NoteType = 'thought' | 'question' | 'critique' | 'idea';
/** Schema readiness only; no parser or remote service is implemented in Phase 1. */
export type ParserEngine = 'fast_local' | 'cloud_api' | 'local_mineru';

/** Top-left origin; each dimension is in [0, 1]. page is a 1-based integer. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
  page: number;
}

/** Raw papers row: authors is JSON text; nullable SQL defaults remain nullable. */
export interface PaperRow {
  id: string;
  title: string;
  authors: string | null;
  year: number | null;
  abstract: string | null;
  file_path: string;
  file_size: number;
  total_pages: number;
  last_read_page: number | null;
  last_read_at: SqlTimestamp | null;
  created_at: SqlTimestamp | null;
  updated_at: SqlTimestamp | null;
}
export interface Paper extends Omit<PaperRow, 'authors'> {
  authors: string[] | null;
}
export interface AnnotationRow {
  id: string;
  paper_id: string;
  page_number: number;
  type: AnnotationType;
  color: string;
  selected_text: string | null;
  rects_json: string;
  created_at: SqlTimestamp | null;
}
export interface Annotation extends Omit<AnnotationRow, 'rects_json'> {
  rects: NormalizedRect[];
}
export interface Note {
  id: string;
  paper_id: string;
  annotation_id: string | null;
  page_number: number | null;
  note_type: NoteType | null;
  content_markdown: string;
  created_at: SqlTimestamp | null;
  updated_at: SqlTimestamp | null;
}
export interface Tag {
  id: string;
  name: string;
  color: string | null;
}
export interface PaperTag {
  paper_id: string;
  tag_id: string;
}
/** A single key/value record; values are stored as text without implicit JSON decoding. */
export interface AppSettings {
  key: string;
  value: string;
  updated_at: SqlTimestamp | null;
}
export interface ParseCache {
  paper_id: string;
  parser_engine: ParserEngine;
  parsed_markdown: string;
  translated_markdown: string | null;
  updated_at: SqlTimestamp | null;
}
export interface AnnotationInput extends Omit<Annotation, 'id' | 'created_at'> {}
export interface NoteInput extends Omit<Note, 'id' | 'created_at' | 'updated_at' | 'note_type'> {
  note_type: NoteType;
}
