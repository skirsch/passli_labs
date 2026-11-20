import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('native page dispatches link and unlink, finishes on proof, and refreshes account state',async()=>{
 const elements=new Map(),calls=[],navigations=[],el=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};
 let linked=false,operation,notes='Saved note';
 const state=()=>({csrf:'csrf',account:{id:'local',name:'Demo',notes,linked}});
 const context={document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{open:()=>({location:{replace:url=>navigations.push(url)},close(){}}),addEventListener(){}},fetch:async(path,options)=>{
  const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
  if(path==='/api/northstar/state')value=state();
  if(path==='/api/northstar/action'){if(body.action==='notes-save')notes=body.notes;value=state();}
  if(path==='/api/identity/handoff'){operation=body.operation;value={ticket:'ticket',link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=ticket'};}
  if(path.includes('?wait='))value={stage:'proof'};
  if(path.endsWith('/finish'))linked=operation==='link';
  return {ok:true,json:async()=>value};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),context);
 await new Promise(setImmediate);el('link').onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(calls.find(c=>c.path==='/api/identity/handoff').body.operation,'link');assert.match(el('link-state').textContent,/Linked/);assert.equal(new URL(navigations[0]).origin,'https://passli.app');
 el('unlink').onclick();await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(operation,'unlink');assert.equal(el('link-state').textContent,'Passli is not linked.');assert.equal(el('notes').value,'Saved note');
 el('notes').value='Edited before saving';el('notes').oninput();el('save').onclick();await new Promise(setImmediate);
 assert.equal(calls.find(c=>c.body?.action==='notes-save').body.notes,'Edited before saving');assert.equal(el('notes').value,'Edited before saving');
});

for(const choice of ['create','existing'])test('native UI waits for explicit '+choice+' choice after registration proof',async()=>{
 const elements=new Map(),calls=[],el=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);};let accountChoice=false,account=null,setup=null,ticket=null;
 const state=()=>({csrf:'csrf',account,accountChoice,setup,ticket});
 const context={location:{origin:'https://demo.passli.app'},document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{open:()=>({location:{replace(){}},close(){}}),addEventListener(){}},fetch:async(path,options)=>{
  const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
  if(path==='/api/northstar/state')value=state();
  if(path==='/api/identity/handoff'){ticket='ticket';value={ticket,link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=ticket'};}
  if(path.includes('?wait=')){accountChoice=true;value={stage:'proof',transaction:{operation:'create_account'}};}
  if(path.endsWith('/finish')){assert.equal(body.createAccount,true);accountChoice=false;ticket=null;account={id:'new',name:'Member',notes:'',linked:true};}
  if(path==='/api/northstar/action'&&body.action==='choose-existing'){accountChoice=false;ticket=null;setup='link-existing';value=state();}
  return {ok:true,json:async()=>value};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),context);
 await new Promise(setImmediate);el('login').onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(el('account-choice').hidden,false);assert.equal(el('signed-out').hidden,true);assert.equal(el('approval').hidden,true);assert(!calls.some(c=>c.path.endsWith('/finish')));
 el('choose-'+choice).onclick();await new Promise(setImmediate);
 if(choice==='create'){assert.equal(el('signed-in').hidden,false);assert.equal(calls.filter(c=>c.path.endsWith('/finish')).length,1);}
 else{assert.equal(el('signed-out').hidden,false);assert.equal(el('passli-login').hidden,true);assert.equal(el('signin-heading').textContent,'Sign in to your existing account');assert(!calls.some(c=>c.path.endsWith('/finish')));}
});
