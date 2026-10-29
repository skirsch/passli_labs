import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDemo} from '../server.mjs';
import {createPassli} from '../passli.mjs';
import {qrSvg} from '../qr.mjs';
import jsQR from 'jsqr';
import {mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

async function fixture(t,{mode='real',database=':memory:'}={}){
 let clock=Date.now(),identity='alice',achievedLoA,status='active',completeWait,statusWait,calls=0,onComplete=()=>{};
 const origin='https://demo.passli.app',provider={begin:createPassli({origin}).begin,complete:async proof=>{calls++;onComplete();if(completeWait)await completeWait;return {identity,association:{subject:identity},achievedLoA:achievedLoA??proof.requiredLoA};},status:async()=>{if(statusWait)await statusWait;return status;}};
 const server=createDemo({mode,origin,provider,database,now:()=>clock});server.listen(0,'127.0.0.1');await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
 function browser(){const cookies=new Map();let csrf;
  const request=async(path,body,headers={})=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',redirect:'manual',headers:{Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':csrf}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const item of response.headers.getSetCookie()){const pair=item.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}const text=await response.text();let data;try{data=JSON.parse(text);}catch{}if(data?.csrf)csrf=data.csrf;return {response,data,text};};
  return {request,cookies};
 }
 const tv=browser(),phone=browser();await tv.request('/api/tv/state');
 const start=async()=>{const result=await tv.request('/api/tv/start',{name:'Living room TV'});assert.equal(result.response.status,200);return result.data;};
 const scan=async(ticket,client=phone)=>(await client.request('/api/tv/phone/state?ticket='+ticket)).data;
 const approve=async(ticket,{remember=false,automatic=false,client=phone}={})=>{await scan(ticket,client);const result=await client.request('/api/tv/phone/'+(automatic?'auto':'approve'),{ticket,remember});assert.equal(result.response.status,200,result.text);const parameters=new URL(result.data.redirect).searchParams;return {parameters,finish:()=>client.request('/auth/passli/callback?'+new URLSearchParams({state:parameters.get('state'),code:'test-code'}))};};
 return {server,base,browser,tv,phone,start,scan,approve,advance:ms=>clock+=ms,setIdentity:value=>identity=value,setLoA:value=>achievedLoA=value,setStatus:value=>status=value,waitComplete:value=>completeWait=value,waitStatus:value=>statusWait=value,onComplete:value=>onComplete=value,calls:()=>calls};
}

test('TV Sign in always creates a QR request; TV browser login and public address cannot authorize it',async t=>{
 const f=await fixture(t),first=(await f.tv.request('/api/tv/state')).data,started=await f.start();
 assert.equal(started.authenticated,false);assert.equal(started.pending,true);assert.equal(started.address,first.address);assert.equal(started.redirect,undefined);assert.equal(f.calls(),0);
 const qr=await f.tv.request(started.qrUrl);assert.equal(qr.response.headers.get('content-type'),'image/svg+xml');assert.match(qr.text,/<svg/);
 const other=f.browser();await other.request('/api/tv/state');assert.equal((await other.request(started.qrUrl)).response.status,403);
 const phone=await f.scan(started.ticket);assert.equal(phone.remembered,false);assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
 const legacy=await f.tv.request('/api/demo-suite/state');assert.equal((await f.tv.request('/api/demo-suite/login',{demo:'tv'},{'X-Demo-CSRF':legacy.data.csrf})).response.status,400);
});

test('phone approval requires LoA4, real Direct state and the exact phone cookie; completion is single-use',async t=>{
 const f=await fixture(t),request=await f.start(),approval=await f.approve(request.ticket);
 assert.equal(approval.parameters.get('required_loa'),'4');for(const name of ['state','nonce','code_challenge'])assert.match(approval.parameters.get(name),/^[A-Za-z0-9_-]{43}$/);
 await f.tv.request('/auth/passli/callback?'+new URLSearchParams({state:approval.parameters.get('state'),code:'test-code'}));assert.equal(f.calls(),0);
 const completed=await approval.finish();assert.match(completed.response.headers.get('location'),/^\/tv\/phone\//);assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,true);
 await approval.finish();assert.equal(f.calls(),1);assert.equal((await f.scan(request.ticket)).complete,true);
});

test('remembered TV keeps its address and uses fresh identity proof without another approval; account changes do not inherit trust',async t=>{
 const f=await fixture(t),first=await f.start();await (await f.approve(first.ticket,{remember:true})).finish();
 await f.tv.request('/api/tv/logout',{});const next=await f.start();assert.equal(next.address,first.address);assert.notEqual(next.ticket,first.ticket);assert.equal((await f.scan(next.ticket)).remembered,true);
 const auto=await f.approve(next.ticket,{automatic:true});assert.equal(auto.parameters.get('required_loa'),'1');await auto.finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,true);
 await f.tv.request('/api/tv/logout',{});const changed=await f.start(),wrong=await f.approve(changed.ticket,{automatic:true});f.setIdentity('bob');await wrong.finish();
 assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);assert.equal((await f.scan(changed.ticket)).remembered,false);
 const explicit=await f.approve(changed.ticket);assert.equal(explicit.parameters.get('required_loa'),'4');await explicit.finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,true);
});

test('unremembered phone, stolen QR, CSRF errors, insufficient assurance and inactive grants never sign in a TV',async t=>{
 const f=await fixture(t),request=await f.start();await f.scan(request.ticket);
 assert.equal((await f.phone.request('/api/tv/phone/auto',{ticket:request.ticket})).response.status,400);
 assert.equal((await f.phone.request('/api/tv/phone/approve',{ticket:request.ticket},{Origin:'https://attacker.test'})).response.status,403);
 assert.equal((await f.phone.request('/api/tv/phone/approve',{ticket:request.ticket},{'X-Demo-CSRF':'wrong'})).response.status,403);
 f.setLoA(1);await (await f.approve(request.ticket)).finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
 f.setLoA(4);f.setStatus('suspended');await (await f.approve(request.ticket)).finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
});

test('expiry, replacement and cancellation invalidate QR tickets and pending callbacks',async t=>{
 const f=await fixture(t),expired=await f.start(),a=await f.approve(expired.ticket);f.advance(180001);await a.finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
 const replaced=await f.start(),old=await f.approve(replaced.ticket);await f.start();await old.finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
 const cancelled=await f.start(),pending=await f.approve(cancelled.ticket);await f.tv.request('/api/tv/cancel',{});await pending.finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
});

for(const revoke of ['forget','reset'])test(revoke+' from TV revokes trust and rejects approval already in flight',async t=>{
 const f=await fixture(t),first=await f.start();await (await f.approve(first.ticket,{remember:true})).finish();await f.tv.request('/api/tv/logout',{});
 const next=await f.start(),approval=await f.approve(next.ticket,{automatic:true});let release;f.waitComplete(new Promise(resolve=>release=resolve));
 let entered;const started=new Promise(resolve=>entered=resolve);f.onComplete(entered);const completing=approval.finish();await started;await f.tv.request('/api/tv/'+revoke,{});release();await completing;
 assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);f.waitComplete(null);const after=await f.start();assert.equal(after.address,first.address);assert.equal((await f.scan(after.ticket)).remembered,false);
});

test('Reset Demo returns a remembered TV to explicit phone approval, then remembered scans work again',async t=>{
 const f=await fixture(t),first=await f.start();await (await f.approve(first.ticket,{remember:true})).finish();assert.equal((await f.tv.request('/api/tv/state')).data.remembered,true);
 assert.equal((await f.tv.request('/api/tv/reset',{},{Origin:'https://attacker.test'})).response.status,403);assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,true);
 const reset=await f.tv.request('/api/tv/reset',{});assert.equal(reset.response.status,200);assert.equal(reset.data.address,first.address);assert.equal(reset.data.authenticated,false);assert.equal(reset.data.pending,false);assert.match(reset.data.message,/explicit approval/);
 const next=await f.start();assert.equal((await f.scan(next.ticket)).remembered,false);assert.equal((await f.phone.request('/api/tv/phone/auto',{ticket:next.ticket})).response.status,400);
 const explicit=await f.approve(next.ticket,{remember:true});assert.equal(explicit.parameters.get('required_loa'),'4');await explicit.finish();await f.tv.request('/api/tv/logout',{});
 const later=await f.start();assert.equal((await f.scan(later.ticket)).remembered,true);const auto=await f.approve(later.ticket,{automatic:true});assert.equal(auto.parameters.get('required_loa'),'1');await auto.finish();assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,true);
});

test('remembering is opt-in, expires after 30 days, and can be removed by the phone',async t=>{
 const f=await fixture(t),first=await f.start();await (await f.approve(first.ticket)).finish();await f.tv.request('/api/tv/logout',{});const next=await f.start();assert.equal((await f.scan(next.ticket)).remembered,false);
 await (await f.approve(next.ticket,{remember:true})).finish();await f.phone.request('/api/tv/phone/forget',{ticket:next.ticket});assert.equal((await f.tv.request('/api/tv/state')).data.remembered,false);await f.tv.request('/api/tv/logout',{});const third=await f.start();assert.equal((await f.scan(third.ticket)).remembered,false);
 await (await f.approve(third.ticket,{remember:true})).finish();f.advance(30*86400000+1);const final=await f.start();assert.equal(final.address,first.address);assert.equal((await f.scan(final.ticket)).remembered,false);
});

test('TV receives completion through SSE and hidden session state is revalidated on authenticated reads',async t=>{
 const f=await fixture(t),request=await f.start();
 const stream=await fetch(f.base+'/api/tv/events',{headers:{Cookie:[...f.tv.cookies].map(([k,v])=>k+'='+v).join('; ')}});assert.equal(stream.headers.get('content-type'),'text/event-stream');const reader=stream.body.getReader();await reader.read();
 await (await f.approve(request.ticket)).finish();const event=new TextDecoder().decode((await reader.read()).value);assert.match(event,/"authenticated":true/);await reader.cancel();
 f.setStatus('terminated');assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
});

test('cancelling a remembered-phone authentication pauses automatic redirects rather than looping',async t=>{
 const f=await fixture(t),first=await f.start();await (await f.approve(first.ticket,{remember:true})).finish();await f.tv.request('/api/tv/logout',{});
 const next=await f.start(),approval=await f.approve(next.ticket,{automatic:true});assert.equal((await f.scan(next.ticket)).automatic,false,'in-flight proof is not restarted by a page refresh');
 await f.phone.request('/auth/passli/callback?'+new URLSearchParams({state:approval.parameters.get('state'),error:'access_denied'}));
 const state=await f.scan(next.ticket);assert.equal(state.remembered,true);assert.equal(state.automatic,false);assert.match(state.message,/cancelled/);assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
});

test('server shutdown closes the TV event channel instead of waiting forever for SSE clients',async t=>{
 const f=await fixture(t);const stream=await fetch(f.base+'/api/tv/events',{headers:{Cookie:[...f.tv.cookies].map(([k,v])=>k+'='+v).join('; ')}}),reader=stream.body.getReader();await reader.read();
 const closing=new Promise(resolve=>f.server.close(resolve));assert.equal((await reader.read()).done,true);await closing;
});

test('TV address and remembered identity survive a service restart with the same SQLite database',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'passli-tv-')),database=join(directory,'tv.sqlite'),first=await fixture(t,{database}),request=await first.start();
 await (await first.approve(request.ticket,{remember:true})).finish();await first.tv.request('/api/tv/logout',{});await new Promise(resolve=>first.server.close(resolve));
 const second=await fixture(t,{database});second.tv.cookies.clear();for(const [key,value]of first.tv.cookies)second.tv.cookies.set(key,value);for(const [key,value]of first.phone.cookies)second.phone.cookies.set(key,value);
 await second.tv.request('/api/tv/state');const next=await second.start();assert.equal(next.address,request.address);assert.equal((await second.scan(next.ticket)).remembered,true);
 await (await second.approve(next.ticket,{automatic:true})).finish();assert.equal((await second.tv.request('/api/tv/state')).data.authenticated,true);
 t.after(async()=>{for(const suffix of ['','-wal','-shm'])try{await unlink(database+suffix);}catch(error){if(error.code!=='ENOENT')throw error;}await rmdir(directory);});
});

test('generated SVG QR decodes to the exact fresh phone URL with an independent decoder',()=>{
 const value='https://demo.passli.app/tv/phone/?ticket='+'a'.repeat(43),svg=qrSvg(value),modules=Number(svg.match(/viewBox="0 0 (\d+)/)[1]),scale=6,size=modules*scale,data=new Uint8ClampedArray(size*size*4).fill(255);
 for(const match of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)){const [x,y,width]=match.slice(1).map(Number);for(let row=y*scale;row<(y+1)*scale;row++)for(let col=x*scale;col<(x+width)*scale;col++){const at=(row*size+col)*4;data[at]=data[at+1]=data[at+2]=0;}}
 assert.equal(jsQR(data,size,size)?.data,value);assert.ok(!svg.includes(value),'URL is encoded in pixels, not embedded as untrusted markup');
});

test('walkthrough can display a QR but cannot authenticate or remember a real TV',async t=>{
 const f=await fixture(t,{mode:'walkthrough'}),request=await f.start();await f.scan(request.ticket);assert.equal((await f.phone.request('/api/tv/phone/approve',{ticket:request.ticket,remember:true})).response.status,400);assert.equal((await f.tv.request('/api/tv/state')).data.authenticated,false);
});
