import type { NormalizedRect } from './models';

export interface ReadingSource {
  id: string;
  page: number;
  text: string;
  rects: NormalizedRect[];
}
export interface ReadingSnapshot {
  paperId: string;
  scope: 'selection' | 'page' | 'paper';
  extractionRevision: string;
  sources: ReadingSource[];
  truncated: boolean;
  coverage?: { totalPages: number; readablePages: number; selectedPages: number[]; bytes: number; strategy: string };
}
export interface AiProfile {
  providerType: 'deepseek' | 'custom';
  baseUrl: string;
  requiresKey: boolean;
  includeUsage: boolean;
  profileId: string;
  provider: string;
  model: string;
  hasKey: boolean;
  capabilities: {
    text: boolean;
    image: boolean;
    nativeFile: boolean;
    maxContextBytes: number;
    maxQuestionBytes: number;
    maxOutputTokens: number;
  };
}
export interface AiStreamEvent {
  requestId: string;
  paperId: string;
  kind: 'delta' | 'usage' | 'done';
  text?: string;
  inputTokens?: number;
  outputTokens?: number;
}
export interface AiSelection {
  paperId: string;
  page: number;
  text: string;
  rects: NormalizedRect[];
}

export interface SelectionIntent { id: string; kind: 'translate' | 'ask'; selection: AiSelection }
export interface AiRecord extends ChatTurn {
  paperId: string;
  kind: 'translate' | 'ask';
  selectedText: string;
  createdAt: string;
}

export interface ChatTurn {
  id: string;
  model: string;
  question: string;
  answer: string;
  sources: ReadingSource[];
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}
export interface HistoryMessage { role: 'user' | 'assistant'; content: string }
export interface UsageBucket {
  day: string;
  provider: string;
  model: string;
  requests: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  pending: number;
  unknownUsage: number;
  inputTokens: number;
  outputTokens: number;
}
