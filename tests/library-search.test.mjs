import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source=await readFile(new URL('../src/services/libraryQueries.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {buildPaperSearch}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('production query matches names, filenames, authors, years, notes and classification',()=>{
  const cases=[
    [{query:'original_zhang'},['p1']], [{query:'Ada 2024'},['p1']], [{query:'张三'},['p1']],
    [{query:'视觉'},['p1']], [{query:'Thesis'},['p1']], [{query:'"variance reduction"'},['p1']],
    [{query:'100%_real'},['p2']], [{query:"' OR 1=1 --"},[]],
    [{tagId:'t'},['p1']], [{collectionId:'c',query:'Ada'},['p1']],
    [{tagId:'t',query:'Chen'},[]], [{untagged:true,sort:'year'},['p3','p2']],
  ];
  const output=execFileSync('python3',[fileURLToPath(new URL('./search_fixture.py',import.meta.url))],{input:JSON.stringify(cases.map(([filter])=>buildPaperSearch(filter))),encoding:'utf8'});
  const results=JSON.parse(output);
  cases.forEach(([filter,expected],index)=>assert.deepEqual(results[index].map(row=>row.id),expected,JSON.stringify(filter)));
  assert.equal(JSON.parse(results[0][0].tags_json)[0].name,'视觉');
});
