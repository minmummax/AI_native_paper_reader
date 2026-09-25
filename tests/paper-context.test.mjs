import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
globalThis.crypto ??= webcrypto;
globalThis.window ??= {setTimeout};
const result=await build({entryPoints:[fileURLToPath(new URL('../src/pdf/paperContext.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {buildPaperSnapshot,buildSelectionSnapshot,selectPaperChunks}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const paper='a'.repeat(64);
function fixture(pages){let calls=0;return {get calls(){return calls;},numPages:pages.length,getPage:async page=>{calls++;return {getTextContent:async()=>({items:[{str:pages[page-1],hasEOL:true}]})};}};}
test('whole-paper extraction is cached; short papers preserve all readable pages and disclose scans',async()=>{
 const pdf=fixture(['Abstract. Intro','Method. Results','Conclusion','']);
 const a=await buildPaperSnapshot(pdf,paper,'总结',new AbortController().signal,()=>{});
 assert.equal(pdf.calls,4);assert.equal(a.coverage.readablePages,3);assert.equal(a.truncated,true);assert.deepEqual(a.coverage.selectedPages,[1,2,3]);
 await buildPaperSnapshot(pdf,paper,'方法',new AbortController().signal,()=>{});assert.equal(pdf.calls,4);
});
test('long-paper questions retrieve distant evidence within a UTF-8 budget with honest coverage',async()=>{
 const texts=Array.from({length:80},(_,i)=>`Page ${i+1} ${'Background filler. '.repeat(180)}`);
 texts[70]='The limitation is zephyr convergence. '+ 'Future work: improve stability. '.repeat(100);
 const snapshot=await buildPaperSnapshot(fixture(texts),paper,'zephyr convergence',new AbortController().signal,()=>{},6000);
 assert(snapshot.sources.some(s=>s.page===71));assert(snapshot.coverage.bytes<=6000);assert(snapshot.truncated);assert(snapshot.sources.every(s=>/^s[a-f0-9]{64}$/.test(s.id)));
});
test('synthesis questions preserve broad page coverage and cancellation leaves no partial cache',async()=>{
 const chunks=Array.from({length:100},(_,i)=>({page:i+1,order:i,text:'ordinary text '.repeat(90)}));chunks[88].text='Conclusion limitation '.repeat(45);
 const chosen=selectPaperChunks(chunks,'总结创新和局限',12000);assert(chosen.some(c=>c.page===89));assert(chosen.some(c=>c.page>95));assert(chosen.some(c=>c.page>20&&c.page<70));
 const pdf=fixture(['one','two','three']);const controller=new AbortController();
 await assert.rejects(buildPaperSnapshot(pdf,paper,'q',controller.signal,()=>controller.abort()));
 await buildPaperSnapshot(pdf,paper,'q',new AbortController().signal,()=>{});assert.equal(pdf.calls,4);
});
test('selection context retains exact selection and only nearby same-page evidence',async()=>{
 const pdf=fixture(['Earlier context. Target text. Later context.']);
 const snapshot=await buildSelectionSnapshot(pdf,{paperId:paper,page:1,text:'Target text.',rects:[]});
 assert.equal(snapshot.sources[0].text,'Target text.');assert(snapshot.sources[1].text.includes('Earlier'));assert(snapshot.sources[1].text.includes('Later'));assert.equal(snapshot.scope,'selection');
});
