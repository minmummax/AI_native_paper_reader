import type { ChatTurn, HistoryMessage } from '../types/ai';

/** @param turns Current paper's ephemeral conversation. @returns Most recent complete pairs within 8 KB/6 turns; failed and cancelled answers are excluded. */
export function boundedHistory(turns: readonly ChatTurn[]): { messages: HistoryMessage[]; omitted: number } {
  const complete = turns.filter(turn => turn.status === 'succeeded' && turn.answer.trim());
  const messages: HistoryMessage[] = [];
  const encoder = new TextEncoder();
  let bytes = 0;
  for (const turn of complete.slice().reverse()) {
    const size = encoder.encode(turn.question).length + encoder.encode(turn.answer).length;
    if (bytes + size > 8000 || messages.length >= 12) break;
    bytes += size;
    messages.unshift({ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer });
  }
  return { messages, omitted: complete.length - messages.length / 2 };
}
