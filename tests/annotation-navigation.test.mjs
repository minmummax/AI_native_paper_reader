import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const result=await build({entryPoints:[fileURLToPath(new URL('../src/pdf/annotationNavigation.ts',import.meta.url))],bundle:true,write:false,format:'esm',platform:'node'});
const {annotationScrollTarget}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const view={page:3,rowHeight:832,pageWidth:600,pageHeight:800,viewportWidth:648,viewportHeight:400,contentWidth:648,contentHeight:8320,rotation:0};

test('different annotation blocks on the same page get distinct scroll targets',()=>{
  const upper=annotationScrollTarget({x:.1,y:.1,width:.2,height:.03,page:3},view);
  const lower=annotationScrollTarget({x:.1,y:.8,width:.2,height:.03,page:3},view);
  assert.equal(upper.top,1568);
  assert.equal(lower.top-upper.top,560);
});
test('rotated, zoomed, horizontally overflowed annotations stay reachable',()=>{
  const target=annotationScrollTarget({x:.8,y:.1,width:.15,height:.05,page:3},{...view,rotation:90,pageWidth:1200,pageHeight:900,contentWidth:1248,rowHeight:932,contentHeight:9320});
  assert.ok(target.left>500);
  assert.ok(target.top>2400);
});
test('first and last page targets are clamped and large areas expose their beginning',()=>{
  const first=annotationScrollTarget({x:0,y:0,width:1,height:1,page:1},{...view,page:1});
  assert.equal(first.top,0);
  const last=annotationScrollTarget({x:0,y:.99,width:.1,height:.01,page:10},{...view,page:10});
  assert.ok(last.top<=view.contentHeight-view.viewportHeight);
});
