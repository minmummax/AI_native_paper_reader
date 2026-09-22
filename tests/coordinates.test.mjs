import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = await readFile(new URL('../src/lib/coordinates.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { normalizeRect, rotateRect, serializeRects } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('normalized rects stay independent of zoom and backing pixel ratio', () => {
  const a=normalizeRect({x:60,y:80,width:120,height:40},600,800,3);
  const b=normalizeRect({x:120,y:160,width:240,height:80},1200,1600,3);
  assert.deepEqual(a,b);
  assert.equal(JSON.parse(serializeRects([a],3))[0].page,3);
});
test('all four rotations round-trip rectangles, including edge-aligned areas', () => {
  for(const rect of [{x:0.1,y:0.2,width:0.3,height:0.1,page:1},{x:0,y:0,width:1,height:1,page:2}]) {
    for(const rotation of [0,90,180,270]) {
      const restored=rotateRect(rotateRect(rect,rotation),-rotation);
      for(const key of ['x','y','width','height']) assert.ok(Math.abs(rect[key]-restored[key])<1e-12);
    }
  }
});
test('invalid pixel coordinates, dimensions, pages and mismatched anchors are rejected', () => {
  assert.throws(()=>normalizeRect({x:0,y:0,width:1,height:1},0,100,1));
  assert.throws(()=>serializeRects([{x:100,y:0,width:10,height:1,page:1}],1));
  assert.throws(()=>serializeRects([{x:0,y:0,width:0.2,height:0.1,page:2}],1));
  assert.throws(()=>serializeRects([{x:NaN,y:0,width:0.2,height:0.1,page:1}],1));
  assert.throws(()=>serializeRects([],1));
});

const {mergeTextRects}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
test('overlapping font/span bounds on one line produce exactly one underline baseline',()=>{
  const rects=[
    {x:0.1,y:0.1,width:0.2,height:0.02,page:1},
    {x:0.1,y:0.101,width:0.2,height:0.021,page:1},
    {x:0.3,y:0.1,width:0.08,height:0.02,page:1},
  ];
  const merged=mergeTextRects(rects);
  assert.equal(merged.length,1);
  assert.ok(Math.abs(merged[0].width-0.28)<1e-12);
  assert.equal(rects.length,3,'input is never mutated');
});
test('text coalescing does not bridge adjacent lines, separate columns, or pages',()=>{
  const rows=[
    {x:0.1,y:0.1,width:0.2,height:0.02,page:1},
    {x:0.1,y:0.13,width:0.2,height:0.02,page:1},
    {x:0.6,y:0.1,width:0.2,height:0.02,page:1},
    {x:0.1,y:0.1,width:0.2,height:0.02,page:2},
  ];
  assert.equal(mergeTextRects(rows).length,4);
  const vertical=rows.slice(0,1).flatMap(rect=>[rotateRect(rect,90),rotateRect({...rect,y:0.101},90)]);
  assert.equal(mergeTextRects(vertical,90).length,1);
});
