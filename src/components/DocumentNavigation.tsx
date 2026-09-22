import { useEffect,useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfPage } from '../pdf/PdfPage';

interface OutlineItem { title:string; dest:unknown; items:OutlineItem[] }
type Outline = OutlineItem[] | null;
interface Props { pdf:PDFDocumentProxy; page:number; jump:(page:number)=>void; onError:(reason:unknown)=>void }

/** Shows local PDF outlines and a bounded six-page thumbnail window. */
export function DocumentNavigation({pdf,page,jump,onError}:Props) {
  const [outline,setOutline]=useState<Outline>(null);
  const [tab,setTab]=useState<'outline'|'thumbnails'>('outline');
  const [batch,setBatch]=useState(0);
  useEffect(()=>{let active=true;void pdf.getOutline().then(value=>{if(active)setOutline(value);}).catch(onError);return()=>{active=false;};},[pdf,onError]);
  useEffect(()=>setBatch(Math.floor((page-1)/6)),[page]);
  const navigate=async(dest:unknown):Promise<void>=>{
    const destination=typeof dest==='string'?await pdf.getDestination(dest):dest;
    if(!Array.isArray(destination)||!destination.length)return;
    const target:unknown=destination[0];
    if(typeof target==='number'){jump(target+1);return;}
    if(typeof target==='object'&&target!==null&&'num' in target&&'gen' in target&&typeof target.num==='number'&&typeof target.gen==='number')jump(await pdf.getPageIndex({num:target.num,gen:target.gen})+1);
  };
  const renderOutline=(items:NonNullable<Outline>,depth=0):React.ReactNode=>items.map((item,index)=><div key={`${depth}-${index}`}>
    <button className="w-full rounded px-2 py-2 text-left text-xs leading-5 hover:bg-stone-200" style={{paddingLeft:8+depth*12}} onClick={()=>{void navigate(item.dest).catch(onError);}} disabled={!item.dest}>{item.title}</button>
    {item.items.length>0&&renderOutline(item.items,depth+1)}
  </div>);
  return <div>
    <div className="mb-3 flex gap-2"><button className={`small-button ${tab==='outline'?'bg-teal-50 text-teal-800':''}`} onClick={()=>setTab('outline')}>章节目录</button><button className={`small-button ${tab==='thumbnails'?'bg-teal-50 text-teal-800':''}`} onClick={()=>setTab('thumbnails')}>缩略图</button></div>
    {tab==='outline'?(outline?.length?renderOutline(outline):<p className="py-8 text-center text-xs text-slate-400">这份 PDF 没有内置目录</p>):<>
      <div className="mb-3 flex justify-between"><button className="small-button" disabled={batch===0} onClick={()=>setBatch(value=>value-1)}>上一组</button><button className="small-button" disabled={(batch+1)*6>=pdf.numPages} onClick={()=>setBatch(value=>value+1)}>下一组</button></div>
      <div className="grid grid-cols-2 gap-3">{Array.from({length:Math.min(6,pdf.numPages-batch*6)},(_,index)=>batch*6+index+1).map(number=><button key={number} className={`flex flex-col items-center rounded border p-1 ${page===number?'border-teal-700':'border-transparent'}`} aria-label={`跳到第 ${number} 页`} onClick={()=>jump(number)}><PdfPage pdf={pdf} page={number} width={86} height={122} rotation={0} thumbnail/><span className="mt-1 text-xs">{number}</span></button>)}</div>
    </>}
  </div>;
}
