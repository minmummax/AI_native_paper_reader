// Offline visual/interaction fixture. SQLite persistence is verified separately against a temporary real DB.
// Run after npm run build: node tests/preview-reading-room.mjs
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const mock=String.raw`
export const isTauri=()=>true;
export class Channel { onmessage=()=>{}; }
const cancelled=new Set();
export async function invoke(command,args={}) {
 if(command==='get_ai_profile')return {provider:'自定义 OpenAI 兼容',providerType:'custom',model:'Local research model',hasKey:false,requiresKey:false,profileId:'fixture',baseUrl:'http://localhost:8000/v1'};
 if(command==='begin_ai_request')return crypto.randomUUID();
 if(command==='cancel_ai_request'){cancelled.add(args.requestId);return;}
 if(command==='run_ai_action'){
  const {input,channel}=args;
  const answer=input.action==='translate'?'注意力机制根据上下文为词元分配权重。':'## 主要贡献\n\n这项研究提出了一种新的注意力计算方法。\n\n- **创新点**：根据上下文动态分配权重。\n- **局限**：尚需更大规模的实验验证。\n\n公式：$E=mc^2$';
  for(const text of [answer,'\n\n来源：['+input.context.sources[0].id+']']){
   await new Promise(resolve=>setTimeout(resolve,450));if(cancelled.has(input.requestId))throw Error('已停止');
   channel.onmessage({requestId:input.requestId,paperId:input.context.paperId,kind:'delta',text});
  }
  channel.onmessage({requestId:input.requestId,paperId:input.context.paperId,kind:'usage',inputTokens:180,outputTokens:80});
  return;
 }
 throw Error('Unexpected fixture command '+command);
}`;
const records=String.raw`
const key='reading-room-fixture-records';
const read=()=>JSON.parse(sessionStorage.getItem(key)||'[]');
export async function saveAiRecord(record){const rows=read().filter(item=>item.id!==record.id);rows.unshift(record);sessionStorage.setItem(key,JSON.stringify(rows));window.dispatchEvent(new Event('ai-records-changed'));}
export async function getAiRecords(paper,limit=50){return read().filter(row=>row.paperId===paper).slice(0,limit);}
export async function deleteAiRecord(paper,id){sessionStorage.setItem(key,JSON.stringify(read().filter(row=>row.id!==id||row.paperId!==paper)));window.dispatchEvent(new Event('ai-records-changed'));}
`;
const source=String.raw`
import React,{useState,useRef,useMemo,useCallback} from 'react';
import {createRoot} from 'react-dom/client';
import {LibraryShelf} from './src/components/LibraryShelf';
import {AiPanel} from './src/components/AiPanel';
import {AiHistory} from './src/components/AiHistory';
import {FloatingAssistant} from './src/components/FloatingAssistant';
import {SelectionToolbar} from './src/components/SelectionToolbar';
const tags=['大语言模型','计算机视觉','多模态学习','强化学习','科学发现','待读论文'].map((name,i)=>({id:String(i),name,color:null,paper_count:2}));
const titles=['Attention Is All You Need','DeepSeek: Efficient Reasoning at Scale','Learning Transferable Visual Models','A Survey of Multimodal Large Language Models','Visual Instruction Tuning','Scaling Reinforcement Learning with Human Feedback','Discovering Scientific Laws with Neural Networks','Understanding Emergent Abilities'];
const papers=titles.map((title,i)=>({id:String(i).repeat(64),title,authors:['Research Group'],year:2025-i%4,total_pages:30,last_read_at:'2026-09-'+String(20-i),created_at:'2026-08-'+String(20+i),tags:[tags[i%6],...(i<2?[tags[5]]:[])],source_name:title+'.pdf'}));
const evidence='Attention assigns weights to tokens based on the surrounding context.';
function Fixture(){
 const [paper,setPaper]=useState(null),[query,setQuery]=useState(''),[filter,setFilter]=useState({}),[selection,setSelection]=useState(null),[intent,setIntent]=useState(null),[started,setStarted]=useState(false),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[jump,setJump]=useState('');
 const search=useRef(null);const dismiss=useCallback(()=>setSelection(null),[]);
 const pdf=useMemo(()=>({numPages:30,getPage:async page=>({getTextContent:async()=>({items:[{str:(page===1?'Abstract and contribution. ':page===29?'Conclusion and limitations. ':'Method and experiments. ')+evidence.repeat(25),hasEOL:true}]})})}),[]);
 const filtered=papers.filter(p=>(!query||p.title.toLowerCase().includes(query.toLowerCase()))&&(!filter.untagged||!p.tags.length)&&(filter.tagIds||[]).every(id=>p.tags.some(tag=>tag.id===id))).sort((a,b)=>{const field=filter.sort==='year'?'year':filter.sort==='title'?'title':filter.sort==='added'?'created_at':'last_read_at';return String(a[field]).localeCompare(String(b[field]))*(filter.direction==='asc'||filter.sort==='title'?1:-1);});
 const select=()=>{const node=document.getElementById('evidence');const range=document.createRange();range.selectNodeContents(node);const native=window.getSelection();native.removeAllRanges();native.addRange(range);setSelection({paperId:paper.id,page:1,text:evidence,rects:[{x:.1,y:.1,width:.6,height:.1,page:1}]});};
 return <div className="flex h-dvh flex-col bg-[#f6f3ed]"><header className="flex h-14 shrink-0 items-center gap-4 border-b bg-white px-6"><button className="small-button text-teal-800" onClick={()=>{setPaper(null);setStarted(false);setSelection(null);}}>我的书架</button><span className="text-xs text-stone-400">离线合成界面 · 不发送真实模型请求</span>{paper&&<button className="small-button ml-auto" onClick={()=>{setIntent(null);setStarted(true);setOpen(true);}}>AI 对话</button>}</header>
 {!paper?<main className="flex-1 overflow-auto p-8" style={{minWidth:0}}><LibraryShelf spacious papers={filtered} tags={tags} collections={[]} activeId={null} query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} searchRef={search} modifier="⌘" onSelect={setPaper} onOrganize={()=>setJump('在应用中打开多标签编辑')} onDelete={()=>{}}/></main>:<div className="flex min-h-0 flex-1"><main className="flex-1 overflow-auto p-8"><button className="small-button border" onClick={select}>选中测试片段</button><div className="mx-auto mt-6 max-w-2xl bg-white p-10 shadow-sm"><h1 className="mb-6 font-serif text-2xl">{paper.title}</h1><p id="evidence" className="font-serif text-lg leading-8">{evidence}</p><p className="mt-8 text-sm leading-7 text-stone-500">This is a synthetic paper for validating selection translation and paper-level questions. No private document is loaded.</p></div><p>{jump}</p></main><aside className="flex shrink-0 flex-col border-l bg-white" style={{width:320,minWidth:0}}><h2 className="border-b p-4 text-sm">AI 阅读记录</h2><AiHistory paperId={paper.id} busy={busy} onJump={source=>{setJump('已定位第 '+source.page+' 页');setOpen(false);}}/></aside></div>}
 {selection&&<SelectionToolbar selection={selection} busy={busy} onDismiss={dismiss} onAction={kind=>{setIntent({id:crypto.randomUUID(),kind,selection});setSelection(null);setStarted(true);setOpen(true);}}/>}
 {paper&&started&&<FloatingAssistant open={open} title={paper.title} onMinimize={()=>setOpen(false)} onClose={()=>{setOpen(false);setStarted(false);}}><AiPanel paper={paper} pdf={pdf} intent={intent} profileRevision={0} onSettings={()=>{}} onBusy={setBusy} onJump={source=>setJump('已定位第 '+source.page+' 页')} onError={error=>setJump(String(error))}/></FloatingAssistant>}
 </div>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
`;
const bundle=await build({stdin:{contents:source,loader:'jsx',resolveDir:root},bundle:true,write:false,format:'esm',platform:'browser',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'fixture',setup(builder){builder.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'core',namespace:'fixture'}));builder.onResolve({filter:/\/services\/aiRecords$/},()=>({path:'records',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='core'?mock:records,loader:'js'}));}}]});
const assets=await readdir(path.join(root,'dist','assets'));
const css=Buffer.concat(await Promise.all(assets.filter(name=>name.endsWith('.css')).map(name=>readFile(path.join(root,'dist','assets',name)))));
createServer(async(req,res)=>{
 const name=req.url?.split('/').at(-1);
 if(name&&assets.includes(name)&&/\.(woff2?|ttf)$/.test(name)){res.end(await readFile(path.join(root,'dist','assets',name)));return;}
 const item=req.url==='/app.js'?['text/javascript',bundle.outputFiles[0].contents]:req.url==='/style.css'?['text/css',css]:['text/html','<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/app.js"></script></html>'];
 res.setHeader('Content-Type',item[0]);res.end(item[1]);
}).listen(1423,'127.0.0.1',()=>console.log('http://127.0.0.1:1423'));
