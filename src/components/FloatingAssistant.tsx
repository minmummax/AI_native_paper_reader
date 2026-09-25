import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GripHorizontal, Minus, X } from 'lucide-react';

interface Point { x: number; y: number }
interface Props { open: boolean; title: string; children: ReactNode; onMinimize: () => void; onClose: () => void }
/** @param point Requested window position. @param viewport Browser size. @returns Position clamped to a visible, reachable title bar and window. */
export function clampAssistant(point: Point, viewport: { width: number; height: number }): Point {
  const width = Math.min(460, viewport.width - 24), height = Math.min(660, viewport.height - 32);
  return { x: Math.max(12, Math.min(viewport.width - width - 12, point.x)), y: Math.max(16, Math.min(viewport.height - height - 16, point.y)) };
}

/** @param props Non-modal chat contents and lifecycle callbacks. @returns Draggable, keyboard-movable floating window; minimizing keeps the session mounted. */
export function FloatingAssistant({ open, title, children, onMinimize, onClose }: Props) {
  const viewport = (): { width: number; height: number } => ({ width: window.innerWidth, height: window.innerHeight });
  const [position, setPosition] = useState(() => clampAssistant({ x: window.innerWidth - 484, y: window.innerHeight - 692 }, viewport()));
  const origin = useRef<{ pointer: Point; position: Point } | null>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => { const resize = (): void => setPosition(point => clampAssistant(point, viewport())); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => { if (open) root.current?.focus(); }, [open]);
  return <section ref={root} tabIndex={-1} role="dialog" aria-modal="false" aria-label="AI 悬浮对话" className="fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-stone-300 bg-white shadow-2xl outline-none" style={{ display: open ? 'flex' : 'none', left: position.x, top: position.y, width: 'min(460px, calc(100vw - 24px))', height: 'min(660px, calc(100dvh - 32px))' }}>
    <header className="flex shrink-0 items-center gap-1 border-b bg-stone-50 px-3 py-2">
      <button className="flex min-w-0 flex-1 touch-none items-center gap-2 rounded p-1 text-left text-xs text-slate-600 active:cursor-grabbing" aria-label="移动 AI 对话窗口（方向键）" title="拖动移动，也可用方向键调整位置" onPointerDown={event => { if (event.button !== 0) return; origin.current = { pointer: { x: event.clientX, y: event.clientY }, position }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const start = origin.current; if (start) setPosition(clampAssistant({ x: start.position.x + event.clientX - start.pointer.x, y: start.position.y + event.clientY - start.pointer.y }, viewport())); }} onPointerUp={() => { origin.current = null; }} onPointerCancel={() => { origin.current = null; }} onKeyDown={event => { const delta: Record<string, Point> = { ArrowLeft: { x: -20, y: 0 }, ArrowRight: { x: 20, y: 0 }, ArrowUp: { x: 0, y: -20 }, ArrowDown: { x: 0, y: 20 } }; const offset = delta[event.key]; if (offset) { event.preventDefault(); event.stopPropagation(); setPosition(point => clampAssistant({ x: point.x + offset.x, y: point.y + offset.y }, viewport())); } }}><GripHorizontal size={16} className="shrink-0"/><span className="truncate">{title}</span></button>
      <button className="icon-button" aria-label="收起 AI 对话" title="收起，保留当前对话" onClick={onMinimize}><Minus size={16}/></button><button className="icon-button" aria-label="关闭并结束 AI 对话" title="关闭并结束当前会话" onClick={onClose}><X size={16}/></button>
    </header>{children}
  </section>;
}
