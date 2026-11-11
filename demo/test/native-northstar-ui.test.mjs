import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('native page dispatches link and unlink, finishes on proof, and refreshes account state',async()=>{
 const elements=new Map(),calls=[],navigations=[],el=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
 let linked=false,operation;
 const state=()=>({csrf:'csrf',account:{id:'local',name:'Demo',notes:'Saved note',linked}});
 const context={document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{open:()=>({location:{replace:url=>navigations.push(url)},close(){}}),addEventListener(){}},fetch:async(path,options)=>{
  const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
  if(path==='/api/northstar/state')value=state();
  if(path==='/api/identity/handoff'){operation=body.operation;value={ticket:'ticket',link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=ticket'};}
  if(path.includes('?wait='))value={stage:'proof'};
  if(path.endsWith('/finish'))linked=operation==='link';
  return {ok:true,json:async()=>value};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),context);
 await new Promise(setImmediate);el('link').onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(calls.find(c=>c.path==='/api/identity/handoff').body.operation,'link');assert.match(el('link-state').textContent,/Linked/);assert.equal(new URL(navigations[0]).origin,'https://passli.app');
 el('unlink').onclick();await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(operation,'unlink');assert.equal(el('link-state').textContent,'Passli is not linked.');assert.equal(el('notes').value,'Saved note');
});
