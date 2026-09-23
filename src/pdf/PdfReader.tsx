import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { SearchMatch } from './search';
import { PdfPage, type SelectionDraft } from './PdfPage';
import { annotationScrollTarget } from './annotationNavigation';
import type { Annotation, ReaderTool } from '../types';

export interface ReaderHandle { jumpTo: (page: number) => void; jumpToAnnotation: (annotation: Annotation) => void }
interface Props {
  pdf: PDFDocumentProxy; zoom: number; rotation: number; initialPage: number;
  annotations: Annotation[]; mode: ReaderTool;
  searchMatch?:SearchMatch|null;
  onError: (error:unknown)=>void;
  onPage: (page: number) => void; onSelection: (draft: SelectionDraft) => void; onAnnotation: (id: string) => void;
}

/** Virtualizes PDF pages: only viewport rows plus one neighboring row are mounted. */
export const PdfReader = forwardRef<ReaderHandle,Props>(function PdfReader({pdf,zoom,rotation,initialPage,annotations,mode,searchMatch,onPage,onSelection,onAnnotation,onError},ref) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:800,height:800});
  const [ratio,setRatio]=useState(1.414);
  const [scrollTop,setScrollTop]=useState(0);
  const currentPage=useRef(initialPage);
  const requestId=useRef(0);
  const [target,setTarget]=useState<{annotation:Annotation;version:number}|null>(null);
  const [focused,setFocused]=useState<{id:string;version:number}|null>(null);
  const lockedPage=useRef<{page:number;top:number}|null>(null);
  useEffect(()=>{
    if(!focused)return;
    const timer=window.setTimeout(()=>setFocused(null),2600);
    return()=>window.clearTimeout(timer);
  },[focused]);
  useEffect(() => {
    const container=scrollRef.current;
    if (!container) return;
    const observer=new ResizeObserver(entries => {const rect=entries[0]?.contentRect;if(rect)setSize({width:rect.width,height:rect.height});});
    observer.observe(container);return () => observer.disconnect();
  },[]);
  useEffect(() => {let active=true;void pdf.getPage(1).then(page => {
    const viewport=page.getViewport({scale:1,rotation:page.rotate+rotation});
    // First-page aspect ratio defines virtual row dimensions; each other page fits inside its row.
    if(active)setRatio(viewport.height/viewport.width);
  });return () => {active=false;};},[pdf,rotation]);
  // Zoom scales the fit-width viewport; each row reserves page height plus a 32 CSS-pixel gap.
  const pageWidth=Math.max(220,size.width-48)*zoom;
  const pageHeight=pageWidth*ratio;
  const rowHeight=pageHeight+32;
  useEffect(() => {
    if(scrollRef.current) {scrollRef.current.scrollTop=(currentPage.current-1)*rowHeight;setScrollTop(scrollRef.current.scrollTop);}
  },[rowHeight]);
  useEffect(()=>{
    if(!target)return;
    let live=true;
    const annotation=target.annotation;
    void (async()=>{
      const pdfPage=await pdf.getPage(annotation.page_number);
      if(!live||!scrollRef.current)return;
      const rect=annotation.rects[0];
      if(!rect)return;
      const base=pdfPage.getViewport({scale:1,rotation:pdfPage.rotate+rotation});
      // Use the renderer's fit scale for mixed-size pages, then map canonical ratios to CSS pixels.
      const scale=Math.min(pageWidth/base.width,pageHeight/base.height);
      const position=annotationScrollTarget(rect,{page:annotation.page_number,rowHeight,pageWidth:base.width*scale,pageHeight:base.height*scale,
        viewportWidth:size.width,viewportHeight:size.height,contentWidth:Math.max(size.width,pageWidth+48),contentHeight:rowHeight*pdf.numPages,rotation});
      const container=scrollRef.current;
      container.scrollTo({...position,behavior:'instant'});
      lockedPage.current={page:annotation.page_number,top:container.scrollTop};
      currentPage.current=annotation.page_number;setScrollTop(container.scrollTop);onPage(annotation.page_number);
      setFocused({id:annotation.id,version:target.version});
    })().catch(error=>{if(live)onError(error);});
    return()=>{live=false;};
  },[target,pdf,pageWidth,pageHeight,rowHeight,rotation,size.width,size.height,onPage,onError]);
  useImperativeHandle(ref,() => ({jumpToAnnotation(annotation) {
    setTarget({annotation,version:++requestId.current});
  },jumpTo(page) {
    setTarget(null);setFocused(null);lockedPage.current=null;
    const next=Math.max(1,Math.min(pdf.numPages,Math.trunc(page)));
    if(scrollRef.current)scrollRef.current.scrollTop=(next-1)*rowHeight;
    currentPage.current=next;setScrollTop((next-1)*rowHeight);onPage(next);
  }}),[pdf.numPages,rowHeight,onPage]);
  // Virtual row index = scroll offset / row height; overscan one page on either side.
  const first=Math.max(0,Math.floor(scrollTop/rowHeight)-1);
  const last=Math.min(pdf.numPages-1,Math.ceil((scrollTop+size.height)/rowHeight)+1);
  const pages=Array.from({length:Math.max(0,last-first+1)},(_,index) => first+index+1);
  return <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto" aria-label="PDF 阅读区域" onScroll={event => {
    const top=event.currentTarget.scrollTop;setScrollTop(top);
    const lock=lockedPage.current;
    const page=lock&&Math.abs(top-lock.top)<2?lock.page:Math.min(pdf.numPages,Math.max(1,Math.floor((top+32)/rowHeight)+1));
    if(lock&&Math.abs(top-lock.top)>=2){lockedPage.current=null;setTarget(null);}
    if(page!==currentPage.current){currentPage.current=page;onPage(page);}
  }}>
    <div className="relative" style={{height:rowHeight*pdf.numPages,width:Math.max(size.width,pageWidth+48)}}>
      {pages.map(page => <div key={`${page}-${rotation}-${zoom}`} data-pdf-page={page} className="absolute left-0 flex w-full flex-col items-center pt-3" style={{top:(page-1)*rowHeight,height:rowHeight}}>
        <PdfPage searchMatch={searchMatch} pdf={pdf} page={page} width={pageWidth} height={pageHeight} rotation={rotation} annotations={annotations.filter(item => item.page_number===page)} mode={mode} focusedAnnotation={focused} onSelection={onSelection} onAnnotation={onAnnotation} />
        <span className="mt-1 text-[10px] text-slate-400">{page} / {pdf.numPages}</span>
      </div>)}
    </div>
  </div>;
});
