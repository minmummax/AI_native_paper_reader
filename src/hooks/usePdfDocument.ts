import { useEffect, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import { loadPdf,readPdf } from '../pdf/document';

/** @param id Managed PDF ID. @returns Cancellable local worker document state. */
export function usePdfDocument(id: string | null): { pdf: PDFDocumentProxy | null; loading: boolean; error: string | null } {
  const [state,setState]=useState<{pdf:PDFDocumentProxy|null;loading:boolean;error:string|null}>({pdf:null,loading:false,error:null});
  useEffect(() => {
    if(!id){setState({pdf:null,loading:false,error:null});return;}
    let active=true;let task:PDFDocumentLoadingTask|undefined;
    setState({pdf:null,loading:true,error:null});
    void (async () => {
      const bytes=await readPdf(id);if(!active)return;
      task=loadPdf(bytes);task.onPassword=()=>{void task?.destroy();};
      const pdf=await task.promise;
      if(active)setState({pdf,loading:false,error:null});
    })().catch((reason:unknown)=>{if(active)setState({pdf:null,loading:false,error:reason instanceof Error?reason.message:String(reason)});});
    return ()=>{active=false;void task?.destroy();};
  },[id]);
  return state;
}
