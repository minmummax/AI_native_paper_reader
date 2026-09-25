import { useEffect, useState } from 'react';
import { Languages, MessageCircle, X } from 'lucide-react';
import type { AiSelection } from '../types/ai';

/** Positions transient actions beside the native selection; screen coordinates are never persisted. */
export function SelectionToolbar({ selection, busy, onAction, onDismiss }: {
  selection: AiSelection; busy: boolean; onAction: (kind: 'translate' | 'ask') => void; onDismiss: () => void;
}) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const native = window.getSelection();
    if (!native?.rangeCount || native.isCollapsed) return;
    const rect = native.getRangeAt(0).getBoundingClientRect();
    // Place below selected text, or above when near the viewport bottom; clamp to screen edges.
    setPosition({ left: Math.max(8, Math.min(window.innerWidth - 244, rect.left + rect.width / 2 - 118)), top: Math.max(8, Math.min(window.innerHeight - 54, rect.bottom + 8)) });
    const changed = (): void => { if (!window.getSelection()?.toString().trim()) onDismiss(); };
    const scrolled = (event: Event): void => { if (event.target instanceof HTMLElement && event.target.closest('[aria-label="PDF 阅读区域"]')) onDismiss(); };
    document.addEventListener('selectionchange', changed); window.addEventListener('resize', onDismiss); document.addEventListener('scroll', scrolled, true);
    return () => { document.removeEventListener('selectionchange', changed); window.removeEventListener('resize', onDismiss); document.removeEventListener('scroll', scrolled, true); };
  }, [selection, onDismiss]);
  if (!position) return null;
  return <div role="toolbar" aria-label="选区操作" className="selection-actions fixed z-40 flex items-center gap-1 rounded-xl border border-teal-100 bg-white p-1.5 text-xs shadow-xl" style={position} onPointerDown={event => event.preventDefault()}>
    <button className="small-button flex items-center gap-1 text-teal-800" disabled={busy} onClick={() => onAction('translate')}><Languages size={14}/>翻译</button>
    <button className="small-button flex items-center gap-1 text-teal-800" disabled={busy} onClick={() => onAction('ask')}><MessageCircle size={14}/>问问 AI</button>
    <button className="icon-button" aria-label="收起选区操作" onClick={onDismiss}><X size={13}/></button>
  </div>;
}
