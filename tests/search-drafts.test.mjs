import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
async function load(file){const result=await build({entryPoints:[fileURLToPath(new URL(file,import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);}
const {findPageMatches}=await load('../src/pdf/search.ts');
const drafts=await load('../src/services/drafts.ts');
const content=(...items)=>({items:items.map(([str,hasEOL=false])=>({str,hasEOL}))});
test('search crosses text runs and line breaks while retaining exact offsets',()=>{
  const found=findPageMatches(content(['Deep '],['learn',true],['ing 中文']), 'learn ing', 4);
  assert.deepEqual(found[0].parts,[{item:1,start:0,end:5},{item:2,start:0,end:3}]);
  assert.equal(found[0].page,4);
  assert.equal(findPageMatches(content(['中文中文']), '中文',1).length,2);
});
test('queries are literal, case-insensitive and do not match empty input',()=>{
  assert.equal(findPageMatches(content(['A+B a+b']), 'a+b',1).length,2);
  assert.equal(findPageMatches(content(['abc']), '   ',1).length,0);
  assert.equal(findPageMatches(content(['İx test']), 'test',1)[0].parts[0].start,3);
});
const values=new Map();
globalThis.localStorage={get length(){return values.size;},key:index=>[...values.keys()][index]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
test('drafts survive reopening, remain isolated by paper, and round-trip through backup',()=>{
  values.clear();const a='a'.repeat(64),b='b'.repeat(64);
  const draft={text:'未保存的中文笔记',kind:'question',editingId:'note-id',annotationId:'anchor-id',page:9};
  drafts.writeDraft(a,draft);drafts.writeDraft(b,{...draft,text:'第二篇'});
  assert.deepEqual(drafts.readDraft(a),draft);
  const backup=drafts.validateDrafts(drafts.exportDrafts());
  drafts.writeDraft(a,null);assert.equal(drafts.readDraft(a),null);
  drafts.importDrafts(backup);assert.deepEqual(drafts.readDraft(a),draft);
  assert.equal(drafts.readDraft(b).text,'第二篇');
  assert.throws(()=>drafts.validateDrafts({[a]:{...draft,page:-1}}));
  assert.deepEqual(drafts.readDraft(a),draft);
});
