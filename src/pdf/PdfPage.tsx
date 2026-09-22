import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import { normalizeRect, rotateRect, mergeTextRects } from '../lib/coordinates';
import type { Annotation, AnnotationType, NormalizedRect, ReaderTool } from '../types';

export interface SelectionDraft { page: number; rects: NormalizedRect[]; text: string; type: AnnotationType }
interface Props {
  pdf: PDFDocumentProxy; page: number; width: number; height: number; rotation: number;
  annotations?: Annotation[]; mode?: ReaderTool; thumbnail?: boolean;
  focusedAnnotation?: {id:string;version:number}|null;
  onSelection?: (draft: SelectionDraft) => void; onAnnotation?: (id: string) => void;
}

/** Renders one visible page with a HiDPI canvas, selectable text and normalized overlays. */
export function PdfPage({ pdf,page,width,height,rotation,annotations = [],mode = 'select',thumbnail = false,focusedAnnotation,onSelection,onAnnotation }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dimensions,setDimensions] = useState({ width, height });
  const [intrinsicRotation,setIntrinsicRotation] = useState(0);
  const [error,setError] = useState<string | null>(null);
  const [drag,setDrag] = useState<{x: number;y: number;width: number;height: number} | null>(null);
  const start = useRef<{x: number;y: number} | null>(null);
  const clickOrigin = useRef<{x:number;y:number}|null>(null);
  useEffect(() => {
    let active = true;
    let render: RenderTask | undefined;
    let textLayer: TextLayer | undefined;
    const canvas = canvasRef.current;
    const container = textRef.current;
    setError(null);
    void (async () => {
      const pdfPage = await pdf.getPage(page);
      if (!active || !canvas || !container) return;
      setIntrinsicRotation(pdfPage.rotate);
      const base = pdfPage.getViewport({ scale: 1, rotation: pdfPage.rotate + rotation });
      // Fit each page into its virtual row while preserving aspect ratio (mixed paper sizes supported).
      const scale = Math.min(width / base.width, height / base.height);
      const viewport = pdfPage.getViewport({ scale, rotation: pdfPage.rotate + rotation });
      setDimensions({width: viewport.width,height: viewport.height});
      // Canvas backing pixels = CSS viewport pixels × devicePixelRatio; CSS dimensions stay logical.
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.ceil(viewport.width * dpr); canvas.height = Math.ceil(viewport.height * dpr);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('无法创建 PDF 画布');
      render = pdfPage.render({ canvasContext: context, viewport, transform: [dpr,0,0,dpr,0,0] });
      await render.promise;
      if (!active || thumbnail) return;
      container.replaceChildren();
      container.style.setProperty('--scale-factor',String(scale));
      textLayer = new TextLayer({ textContentSource: await pdfPage.getTextContent(), container, viewport });
      if (!active) return;
      await textLayer.render();
    })().catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; render?.cancel(); textLayer?.cancel(); };
  },[pdf,page,width,height,rotation,thumbnail]);

  const point = (event: PointerEvent<HTMLDivElement>): {x:number;y:number} => {
    const bounds = event.currentTarget.getBoundingClientRect();
    // Clamp pointer coordinates to the displayed page before normalization.
    return {x: Math.max(0,Math.min(bounds.width,event.clientX-bounds.left)),y:Math.max(0,Math.min(bounds.height,event.clientY-bounds.top))};
  };
  const finish = (event: PointerEvent<HTMLDivElement>): void => {
    if (thumbnail) return;
    if (mode === 'select') {
      const origin=clickOrigin.current;clickOrigin.current=null;
      const end=point(event);
      // A click can open an existing annotation; dragging remains native text selection/copy.
      if(origin&&Math.abs(end.x-origin.x)<3&&Math.abs(end.y-origin.y)<3&&window.getSelection()?.isCollapsed) {
        // Convert the click to current viewport ratios before testing rotated annotation bounds.
        const x=end.x/dimensions.width,y=end.y/dimensions.height;
        const hit=annotations.find(annotation=>annotation.rects.some(stored=>{const rect=rotateRect(stored,rotation);return x>=rect.x&&x<=rect.x+rect.width&&y>=rect.y&&y<=rect.y+rect.height;}));
        if(hit)onAnnotation?.(hit.id);
      }
      return;
    }
    if (mode === 'area' && start.current) {
      const end = point(event); const begin = start.current; start.current = null; setDrag(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
      const rect = {x:Math.min(begin.x,end.x),y:Math.min(begin.y,end.y),width:Math.abs(end.x-begin.x),height:Math.abs(end.y-begin.y)};
      if (rect.width < 3 || rect.height < 3) return;
      onSelection?.({page,text:'',type:'area',rects:[rotateRect(normalizeRect(rect,dimensions.width,dimensions.height,page),-rotation)]});
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount || !textRef.current?.contains(selection.anchorNode) || !textRef.current.contains(selection.focusNode)) return;
    const bounds = rootRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const rects: NormalizedRect[] = [];
    const selected=selection.getRangeAt(0);
    const walker=document.createTreeWalker(textRef.current,NodeFilter.SHOW_TEXT);
    const fragments:DOMRect[]=[];
    // Leaf text ranges exclude enclosing span boxes, which can duplicate the same visible line.
    while(walker.nextNode()) {
      const node=walker.currentNode;
      if(!node.textContent?.trim()||!selected.intersectsNode(node))continue;
      const part=document.createRange();part.selectNodeContents(node);
      if(node===selected.startContainer)part.setStart(node,selected.startOffset);
      if(node===selected.endContainer)part.setEnd(node,selected.endOffset);
      if(!part.collapsed)fragments.push(...Array.from(part.getClientRects()));
    }
    for (const rect of fragments) {
      // Clip selection rectangles to this page before converting screen offsets into page ratios.
      const x = Math.max(0,rect.left-bounds.left), y = Math.max(0,rect.top-bounds.top);
      const w = Math.min(bounds.width,rect.right-bounds.left)-x, h = Math.min(bounds.height,rect.bottom-bounds.top)-y;
      if (w > 1 && h > 1) rects.push(rotateRect(normalizeRect({x,y,width:w,height:h},bounds.width,bounds.height,page),-rotation));
    }
    if (rects.length) {
      const text=selection.toString();
      selection.removeAllRanges(); // Clear synchronously so another pointer-up cannot resave this selection.
      onSelection?.({page,rects:mergeTextRects(rects,intrinsicRotation),text,type:mode});
    }
  };
  return <div ref={rootRef} className={`pdf-page relative shrink-0 bg-white shadow ${mode === 'area' && !thumbnail ? 'cursor-crosshair select-none' : ''}`} style={dimensions}
    onPointerDown={event => {if(event.button!==0)return;clickOrigin.current=point(event);if (mode === 'area' && !thumbnail) {start.current=point(event); event.currentTarget.setPointerCapture(event.pointerId);}}}
    onPointerMove={event => {if (start.current) {const p=point(event);setDrag({x:Math.min(start.current.x,p.x),y:Math.min(start.current.y,p.y),width:Math.abs(p.x-start.current.x),height:Math.abs(p.y-start.current.y)});}}}
    onPointerUp={finish} onPointerCancel={() => {start.current=null;setDrag(null);}}>
    <canvas ref={canvasRef} className="block h-full w-full" aria-label={`PDF 第 ${page} 页`} />
    <div ref={textRef} className={`textLayer ${mode === 'area' || thumbnail ? 'pointer-events-none' : ''}`} />
    <div className="pointer-events-none absolute inset-0">
      {annotations.flatMap(annotation => (annotation.type==='area'?annotation.rects:mergeTextRects(annotation.rects,intrinsicRotation)).map((stored,index) => {
        const rect=rotateRect(stored,rotation);
        // The text's bottom edge rotates with the page: bottom → left → top → right.
        const edge=(rotation+intrinsicRotation)%360;
        const underline=annotation.type==='underline'?`2px solid ${annotation.color}`:undefined;
        // Percentage positions multiply canonical ratios by the current viewport via CSS layout.
        return <span key={`${annotation.id}-${index}-${focusedAnnotation?.id===annotation.id?focusedAnnotation.version:0}`} aria-hidden="true" className={`pointer-events-none absolute ${focusedAnnotation?.id===annotation.id?'annotation-locator':''}`}
          style={{left:`${rect.x*100}%`,top:`${rect.y*100}%`,width:`${rect.width*100}%`,height:`${rect.height*100}%`,
            backgroundColor:annotation.type === 'underline' ? 'transparent' : annotation.color+'55',
            border:annotation.type === 'area' ? `2px solid ${annotation.color}` : undefined,
            borderBottom:edge===0?underline:undefined,borderLeft:edge===90?underline:undefined,
            borderTop:edge===180?underline:undefined,borderRight:edge===270?underline:undefined}} />;
      }))}
    </div>
    {drag && <div className="pointer-events-none absolute border-2 border-teal-600 bg-teal-400/20" style={{left:drag.x,top:drag.y,width:drag.width,height:drag.height}} />}
    {error && <p role="alert" className="absolute inset-0 overflow-auto bg-white/90 p-4 text-sm text-red-700">第 {page} 页加载失败：{error}</p>}
  </div>;
}
