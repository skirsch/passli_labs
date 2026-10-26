import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function page(state,{reply}={}){
 const elements=new Map(),listeners=new Map(),sent=[],navigated=[];
 const element=key=>{if(!elements.has(key))elements.set(key,{innerHTML:'',hidden:false,addEventListener(){},focus(){}});return elements.get(key);};
 const context={document:{querySelector:element,querySelectorAll:()=>[],addEventListener:(event,handler)=>listeners.set(event,handler),hidden:false},location:{pathname:'/',assign:url=>navigated.push(url)},setInterval(){},setTimeout(){},clearTimeout(){},window:{addEventListener(){},open(){assert.fail('Checkout must not open a popup');}},URL,console,
  fetch:async(url,options)=>{sent.push({url,body:JSON.parse(options.body)});return {ok:reply?.ok??true,json:async()=>reply?.body||({state})};}};
 vm.createContext(context);
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 vm.runInContext(source.slice(0,source.lastIndexOf('await refresh().catch('))+`\nstate=${JSON.stringify(state)};render();`,context);
 return {html:element('#app').innerHTML,listeners,sent,navigated,elements};
}

test('settings shows exactly one Link or Unlink Passli action matching current linkage',()=>{
 for(const linked of [false,true]){
  const ui=page({mode:'walkthrough',screen:'settings',account:{id:'account',name:'Account',linked}});
  assert.equal(ui.html.includes('data-action="settings-link"'),!linked);
  assert.equal((ui.html.match(/data-action="(?:settings-link|unlink)"/g)||[]).length,1);
  assert.equal(ui.html.includes('data-action="unlink"'),linked);
 }
});

