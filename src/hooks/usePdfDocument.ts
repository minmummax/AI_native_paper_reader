import { useEffect, useState } from 'react';
import type { PDFDocumentProxy, PDFDocumentLoadingTask } from 'pdfjs-dist';
import { loadPdf,readPdf } from '../pdf/document';

/** @param id Managed PDF ID. @returns Cancellable local worker document state. */
export function usePdfDocument(id: string | null): { pdf: PDFDocumentProxy | null; loading: boolean; error: string | null } {
  const [state,setState]=useState<{id:string|null;pdf:PDFDocumentProxy|null;loading:boolean;error:string|null}>({id:null,pdf:null,loading:false,error:null});
  useEffect(() => {
    if(!id){setState({id:null,pdf:null,loading:false,error:null});return;}
    let active=true;let task:PDFDocumentLoadingTask|undefined;
    setState({id,pdf:null,loading:true,error:null});
    void (async () => {
      const bytes=await readPdf(id);if(!active)return;
      task=loadPdf(bytes);task.onPassword=()=>{void task?.destroy();};
      const pdf=await task.promise;
      if(active)setState({id,pdf,loading:false,error:null});
    })().catch((reason:unknown)=>{if(active)setState({id,pdf:null,loading:false,error:reason instanceof Error?reason.message:String(reason)});});
    return ()=>{active=false;void task?.destroy();};
  },[id]);
  // An ID changes during render, before effect cleanup; never expose the previous paper's PDF.
  return state.id===id?state:{pdf:null,loading:Boolean(id),error:null};
}
