import type { ReactNode } from 'react';
interface Props { text: string | null; label: string; children?: ReactNode }

/** Compact, keyboard-accessible annotation reference; full source text is revealed only on request. */
export function AnnotationExcerpt({text,label,children}:Props) {
  const content=text?.trim()||'区域标注（查看原文位置）';
  // Collapse line breaks in the preview only; expanded text retains the original paragraph structure.
  const preview=content.replace(/\s+/g,' ');
  return <details className="annotation-excerpt min-w-0 flex-1 text-xs">
    <summary className="flex cursor-pointer list-none items-center gap-2 rounded py-1.5 text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600" aria-label={`${label}，展开或收起引用全文`}>
      <span className="excerpt-chevron shrink-0 text-[10px] text-stone-400" aria-hidden="true">▶</span>
      <span className="shrink-0 text-[10px] text-teal-700">{label}</span>
      <span className="min-w-0 flex-1 truncate">{preview}</span>
    </summary>
    <div className="pt-1"><p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-stone-50 p-2 text-xs leading-6 text-slate-600">{content}</p>{children}</div>
  </details>;
}
