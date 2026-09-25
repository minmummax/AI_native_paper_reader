import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/services/aiRecords.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'sqlite-test',setup(builder){builder.onResolve({filter:/^\.\/database$/},()=>({path:'database',namespace:'test'}));builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function initializeDatabase(){return globalThis.__aiDb;}'}));}}]});
const {saveAiRecord,getAiRecords,deleteAiRecord,decodeSources}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('saved selections survive DB reopening, preserve Markdown/anchors, isolate papers and delete explicitly',async()=>{
 const root=await mkdtemp(join(tmpdir(),'paper-reader-history-'));const db=join(root,'test.db');
 const call=(operation,sql='',params=[])=>JSON.parse(execFileSync(process.env.PYTHON ?? (process.platform==='win32'?'python':'python3'),[fileURLToPath(new URL('./repository_sqlite.py',import.meta.url)),db],{encoding:'utf8',input:JSON.stringify({operation,sql,params})}));
 globalThis.window={dispatchEvent:()=>{}};
 globalThis.__aiDb={select:async(sql,params)=>call('select',sql,params),execute:async(sql,params)=>call('execute',sql,params)};
 try{
  call('initialize');call('execute',"INSERT INTO papers(id,title,file_path,file_size,total_pages) VALUES('p','Paper','p.pdf',10,2),('q','Other','q.pdf',10,2)");
  const sources=[{id:'s'+'a'.repeat(64),page:1,text:'selected',rects:[{x:.1,y:.1,width:.3,height:.1,page:1}]},{id:'s'+'b'.repeat(64),page:1,text:'nearby',rects:[]}];
  const record={id:'r',paperId:'p',kind:'translate',model:'test',selectedText:'selected',question:'translate',answer:'',sources,status:'running',createdAt:'2026-09-25T00:00:00Z'};
  await saveAiRecord(record);await saveAiRecord({...record,status:'succeeded',answer:'## 翻译\n$E=mc^2$',inputTokens:10,outputTokens:5});
  const restored=await getAiRecords('p');assert.equal(restored.length,1);assert.equal(restored[0].answer,'## 翻译\n$E=mc^2$');assert.deepEqual(restored[0].sources,sources);assert.equal((await getAiRecords('q')).length,0);
  await deleteAiRecord('q','r');assert.equal((await getAiRecords('p')).length,1);
  await deleteAiRecord('p','r');assert.equal((await getAiRecords('p')).length,0);
  await saveAiRecord(record);call('execute',"DELETE FROM papers WHERE id='p'");assert.equal((await getAiRecords('p')).length,0);
  assert.throws(()=>decodeSources(JSON.stringify([{...sources[0],rects:[{x:4,y:0,width:1,height:1,page:1}]}])));
 }finally{delete globalThis.__aiDb;delete globalThis.window;await rm(root,{recursive:true,force:true});}
});
