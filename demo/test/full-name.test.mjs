import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('home greets the full authorized name, safely escaping it and handling absent names',()=>{
 const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 for(const [name,expected]of [['Steve Kirsch','Welcome Steve Kirsch!'],['<img src=x onerror=alert(1)>','Welcome &lt;img src=x onerror=alert(1)&gt;!'],[undefined,'Welcome!'],['','Welcome!']]){
  const elements=new Map();const element=key=>{if(!elements.has(key))elements.set(key,{className:'',textContent:'',value:'',hidden:false,disabled:false,innerHTML:'',addEventListener(){},querySelectorAll(){return []}});return elements.get(key)};
  const context={document:{querySelector:element,addEventListener(){},hidden:false},location:{pathname:'/'},setInterval(){},clearTimeout(){},setTimeout(){},fetch:()=>new Promise(()=>{}),window:{addEventListener(){}},navigator:{},URL,console};
  vm.createContext(context);vm.runInContext(source.replace(/^await refresh\(\)\.catch\(/m, 'refresh().catch(')+`\nstate={screen:'home',mode:'walkthrough',installed:true,account:{id:'test',name:${JSON.stringify(name)||'undefined'}}};render();`,context);
  assert.ok(element('#app').innerHTML.includes('<h1>'+expected+'</h1>'),expected);
 }
});
