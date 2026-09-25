import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { UsageBucket } from '../types/ai';
import { dailyUsage, totalUsage, usageByModel } from '../lib/aiUsage';

/** @returns Local usage report with date/model summaries and explicitly incomplete metering. */
export function UsageReport() {
  const [days, setDays] = useState(30);
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<UsageBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = (): void => setRevision(value => value + 1);
    window.addEventListener('ai-usage-changed', refresh);
    return () => window.removeEventListener('ai-usage-changed', refresh);
  }, []);
  useEffect(() => {
    let live = true; setLoading(true); setError(''); setRows([]);
    void invoke<UsageBucket[]>('get_ai_usage', { days }).then(value => { if (live) setRows(value); })
      .catch((reason: unknown) => { if (live) setError(String(reason)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [days, revision]);
  const totals = useMemo(() => totalUsage(rows), [rows]);
  const models = useMemo(() => usageByModel(rows), [rows]);
  const daily = useMemo(() => dailyUsage(rows, days), [rows, days]);
  const max = Math.max(1, ...daily.map(day => day.inputTokens + day.outputTokens));
  const number = (value: number): string => value.toLocaleString();
  return <section className="space-y-5" aria-label="AI 用量统计报表">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">用量统计</h3><p className="mt-1 text-xs text-slate-500">按本机日期统计 · 本地记录，不是供应商账单</p></div><div className="flex gap-2"><select aria-label="统计时间范围" value={days} onChange={event => setDays(Number(event.target.value))} className="rounded-lg border bg-white p-2 text-xs">{[7, 30, 90].map(value => <option key={value} value={value}>最近 {value} 天</option>)}</select><button className="small-button border" disabled={loading} onClick={() => setRevision(value => value + 1)}>刷新报表</button></div></div>
    {loading ? <p role="status" className="py-12 text-center text-sm text-slate-500">正在读取本地记录…</p> : error ? <p role="alert" className="text-sm text-red-700">{error}</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[['请求次数', totals.requests], ['已知输入 tokens', totals.inputTokens], ['已知输出 tokens', totals.outputTokens], ['用量不完整', totals.unknownUsage]].map(([label, value]) => <div key={label} className="rounded-xl border bg-stone-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums text-teal-900">{number(Number(value))}</p></div>)}</div>
      <p className="text-xs text-slate-500">成功 {totals.succeeded} · 失败 {totals.failed} · 已取消 {totals.cancelled} · 进行中/未完成 {totals.pending}</p>
      {!totals.requests ? <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">所选时间内暂无请求。首次发送后会自动记录用量。</p> : <>
        <figure className="rounded-xl border p-4"><figcaption className="text-sm font-medium">每日已知 tokens</figcaption><div className="mt-4 flex h-28 items-end gap-1" role="img" aria-label={`最近 ${days} 天每日已知 token 数，详细数值见下方每日明细`}>
          {daily.map(day => <div key={day.day} className="flex h-full min-w-0 flex-1 items-end" title={`${day.day}：${number(day.inputTokens + day.outputTokens)} 已知 tokens，${day.requests} 次请求，${day.unknownUsage} 次用量不完整`}><div className="w-full rounded-t bg-teal-600" style={{ height: `${(day.inputTokens + day.outputTokens) / max * 100}%`, minHeight: 2, opacity: day.requests ? 1 : .15 }}/></div>)}
        </div><div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>{daily[0]?.day}</span><span>{daily.at(-1)?.day}</span></div></figure>
        <div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="mb-2 text-left text-sm font-medium">按模型汇总</caption><thead className="border-b bg-stone-50"><tr>{['供应商 / 模型', '请求', '输入 tokens', '输出 tokens', '不完整'].map(label => <th key={label} className="whitespace-nowrap p-2 font-medium">{label}</th>)}</tr></thead><tbody>{models.map(row => <tr key={`${row.provider}/${row.model}`} className="border-b"><td className="p-2"><span className="text-slate-500">{row.provider}</span><br/>{row.model}</td><td className="p-2">{number(row.requests)}</td><td className="p-2">{number(row.inputTokens)}</td><td className="p-2">{number(row.outputTokens)}</td><td className="p-2">{row.unknownUsage}</td></tr>)}</tbody></table></div>
        <details className="text-xs"><summary className="cursor-pointer text-teal-700">每日明细</summary><div className="mt-2 max-h-56 overflow-auto"><table className="w-full text-left"><thead><tr>{['日期', '请求', '已知 tokens', '用量不完整'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{daily.slice().reverse().map(row => <tr key={row.day} className="border-t"><td className="p-2">{row.day}</td><td className="p-2">{row.requests}</td><td className="p-2">{number(row.inputTokens + row.outputTokens)}</td><td className="p-2">{row.unknownUsage}</td></tr>)}</tbody></table></div></details>
      </>}
      <p className="text-xs leading-6 text-slate-500">只保存时间、模型、请求状态与供应商返回的 token 数，不保存论文正文、问题、回答或密钥。取消、断线和程序退出可能导致用量缺失；已知合计不包含未知部分。费用暂不估算。恢复备份会按请求 ID 合并统计，保留本机较新的记录。</p>
    </>}
  </section>;
}
