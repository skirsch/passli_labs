import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {once} from 'node:events';
import {approvalLabel} from '../public/approval-labels.js';
import {wireDetails} from '../suite.mjs';
import {createDemo} from '../server.mjs';

async function renderWire(state={authenticated:true,demo:'wire',csrf:'fixture'}){
 const listeners={},calls=[],requirement={textContent:''};
 const root={html:'',set innerHTML(value){this.html=value;requirement.textContent=value.match(/id="loa"[^>]*>([^<]*)</)?.[1]||'';},get innerHTML(){return this.html;},addEventListener:(name,fn)=>listeners[name]=fn};
 const source=readFileSync(new URL('../public/suite.js',import.meta.url),'utf8').replace("import {approvalLabel} from './approval-labels.js';",'');
 await new Script('(async()=>{'+source+'})()').runInNewContext({approvalLabel,location:{pathname:'/wire/',href:'https://demo.passli.app/wire/'},document:{querySelector:selector=>selector==='#minisite'?root:requirement,body:{}},window:{addEventListener(){}},URL,Intl,fetch:async(path,options)=>{if(options){calls.push(JSON.parse(options.body));return Response.json({pending:true});}return Response.json(state);}});
 return {root,requirement,calls,input:value=>listeners.input({target:{id:'amount',value}}),start:()=>listeners.click({target:{closest:()=>({dataset:{action:'start'}})}})};
}

test('wire amount edits immediately show named approval at both exact thresholds, upward and downward',async()=>{
 const page=await renderWire();assert.equal(page.requirement.textContent,'Face ID');
 assert.match(page.root.html,/Required approval/);assert.match(page.root.html,/aria-live="polite"/);
 assert.match(page.root.html,/Below \$1,000: Mobile app/);assert.match(page.root.html,/Above \$5,000: Face ID\+/);
 for(const [amount,name]of [['0.01','Mobile app'],['999.99','Mobile app'],['1000','Face ID'],['5000.00','Face ID'],['5000.01','Face ID+'],['99999999.99','Face ID+'],['5000','Face ID'],['999.99','Mobile app']]){
  page.input(amount);assert.equal(page.requirement.textContent,name,amount);
  assert.equal(approvalLabel(wireDetails(amount).requiredLoA),name,'UI agrees with server policy');
 }
 page.input('5000.01');page.start();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(page.calls,[{demo:'wire',amount:'5000.01'}],'Send the edited amount; server determines numeric assurance');
 assert.doesNotMatch(page.root.html,/LoA|Level of assurance|Required assurance/);
});

test('wire approval result names required and verified approval without changing receipt numbers',async()=>{
 const receipt={requiredLoA:4,achievedLoA:5},page=await renderWire({authenticated:true,demo:'wire',receipt,wireResult:{amount:'1000.00',outcome:'approved',message:'Verified.'}});
 assert.match(page.root.html,/Required approval: Face ID · Verified approval: Face ID\+/);
 assert.doesNotMatch(page.root.html,/LoA/);assert.deepEqual(receipt,{requiredLoA:4,achievedLoA:5});
 assert.equal(approvalLabel(99),'Unsupported approval requirement');
});

test('demo serves the approval-label module required by the bank page',async t=>{
 const server=createDemo({mode:'real',origin:'https://demo.passli.app'});server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 const response=await fetch('http://127.0.0.1:'+server.address().port+'/approval-labels.js');
 assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/javascript/);assert.match(await response.text(),/export \{approvalLabel\}/);
});
