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

test('Link Passli stays available in both linked and unlinked settings',()=>{
 for(const linked of [false,true]){
  const ui=page({mode:'walkthrough',screen:'settings',account:{id:'account',name:'Account',linked}});
  assert.match(ui.html,/data-action="settings-link"[^>]*>Link Passli<\/button>/);
  assert.equal(ui.html.includes('data-action="unlink"'),linked);
 }
});

for(const redirect of ['https://api.passli.app/direct/login?state=checkout','https://passli.app/?signatureRequest=checkout&signatureReturn=demo'])test('checkout navigates the current page to '+new URL(redirect).hostname+' without a transient popup',async()=>{
 const state={mode:'real',screen:'cart',csrf:'csrf',account:{id:'account'},cart:{quantity:4,totalCents:20000,purchasedCents:0}},ui=page(state,{reply:{body:{state,redirect}}});
 ui.listeners.get('click')({target:{closest:selector=>selector==='button[data-action]'?{type:'button',dataset:{action:'checkout-start'}}:null}});await new Promise(setImmediate);
 assert.deepEqual(ui.navigated,[redirect]);assert.equal(ui.sent[0].body.action,'checkout-start');
});

test('a rejected checkout remains visibly on the cart with an actionable message',async()=>{
 const state={mode:'real',screen:'cart',csrf:'csrf',account:{id:'account'},cart:{quantity:1,totalCents:5000,purchasedCents:0}},ui=page(state,{reply:{ok:false,body:{state,message:'Passli authorization is unavailable. Try again.'}}});
 ui.listeners.get('click')({target:{closest:selector=>selector==='button[data-action]'?{type:'button',dataset:{action:'checkout-start'}}:null}});await new Promise(setImmediate);
 assert.deepEqual(ui.navigated,[]);assert.match(ui.elements.get('#app').innerHTML,/Your cart/);assert.match(ui.elements.get('#notice').textContent,/Try again/);
});

test('account picker escapes account labels and submits explicit membership selection with its current transaction',async()=>{
 const state={mode:'walkthrough',screen:'account-choice',csrf:'csrf',transaction:'choice',accountChoices:[{id:'one',name:'<img src=x>',email:'one@example.test'},{id:'two',name:'Second',email:'two@example.test'}]};
 const ui=page(state);assert.ok(ui.html.includes('Choose your account'));assert.ok(ui.html.includes('&lt;img src=x&gt;'));assert.ok(!ui.html.includes('<img src=x>'));
 ui.listeners.get('click')({target:{closest:selector=>selector==='button[data-action]'?{type:'button',dataset:{action:'select-account',account:'two'}}:null}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(ui.sent.length,1);assert.deepEqual(ui.sent[0],{url:'/api/action',body:{action:'select-account',transaction:'choice',accountId:'two'}});
});
