import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Node 18 test compatibility; the desktop WebView supplies this native API.
Promise.withResolvers??=function(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const {getDocument}=await import('pdfjs-dist/build/pdf.mjs');
const fixture=execFileSync('python3',[fileURLToPath(new URL('./generate_chinese_fixture.py',import.meta.url))],{encoding:'utf8'}).trim();
const cmapDirectory=resolve('node_modules','pdfjs-dist','cmaps');

async function extract(available){
  const loaded=[];
  class LocalCMapFactory {
    async fetch({name}){
      if(!available)throw new Error('Simulated blocked local resource');
      loaded.push(name);
      return {cMapData:new Uint8Array(await readFile(join(cmapDirectory,`${name}.bcmap`))),isCompressed:true};
    }
  }
  const task=getDocument({data:new Uint8Array(await readFile(fixture)),useWorkerFetch:false,CMapReaderFactory:LocalCMapFactory,isEvalSupported:false,useSystemFonts:true});
  try{
    const pdf=await task.promise;
    const content=await (await pdf.getPage(1)).getTextContent();
    return {text:content.items.map(item=>'str' in item?item.str:'').join(''),loaded};
  }finally{await task.destroy();}
}

test('Chinese text is decoded only when bundled CMaps can be read',async()=>{
  const blocked=await extract(false);
  assert.ok(!blocked.text.includes('中文论文阅读测试'));
  const available=await extract(true);
  assert.ok(available.text.includes('中文论文阅读测试'),available.text);
  assert.ok(available.text.includes('本地阅读器应完整显示中文'));
  assert.ok(available.loaded.includes('UniGB-UCS2-H'));
  assert.ok(available.loaded.includes('Adobe-GB1-UCS2'));
});

test('desktop policies permit same-origin packaged CMaps and fonts without opening remote access',async()=>{
  const config=JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json',import.meta.url),'utf8'));
  for(const key of ['csp','devCsp']){
    const policy=config.app.security[key];
    assert.match(policy,/(?:^|;)\s*connect-src[^;]*'self'/);
    assert.match(policy,/(?:^|;)\s*font-src[^;]*'self'/);
    assert.ok(!policy.includes('https:'));
  }
});
