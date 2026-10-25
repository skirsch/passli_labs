import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('visible Passli session polls into suspension, removes private context, and never starts recovery pushes',async()=>{
 const elements=new Map(),element=selector=>{if(!elements.has(selector))elements.set(selector,{innerHTML:'',addEventListener(){},focus(){}});return elements.get(selector);};
 const document={hidden:false,querySelector:element,querySelectorAll:()=>[],addEventListener(){}};
 let timer,reads=0,suspended=false;
 const active={mode:'real',modeLabel:'Test',installed:true,csrf:'test',screen:'home',sessionMethod:'passli',demoAccounts:[],account:{id:'test',name:'Test account',email:'test@example.test',notes:'private saved context',expiresAt:Date.now()+1800000,linked:true}};
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 await vm.runInNewContext(`(async()=>{${source}\nreturn {send};})()`,{document,window:{addEventListener(){},dispatchEvent(){}},location:{pathname:'/',origin:'https://demo.test'},Event,Date,console,setInterval:fn=>{timer=fn;return 1;},setTimeout:()=>1,clearTimeout(){},fetch:async()=>{reads++;return {ok:true,json:async()=>({...active,...(suspended?{screen:'suspended',account:null}:{})})};}});
 assert.match(element('#app').innerHTML,/private saved context/);
 const before=reads;suspended=true;timer();await new Promise(setImmediate);
 assert.ok(reads>before);assert.match(element('#app').innerHTML,/Disabled devices/);assert.doesNotMatch(element('#app').innerHTML,/private saved context|resume-start|Open Passli/);
 document.hidden=true;const hiddenReads=reads;timer();await new Promise(setImmediate);assert.equal(reads,hiddenReads);
});
