import type { UsageBucket } from '../types/ai';

export interface UsageTotals { requests: number; succeeded: number; failed: number; cancelled: number; pending: number; unknownUsage: number; inputTokens: number; outputTokens: number }
/** @param rows Server aggregates. @returns Totals of known usage; unknown requests remain separately counted. */
export function totalUsage(rows: readonly UsageTotals[]): UsageTotals {
  return rows.reduce((sum, row) => ({ requests: sum.requests + row.requests, succeeded: sum.succeeded + row.succeeded,
    failed: sum.failed + row.failed, cancelled: sum.cancelled + row.cancelled, pending: sum.pending + row.pending,
    unknownUsage: sum.unknownUsage + row.unknownUsage, inputTokens: sum.inputTokens + row.inputTokens, outputTokens: sum.outputTokens + row.outputTokens }),
  { requests: 0, succeeded: 0, failed: 0, cancelled: 0, pending: 0, unknownUsage: 0, inputTokens: 0, outputTokens: 0 });
}
/** @param rows Per-day/model rows. @returns Model groups, retaining provider isolation. */
export function usageByModel(rows: readonly UsageBucket[]): Array<UsageTotals & { provider: string; model: string }> {
  const groups = new Map<string, UsageBucket[]>();
  for (const row of rows) { const id = JSON.stringify([row.provider, row.model]); groups.set(id, [...(groups.get(id) ?? []), row]); }
  return Array.from(groups.values(), group => ({ ...totalUsage(group), provider: group[0]!.provider, model: group[0]!.model }));
}
/** @param rows Local-date aggregates. @param days Calendar range. @param now Current local clock. @returns Zero-filled daily chart buckets. */
export function dailyUsage(rows: readonly UsageBucket[], days: number, now = new Date()): Array<UsageTotals & { day: string }> {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1 + index);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { day, ...totalUsage(rows.filter(row => row.day === day)) };
  });
}
