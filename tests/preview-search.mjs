// Regression fixture uses the actual adjacent search/reader JSX from App.tsx.
// Run: node tests/preview-search.mjs; open localhost:1422 and run the checks.
// --broken restores the old duplicate keys to verify the regression is detected.
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
let siblings=app.slice(app.indexOf('{findOpen&&<PdfSearch'),app.indexOf('\n        </>:active?'));
if(process.argv.includes('--broken')) siblings=siblings.replaceAll('key={`search-${active.id}`}','key={active.id}').replaceAll('key={`reader-${active.id}`}','key={active.id}');
if(!siblings.includes('<PdfReader'))throw new Error('Reader JSX not found');
const source=`
import React,{useState,useRef,useCallback,forwardRef,useImperativeHandle,act} from 'react';
import {createRoot} from 'react-dom/client';
import {PdfSearch} from './src/components/PdfSearch';
let mounts=0;
const pdf={numPages:1,getPage:async()=>({getTextContent:async()=>({items:[{str:'attention test',hasEOL:true}]})})};
const PdfReader=forwardRef(function Reader({searchMatch},ref){
 const [mount]=useState(()=>++mounts);const [page,setPage]=useState(8);
 useImperativeHandle(ref,()=>({jumpTo:setPage}),[]);
 return <section aria-label="阅读器"><output data-mount={mount}>第 {page} 页 · {searchMatch?'有搜索高亮':'无搜索高亮'}</output></section>;
});
function Fixture(){
 const [findOpen,setFindOpen]=useState(false);const [searchMatch,setSearchMatch]=useState(null);
 const active={id:'paper-a',last_read_page:8};const reader=useRef(null);
 const showMatch=useCallback(match=>{setSearchMatch(match);if(match)reader.current?.jumpTo(match.page);},[]);
 const page=8,zoom=1,rotation=0,annotations=[],mode='select';
 const report=()=>{},onPage=()=>{},onSelection=()=>{},setAiSelection=()=>{},setAnchor=()=>{},setRightOpen=()=>{},setRightTab=()=>{};
 return <><button id="open" onClick={()=>setFindOpen(true)}>查找正文</button>
 ${siblings}
 </>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
const count=()=>document.querySelectorAll('[role="search"]').length;
const click=async element=>{if(!element)throw Error('Missing control');await act(async()=>element.click());};
const close=()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='关闭');
const assert=(condition,message)=>{if(!condition)throw Error(message);};
document.getElementById('run').onclick=async()=>{
 const result=document.getElementById('result');result.textContent='检查中…';
 try{
  const mount=document.querySelector('[data-mount]').dataset.mount;
  for(let i=0;i<10;i++){
   await click(document.getElementById('open'));await click(document.getElementById('open'));
   assert(count()===1,'重复打开后出现多个搜索栏');
   await click(close());assert(count()===0,'点击关闭后搜索栏残留');
   assert(document.querySelector('[data-mount]').dataset.mount===mount,'关闭搜索导致阅读器重建');
  }
  await click(document.getElementById('open'));
  const input=document.getElementById('pdf-find-input');
  await act(async()=>{
   Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'attention');
   input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await act(async()=>new Promise(resolve=>setTimeout(resolve,350)));
  assert(document.querySelector('output').textContent.includes('有搜索高亮'),'搜索未返回匹配');
  await act(async()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert(count()===0,'Esc 关闭后搜索栏残留');
  assert(document.querySelector('output').textContent.includes('第 1 页 · 无搜索高亮'),'关闭后高亮未清除或阅读位置改变');
  await click(document.getElementById('open'));
  assert(document.getElementById('pdf-find-input').value==='','重新打开未清空查询');
  await click(close());assert(count()===0,'再次关闭失败');
  result.textContent='PASS：10 轮重复打开/关闭、Esc 关闭、匹配高亮清除、阅读器不重建、阅读位置保留、重新打开清空查询';
 }catch(error){result.textContent='FAIL：'+error.message;}
};`;
const built=await build({stdin:{contents:source,loader:'jsx',resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic'});
const html='<!doctype html><html lang="zh"><meta charset="utf-8"><title>搜索关闭回归</title><body><h1>搜索关闭回归（合成 PDF）</h1><button id="run">运行回归检查</button><p id="result" role="status">尚未运行</p><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
createServer((request,response)=>{response.setHeader('Content-Type',request.url==='/app.js'?'text/javascript':'text/html');response.end(request.url==='/app.js'?built.outputFiles[0].contents:html);}).listen(1422,'127.0.0.1',()=>console.log('http://127.0.0.1:1422'));
