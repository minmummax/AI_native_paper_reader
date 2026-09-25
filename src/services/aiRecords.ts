import { initializeDatabase } from './database';
import { serializeRects } from '../lib/coordinates';
import type { AiRecord, ReadingSource } from '../types/ai';

interface Row {
  id: string; paper_id: string; kind: 'translate' | 'ask'; model: string; selected_text: string;
  question: string; answer: string; sources_json: string; status: AiRecord['status']; error: string | null;
  input_tokens: number | null; output_tokens: number | null; created_at: string;
}

/** Validates persisted source geometry and metadata before exposing jump-to-source controls. */
export function decodeSources(json: string): ReadingSource[] {
  const raw: unknown = JSON.parse(json);
  if (!Array.isArray(raw) || raw.length > 64) throw new Error('AI 记录来源数据损坏');
  return raw.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('AI 记录来源数据损坏');
    const source = value as Partial<ReadingSource>;
    if (typeof source.id !== 'string' || !/^s[a-f0-9]{64}$/.test(source.id) || typeof source.text !== 'string'
      || !Number.isInteger(source.page) || (source.page ?? 0) < 1 || !Array.isArray(source.rects)) throw new Error('AI 记录来源数据损坏');
    if (source.rects.length) serializeRects(source.rects, source.page!);
    return source as ReadingSource;
  });
}

/** Persists a selection action in local SQLite; never writes credentials or makes network requests. */
export async function saveAiRecord(record: AiRecord): Promise<void> {
  const db = await initializeDatabase();
  await db.execute(`INSERT INTO ai_records(id,paper_id,kind,model,selected_text,question,answer,sources_json,status,error,input_tokens,output_tokens,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    ON CONFLICT(id) DO UPDATE SET answer=excluded.answer,status=excluded.status,error=excluded.error,input_tokens=excluded.input_tokens,output_tokens=excluded.output_tokens`,
  [record.id, record.paperId, record.kind, record.model, record.selectedText, record.question, record.answer, JSON.stringify(record.sources), record.status,
    record.error ?? null, record.inputTokens ?? null, record.outputTokens ?? null, record.createdAt]);
  window.dispatchEvent(new Event('ai-records-changed'));
}

/** Returns a bounded page of saved interactions for one paper, newest first. */
export async function getAiRecords(paperId: string, limit = 50): Promise<AiRecord[]> {
  const db = await initializeDatabase();
  const rows = await db.select<Row[]>('SELECT * FROM ai_records WHERE paper_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2', [paperId, limit]);
  return rows.map(row => ({ id: row.id, paperId: row.paper_id, kind: row.kind, model: row.model, selectedText: row.selected_text,
    question: row.question, answer: row.answer, sources: decodeSources(row.sources_json), status: row.status,
    error: row.error ?? undefined, inputTokens: row.input_tokens ?? undefined, outputTokens: row.output_tokens ?? undefined, createdAt: row.created_at }));
}

/** Deletes only the chosen paper's saved interaction; paper and annotations remain intact. */
export async function deleteAiRecord(paperId: string, id: string): Promise<void> {
  const db = await initializeDatabase();
  await db.execute('DELETE FROM ai_records WHERE paper_id=$1 AND id=$2', [paperId, id]);
  window.dispatchEvent(new Event('ai-records-changed'));
}
