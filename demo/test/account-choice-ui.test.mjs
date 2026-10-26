import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function page(state){
 const elements=new Map(),listeners=new Map(),sent=[];
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',hidden:false,addEventListener(){},focus(){}});return elements.get(key);};
 const context={document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(event,handler)=>listeners.set(event,handler),hidden:false},location:{pathname:'/'},setInterval(){},setTimeout(){},clearTimeout(){},window:{addEventListener(){}},URL,console,
  fetch:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({state})};}};
 vm.createContext(context);
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(0,source.lastIndexOf('await refresh().catch('))+`\nstate=${JSON.stringify(state)};render();`,context);
 return {html:element('#app').innerHTML,listeners,sent};
}

test('settings shows exactly one Link or Unlink Passli action matching current linkage',()=>{
 for(const linked of [false,true]){
  const ui=page({mode:'walkthrough',screen:'settings',account:{id:'account',name:'Account',linked}});
  assert.equal(ui.html.includes('data-action="settings-link"'),!linked);
  assert.equal((ui.html.match(/data-action="(?:settings-link|unlink)"/g)||[]).length,1);
  assert.equal(ui.html.includes('data-action="unlink"'),linked);
 }
});

test('account picker escapes account labels and submits explicit membership selection with its current transaction',async()=>{
 const state={mode:'walkthrough',screen:'account-choice',csrf:'csrf',transaction:'choice',accountChoices:[{id:'one',name:'<img src=x>',email:'one@example.test'},{id:'two',name:'Second',email:'two@example.test'}]};
 const ui=page(state);assert.ok(ui.html.includes('Choose your account'));assert.ok(ui.html.includes('&lt;img src=x&gt;'));assert.ok(!ui.html.includes('<img src=x>'));
 ui.listeners.get('click')({target:{closest:selector=>selector==='button[data-action]'?{type:'button',dataset:{action:'select-account',account:'two'}}:null}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.sent.length,1);assert.deepEqual(ui.sent[0],{url:'/api/action',body:{action:'select-account',transaction:'choice',accountId:'two'}});
});
