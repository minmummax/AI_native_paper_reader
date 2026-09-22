import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPage, type SelectionDraft } from './PdfPage';
import type { Annotation } from '../types';

export interface ReaderHandle { jumpTo: (page: number) => void }
interface Props {
  pdf: PDFDocumentProxy; zoom: number; rotation: number; initialPage: number;
  annotations: Annotation[]; mode: 'highlight'|'area'|'underline';
  onPage: (page: number) => void; onSelection: (draft: SelectionDraft) => void; onAnnotation: (id: string) => void;
}

/** Virtualizes PDF pages: only viewport rows plus one neighboring row are mounted. */
export const PdfReader = forwardRef<ReaderHandle,Props>(function PdfReader({pdf,zoom,rotation,initialPage,annotations,mode,onPage,onSelection,onAnnotation},ref) {
  const scrollRef=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:800,height:800});
  const [ratio,setRatio]=useState(1.414);
  const [scrollTop,setScrollTop]=useState(0);
  const currentPage=useRef(initialPage);
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
  useImperativeHandle(ref,() => ({jumpTo(page) {
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
    const page=Math.min(pdf.numPages,Math.max(1,Math.floor((top+32)/rowHeight)+1));
    if(page!==currentPage.current){currentPage.current=page;onPage(page);}
  }}>
    <div className="relative" style={{height:rowHeight*pdf.numPages,width:Math.max(size.width,pageWidth+48)}}>
      {pages.map(page => <div key={`${page}-${rotation}-${zoom}`} data-pdf-page={page} className="absolute left-0 flex w-full flex-col items-center pt-3" style={{top:(page-1)*rowHeight,height:rowHeight}}>
        <PdfPage pdf={pdf} page={page} width={pageWidth} height={pageHeight} rotation={rotation} annotations={annotations.filter(item => item.page_number===page)} mode={mode} onSelection={onSelection} onAnnotation={onAnnotation} />
        <span className="mt-1 text-[10px] text-slate-400">{page} / {pdf.numPages}</span>
      </div>)}
    </div>
  </div>;
});
