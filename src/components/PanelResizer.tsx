import { useRef } from 'react';
interface Props { side:'left'|'right'; width:number; min:number; max:number; onChange:(width:number)=>void; onReset:()=>void }

/** Accessible panel divider: drag, arrow keys, Home/End, or double-click to reset width. */
export function PanelResizer({side,width,min,max,onChange,onReset}:Props) {
  const origin=useRef<{x:number;width:number}|null>(null);
  const change=(value:number):void=>onChange(Math.max(min,Math.min(max,Math.round(value))));
  return <div role="separator" tabIndex={0} aria-label={side==='left'?'调整书架宽度':'调整笔记面板宽度'} aria-orientation="vertical"
    aria-valuenow={Math.round(width)} aria-valuemin={min} aria-valuemax={max} title="拖动调整宽度 · 双击恢复默认"
    className="group z-30 hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center bg-stone-100 hover:bg-teal-100 focus-visible:bg-teal-100 focus-visible:outline-none lg:flex"
    onDoubleClick={onReset} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();origin.current={x:event.clientX,width};event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerMove={event=>{if(origin.current)change(origin.current.width+(event.clientX-origin.current.x)*(side==='left'?1:-1));}}
    onPointerUp={event=>{origin.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
    onLostPointerCapture={()=>{origin.current=null;}} onPointerCancel={()=>{origin.current=null;}}
    onKeyDown={event=>{if(event.key==='Home'){event.preventDefault();change(min);}else if(event.key==='End'){event.preventDefault();change(max);}else if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();change(width+(event.key==='ArrowRight'?1:-1)*(side==='left'?1:-1)*(event.shiftKey?40:16));}}}>
    <div className="h-9 w-0.5 rounded bg-stone-300 group-hover:bg-teal-600"/>
  </div>;
}
