import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
test('native page dispatches link and unlink, finishes on proof, and refreshes account state',async()=>{
 const elements=new Map(),calls=[],navigations=[],el=id=>{if(!elements.has(id))elements.set(id,{focus(){}});return elements.get(id);};
 let linked=false,operation,notes='Saved note';
 const state=()=>({csrf:'csrf',account:{id:'local',name:'Demo',notes,linked}});
 const context={location:{origin:'https://demo.passli.app',hash:''},document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{open:()=>({location:{replace:url=>navigations.push(url)},close(){}}),addEventListener(){}},fetch:async(path,options)=>{
  const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
  if(path==='/api/northstar/state')value=state();
  if(path==='/api/northstar/action'){if(body.action==='notes-save')notes=body.notes;value=state();}
  if(path==='/api/identity/handoff'){operation=body.operation;value={ticket:'ticket',link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=ticket'};}
  if(path.includes('?wait='))value={stage:'proof'};
  if(path.endsWith('/finish'))linked=operation==='link';
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),context);
 await new Promise(setImmediate);el('link').onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(calls.find(c=>c.path==='/api/identity/handoff').body.operation,'link');assert.match(el('link-state').textContent,/Linked/);assert.equal(new URL(navigations[0]).origin,'https://passli.app');assert.equal(new URL(navigations[0]).searchParams.has('compactRP'),false);
 assert.equal(el('notes').value,'Saved note');
 el('notes').value='Edited before saving';el('notes').oninput();el('save').onclick();await new Promise(setImmediate);
 assert.equal(calls.find(c=>c.body?.action==='notes-save').body.notes,'Edited before saving');assert.equal(el('notes').value,'Edited before saving');
});

for(const choice of ['create','existing'])test('unregistered Passli identity offers '+choice+' after discovery',async()=>{
 const elements=new Map(),calls=[],navigations=[],el=id=>{if(!elements.has(id))elements.set(id,{focus(){}});return elements.get(id);};let accountChoice=false,account=null,setup=null,ticket=null;
 const state=()=>({csrf:'csrf',account,accountChoice,setup,ticket});
 const context={location:{origin:'https://demo.passli.app'},document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{open:()=>({location:{replace:url=>navigations.push(url)},close(){}}),addEventListener(){}},fetch:async(path,options)=>{
  const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
  if(path==='/api/northstar/state')value=state();
  if(path==='/api/identity/handoff'){ticket='ticket';value={ticket,link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=ticket'};}
  if(path.includes('?wait=')){accountChoice=true;value={stage:'proof',transaction:{operation:'create_account'}};}
  if(path.endsWith('/finish')){assert.equal(body.createAccount,true);accountChoice=false;ticket=null;account={id:'new',name:'Member',notes:'',linked:true};}
  if(path==='/api/northstar/action'&&body.action==='choose-new'){setup='create-new';value=state();}
  if(path==='/api/northstar/action'&&body.action==='choose-existing'){accountChoice=false;ticket=null;setup='link-existing';value=state();}
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),context);
 await new Promise(setImmediate);el('login').onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(el('account-choice').hidden,false);assert.equal(el('signed-out').hidden,true);assert.equal(el('approval').hidden,true);assert.equal(calls.filter(c=>c.path==='/api/identity/handoff').length,1);assert.equal(calls.find(c=>c.path==='/api/identity/handoff').body.operation,'discover');assert(!calls.some(c=>c.path.endsWith('/finish')),'unknown identity requires an explicit account choice');
 el('choose-'+choice).onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 if(choice==='create'){assert.equal(new URL(navigations[0]).searchParams.get('compactRP'),'1');assert.equal(el('signed-in').hidden,false);assert.equal(calls.filter(c=>c.path.endsWith('/finish')).length,1);}
 else{assert.equal(el('signed-out').hidden,false);assert.equal(el('passli-login').hidden,true);assert.equal(el('signin-heading').textContent,'Sign in to your existing account');assert(!calls.some(c=>c.path.endsWith('/finish')));}
});


function unlinkPage({restored=false,hash='',stage='waiting'}={}){
 const elements=new Map(),calls=[],navigations=[],replaced=[];const el=id=>{if(!elements.has(id))elements.set(id,{focus(){}});return elements.get(id)};
 let pending=restored,linked=true;const state=()=>({csrf:'csrf',accountChoice:false,account:{id:'account',name:'Member',notes:'Keep this note',linked},ticket:pending?'same-ticket':null,pendingOperation:pending?'unlink':null});
 const context={location:{origin:'https://demo.passli.app',pathname:'/northstar/',search:'',hash},document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{location:{assign:url=>navigations.push(url)},history:{replaceState:(_s,_t,url)=>replaced.push(url)},open:()=>{throw Error('Unlink must not open a popup')},addEventListener(){}},fetch:async(path,options)=>{
  const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
  if(path==='/api/northstar/state')value=state();
  if(path==='/api/identity/handoff'){pending=true;value={ticket:'same-ticket',link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=same-ticket'};}
  if(path.includes('?wait=')){if(stage==='complete'){pending=false;linked=false;}value={stage,transaction:{operation:'unlink'}};}
  if(path.endsWith('/finish')){assert.equal(stage,'proof');pending=false;linked=false;}
  if(path==='/api/northstar/action'){assert.equal(body.action,'cancel');pending=false;value=state();}
  return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
 }};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),context);
 return {el,calls,navigations,replaced,state};
}
for(const restored of [false,true])test('unlink navigates same tab directly to Passli'+(restored?' for existing pending request':''),async()=>{
 const h=unlinkPage({restored});await new Promise(setImmediate);h.el('unlink').onclick();await new Promise(setImmediate);
 assert.equal(new URL(h.navigations[0]).origin,'https://passli.app');assert.match(new URL(h.navigations[0]).searchParams.get('nativeRP'),/ticket=same-ticket/);assert.equal(h.el('approval').hidden,true);assert.equal(h.calls.filter(c=>c.path==='/api/identity/handoff').length,restored?0:1);assert(!h.calls.some(c=>c.path.includes('?wait=')||c.path.endsWith('/finish')));
});
for(const stage of ['waiting','proof','complete'])test('same-tab return reconciles '+stage+' only through server state',async()=>{
 const h=unlinkPage({restored:true,hash:'#passli-handoff=same-ticket',stage});await new Promise(setImmediate);assert.equal(h.calls.filter(c=>c.path.endsWith('/finish')).length,stage==='proof'?1:0);assert.equal(h.state().account.linked,stage==='waiting');assert.equal(h.state().account.notes,'Keep this note');assert.deepEqual(h.replaced,['/northstar/']);assert.equal(h.navigations.length,0);
});
test('matching cancellation preserves the account and notes without finishing a proof',async()=>{
 const h=unlinkPage({restored:true,hash:'#passli-cancel=same-ticket'});await new Promise(setImmediate);assert.equal(h.state().ticket,null);assert.equal(h.state().account.linked,true);assert.equal(h.state().account.notes,'Keep this note');assert(!h.calls.some(c=>c.path.endsWith('/finish')));
});
for(const hash of ['#passli-handoff=foreign','#passli-cancel=foreign','#passli-cancel=same-ticket&extra=1','#passli-handoff=same-ticket&passli-handoff=foreign'])test('foreign or malformed marker cannot act on pending ticket: '+hash,async()=>{
 const h=unlinkPage({restored:true,hash});await new Promise(setImmediate);assert.deepEqual(h.calls.map(c=>c.path),['/api/northstar/state']);assert.equal(h.state().ticket,'same-ticket');
});
test('stale completed return marker cannot replay a request',async()=>{const h=unlinkPage({hash:'#passli-handoff=same-ticket'});await new Promise(setImmediate);assert.deepEqual(h.calls.map(c=>c.path),['/api/northstar/state']);});

for(const operation of ['discover','login','create_account','link','unlink'])test('restored '+operation+' uses the appropriate Passli presentation',async()=>{
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{focus(){}});return elements.get(id)};
 const state={csrf:'csrf',account:null,ticket:'pending-ticket',pendingOperation:operation};
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),{
  location:{origin:'https://demo.passli.app',hash:''},document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,window:{addEventListener(){}},
  fetch:async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>state})
 });
 await new Promise(setImmediate);
 const url=new URL(el('continue').href);assert.equal(url.origin,'https://passli.app');assert.match(url.searchParams.get('nativeRP'),/ticket=pending-ticket/);
 assert.equal(url.searchParams.get('compactRP'),['discover','login','create_account'].includes(operation)?'1':null);
});

test('sign out then Continue with Passli restores a linked account without a chooser',async()=>{
 const elements=new Map(),calls=[],el=id=>{if(!elements.has(id))elements.set(id,{focus(){}});return elements.get(id)};
 const saved={id:'existing',name:'Member',notes:'Preserved note',linked:true};let account=saved,ticket=null;
 const state=()=>({csrf:'csrf',account,ticket,accountChoice:false,pendingOperation:ticket?'discover':null});
 vm.runInNewContext(readFileSync(new URL('../public/native-northstar.js',import.meta.url),'utf8'),{
  location:{origin:'https://demo.passli.app',hash:''},document:{getElementById:el,querySelectorAll:()=>[]},URLSearchParams,
  window:{open:()=>({location:{replace(){}},close(){}}),addEventListener(){}},fetch:async(path,options)=>{
   const body=options?.body?JSON.parse(options.body):null;calls.push({path,body});let value={};
   if(path==='/api/northstar/state')value=state();
   if(path==='/api/northstar/action'){assert.equal(body.action,'logout');account=null;value=state();}
   if(path==='/api/identity/handoff'){ticket='returning';value={ticket,link:'passli://rp-login?origin=https%3A%2F%2Fdemo.passli.app&ticket=returning'};}
   if(path.includes('?wait='))value={stage:'proof',transaction:{operation:'login'}};
   if(path.endsWith('/finish')){assert.deepEqual(body,{});account=saved;ticket=null;}
   return {ok:true,headers:{get:()=> 'application/json'},json:async()=>value};
  }
 });
 await new Promise(setImmediate);el('logout').onclick();await new Promise(setImmediate);assert.equal(el('signed-out').hidden,false);
 el('login').onclick();await new Promise(setImmediate);await new Promise(setImmediate);
 assert.equal(el('account-choice').hidden,true);assert.equal(el('signed-in').hidden,false);assert.equal(el('notes').value,'Preserved note');assert.equal(calls.filter(c=>c.path.endsWith('/finish')).length,1);assert(!calls.some(c=>['choose-new','choose-existing'].includes(c.body?.action)));
});
