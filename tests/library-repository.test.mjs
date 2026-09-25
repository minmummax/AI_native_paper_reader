import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';

// Bundle the real repository while replacing only desktop transport and unused PDF imports.
const compiled=await build({entryPoints:[fileURLToPath(new URL('../src/services/library.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node',plugins:[{
  name:'local-sqlite-transport',setup(builder){
    builder.onResolve({filter:/^(\.\/database|\.\.\/pdf\/document|@tauri-apps\/api\/core)$/},args=>({path:args.path,namespace:'qa-transport'}));
    builder.onLoad({filter:/.*/,namespace:'qa-transport'},args=>({contents:args.path==='./database'
      ?'export async function initializeDatabase(){return globalThis.__repositoryDb;}'
      :args.path==='../pdf/document'?'export const extractMetadata=()=>{},loadPdf=()=>{},readPdf=()=>{};'
      :'export function invoke(){throw new Error("unexpected desktop file access in repository test");}'}));
  },
}]});
const repository=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);

test('rename, create-and-assign tags, classification search and note links survive repository reload',async()=>{
  const root=await mkdtemp(join(tmpdir(),'paper-reader-repository-'));
  const path=join(root,'test.db');
  const call=(operation,sql='',params=[])=>JSON.parse(execFileSync(process.env.PYTHON ?? (process.platform==='win32'?'python':'python3'),[fileURLToPath(new URL('./repository_sqlite.py',import.meta.url)),path],{encoding:'utf8',input:JSON.stringify({operation,sql,params})}));
  const oldCrypto=globalThis.crypto;
  globalThis.crypto??=webcrypto;
  globalThis.__repositoryDb={select:async(sql,params)=>call('select',sql,params),execute:async(sql,params)=>call('execute',sql,params)};
  try {
    call('initialize');
    call('execute',"INSERT INTO papers(id,title,source_name,file_path,file_size,total_pages) VALUES ($1,$2,$3,$4,$5,$6)",['paper','2024-01-01','Original filename.pdf','managed.pdf',512,30]);
    const renamed=await repository.renamePaper('paper','A useful title');
    assert.equal(renamed.title,'A useful title');assert.equal(renamed.source_name,'Original filename.pdf');
    const tag=await repository.createGroup('tag','机器学习');
    await repository.setMembership('paper','tag',tag,true);
    assert.equal(await repository.createGroup('tag','机器学习'),tag,'duplicate group names reuse the same record');
    const collection=await repository.createGroup('collection','Thesis');
    await repository.setMembership('paper','collection',collection,true);
    assert.equal((await repository.getPapers({tagId:tag}))[0].title,'A useful title');
    assert.equal((await repository.getPapers({query:'Original 机器学习'}))[0].tags[0].name,'机器学习');
    assert.equal((await repository.getGroups()).tags[0].paper_count,1);
    assert.equal((await repository.getPapers({untagged:true})).length,0);
    const secondTag=await repository.createGroup('tag','语言模型');
    await repository.setMembership('paper','tag',secondTag,true);
    assert.equal((await repository.getPapers({tagIds:[tag,secondTag]})).length,1);
    assert.equal((await repository.getPapers({tagIds:[tag,'absent']})).length,0);
    await repository.setMembership('paper','tag',secondTag,false);
    const annotation=await repository.saveAnnotation({paper_id:'paper',page_number:3,type:'underline',color:'#FFE066',selected_text:'selection',rects:[{x:0.1,y:0.2,width:0.5,height:0.03,page:3}]});
    await repository.saveNote({paper_id:'paper',annotation_id:annotation.id,page_number:3,note_type:'question',content_markdown:'Does this improve accuracy?'});
    assert.equal((await repository.getPapers({query:'accuracy'})).length,1);
    await assert.rejects(repository.renamePaper('paper','  '));
    await repository.setMembership('paper','tag',tag,false);
    assert.equal((await repository.getPapers({tagId:tag})).length,0);
    assert.equal((await repository.getPapers({untagged:true})).length,1);
    await repository.saveSetting('layout',JSON.stringify({left:true,right:true,leftWidth:360,rightWidth:420}));
    assert.equal(JSON.parse(await repository.getSetting('layout')).leftWidth,360);
    assert.equal((await repository.getNotes('paper'))[0].annotation_id,annotation.id);
  }finally{
    delete globalThis.__repositoryDb;
    if(oldCrypto===undefined)delete globalThis.crypto;
    await rm(root,{recursive:true,force:true});
  }
});
