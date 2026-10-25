import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {setTimeout as delay} from 'node:timers/promises';
import {createDemo} from '../server.mjs';

async function fixture(t,{database=':memory:',mode='walkthrough',provider,cleanupInterval=15000}={}) {
  let clock=Date.now();
  const origin='http://127.0.0.1:18766',server=createDemo({origin,database,now:()=>clock,mode,provider,cleanupInterval});server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>server.listening ? new Promise(resolve=>server.close(resolve)) : undefined);
  const base=`http://127.0.0.1:${server.address().port}`;
  function client(initialCookie='') {
    let cookie=initialCookie,state;
    const request=async(path,options={})=>{
      const response=await fetch(base+path,{...options,headers:{Cookie:cookie,...options.headers}});
      if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
      const body=response.status===303?{}:await response.json();if(body.state)state=body.state;else if(path==='/api/state')state=body;
      return {response,body};
    };
    return {get state(){return state;},get cookie(){return cookie;},request,init:()=>request('/api/state'),
      async action(action,extra={}) {return request('/api/action',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Demo-CSRF':state.csrf},body:JSON.stringify({action,transaction:state.transaction,...extra})});},
      async ok(action,extra={}){const r=await this.action(action,extra);assert.equal(r.response.status,200,JSON.stringify(r.body));return r.body;},
      callback(state,code='valid-code'){return request('/auth/passli/callback?'+new URLSearchParams({state,code}),{redirect:'manual'}).catch(error=>{throw error;});},
      approve(identity='demo-alice'){return this.ok('approve',{identity,achievedLoA:4});},
      login(){return this.ok('login',{username:'avery@example.test',password:'demo'});}
    };
  }
  const c=client();await c.init();return {c,client,server,advance(ms){clock+=ms;}};
}

test('first-use linking preserves account and returning login bypasses chooser',async t=>{
  const {c}=await fixture(t);await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'setup');
  assert.equal((await c.request('/api/private')).response.status,401);
  await c.ok('choose-link');await c.ok('link-login',{username:'avery@example.test',password:'demo'});
  assert.equal(c.state.screen,'link-confirm');const before=(await c.request('/api/private')).body;
  await c.ok('confirm-link');await c.approve();assert.equal(c.state.account.linked,true);
  await c.ok('logout');await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'home');
  const after=(await c.request('/api/private')).body;assert.deepEqual(after,before);
});

test('real mode uses provider callbacks, persists cross-browser bindings and rejects simulated approval',async t=>{
  const identity='x'.repeat(43);let providerStatus='active',calls=0;
  const provider={begin(proof){proof.state='state-'+proof.id;return 'https://provider.example/login?state='+proof.state;},async complete(){calls++;return {identity,unlinkVerified:true,association:{subject:identity,grantId:'grant',sessionId:'provider-session',clientId:'demo'}};},async status(){return providerStatus;}};
  const {c,client}=await fixture(t,{mode:'real',provider});
  assert.equal(c.state.mode,'real');assert.equal(c.state.installed,false);
  assert.equal((await c.action('approve',{identity:'demo-alice'})).response.status,403);
  await c.ok('installation',{installed:true});
  const complete=async(c,action)=>{const begin=await c.ok(action);const state=new URL(begin.redirect).searchParams.get('state');assert.equal((await c.callback(state)).response.status,303);await c.init();};
  await complete(c,'passli-start');assert.equal(c.state.screen,'setup');
  await c.ok('choose-link');await c.ok('link-login',{username:'avery@example.test',password:'demo'});
  await complete(c,'confirm-link');assert.equal(c.state.account.linked,true);
  const account=(await c.request('/api/private')).body.accountId;
  await c.ok('logout');const other=client();await other.init();await other.ok('installation',{installed:true});await complete(other,'passli-start');
  assert.equal(other.state.screen,'home');assert.equal((await other.request('/api/private')).body.accountId,account);
  providerStatus='suspended';await other.init();assert.equal(other.state.screen,'suspended');assert.equal((await other.request('/api/private')).response.status,401);
  providerStatus='active';await other.init();assert.equal(other.state.screen,'home');
  await other.ok('settings');await other.ok('unlink-start');await complete(other,'unlink');
  await complete(other,'passli-start');assert.equal(other.state.screen,'setup');assert.equal(calls,5);
});
test('cancelled setup reappears; registration binds a separate account atomically',async t=>{
  const {c}=await fixture(t);await c.login();const original=(await c.request('/api/private')).body.accountId;await c.ok('logout');
  await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('cancel');
  assert.equal((await c.request('/api/private')).response.status,401);
  await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'setup');await c.ok('choose-create');await c.ok('register');
  const transaction=c.state.transaction;await c.approve();assert.equal(c.state.account.name,'Jordan Morgan');
  assert.notEqual((await c.request('/api/private')).body.accountId,original);
  assert.equal((await c.action('approve',{identity:'demo-alice',transaction})).response.status,409);
  assert.equal(c.state.demoAccounts.length,2);
});
test('settings linking rejects an identity already bound elsewhere',async t=>{
  const {c}=await fixture(t);await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('register');await c.approve();
  await c.ok('logout');await c.login();await c.ok('settings');await c.ok('settings-link');
  assert.equal(c.state.screen,'approval');assert.equal(c.state.pendingAction,'link');assert.equal(c.state.account.linked,false);
  assert.equal((await c.action('approve',{identity:'demo-alice'})).response.status,409);assert.equal(c.state.account.linked,false);
  await c.ok('settings-link');await c.approve('demo-bob');assert.equal(c.state.account.linked,true);
});
test('unlink preserves account, invalidates Passli session and never restores binding automatically',async t=>{
  const {c}=await fixture(t);await c.login();const before=(await c.request('/api/private')).body;
  await c.ok('settings-link');await c.approve();await c.ok('logout');await c.ok('passli-start');await c.approve();
  await c.ok('settings');await c.ok('unlink-start');await c.ok('unlink');await c.approve();
  assert.equal(c.state.screen,'login');assert.equal((await c.request('/api/private')).response.status,401);
  await c.login();assert.deepEqual((await c.request('/api/private')).body,before);assert.equal(c.state.account.linked,false);
  await c.ok('logout');await c.ok('passli-start');await c.approve();assert.equal(c.state.screen,'setup');
});
test('suspension denies APIs, wrong identity cannot resume, original deadline survives resume',async t=>{
  const f=await fixture(t),{c}=f;await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('register');await c.approve();
  const before=(await c.request('/api/private')).body;await c.ok('suspend');assert.equal(c.state.account,null);assert.equal((await c.request('/api/private')).response.status,401);
  await c.ok('resume-start');assert.equal((await c.action('approve',{identity:'demo-bob'})).response.status,409);assert.equal(c.state.screen,'suspended');
  f.advance(25*60000);await c.ok('resume-start');await c.approve();assert.deepEqual((await c.request('/api/private')).body,before);
  f.advance(6*60000);await c.init();assert.equal(c.state.screen,'login');assert.equal((await c.request('/api/private')).response.status,401);
});
test('expiry, identity switch, CSRF, installation controls and visitor isolation fail closed',async t=>{
  const f=await fixture(t),{c}=f;
  await c.ok('installation',{installed:false});assert.equal((await c.action('passli-start')).response.status,409);
  await c.ok('installation',{installed:true});await c.ok('passli-start');f.advance(61000);assert.equal((await c.action('approve',{identity:'demo-alice'})).response.status,409);
  await c.ok('passli-start');await c.approve();await c.ok('choose-link');await c.ok('link-login',{username:'avery@example.test',password:'demo'});await c.ok('confirm-link');
  assert.equal((await c.action('approve',{identity:'demo-bob'})).response.status,409);assert.equal(c.state.account.linked,false);
  const stranger=f.client();await stranger.init();assert.equal((await stranger.request('/api/private')).response.status,401);assert.equal(stranger.state.account,null);
  const csrf=await c.request('/api/action',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json','X-Demo-CSRF':c.state.csrf},body:JSON.stringify({action:'logout'})});assert.equal(csrf.response.status,403);
  await c.ok('logout');await c.ok('passli-start');await c.approve();f.advance(301000);assert.equal((await c.action('choose-create')).response.status,409);
});
test('termination/provider failure deny access while keeping bindings',async t=>{
  const {c}=await fixture(t);await c.login();await c.ok('settings-link');await c.approve();await c.ok('logout');
  for(const end of ['terminate','provider-error']) {await c.ok('passli-start');await c.approve();await c.ok(end);assert.equal((await c.request('/api/private')).response.status,401);}
  await c.login();assert.equal(c.state.account.linked,true);
});
test('concurrent replay commits a registration once; SQLite persists visitor bindings',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'passli-demo-'));
  const first=await fixture(t,{database:join(directory,'demo.sqlite')}),{c,client}=first;
  await c.ok('passli-start');await c.approve();await c.ok('choose-create');await c.ok('register');
  const other=client(c.cookie);await other.init();const transaction=c.state.transaction;
  const replies=await Promise.all([c.action('approve',{transaction,identity:'demo-alice'}),other.action('approve',{transaction,identity:'demo-alice'})]);
  assert.equal(replies.filter(r=>r.response.status===200).length,1);
  assert.ok(replies.some(r=>[403,409].includes(r.response.status)));
  const winningCookie=replies[0].response.status===200?c.cookie:other.cookie;
  const reloaded=client(winningCookie);await reloaded.init();assert.equal(reloaded.state.demoAccounts.length,2);assert.equal(reloaded.state.account.linked,true);
  await new Promise(resolve=>first.server.close(resolve));
  const second=await fixture(t,{database:join(directory,'demo.sqlite')}),restored=second.client(winningCookie);await restored.init();
  assert.equal(restored.state.demoAccounts.length,2);assert.equal(restored.state.account.linked,true);
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
});


test('any email with demo can link and unlink; invalid credentials create nothing',async t=>{
  const {c}=await fixture(t);await c.ok('passli-start');await c.approve();await c.ok('choose-link');
  for(const [username,password] of [['someone@example.org','wrong'],['bad address','demo']]) {
    assert.equal((await c.action('link-login',{username,password})).response.status,409);
    assert.equal(c.state.demoAccounts.length,1);
  }
  await c.ok('link-login',{username:'  Any.Person@Example.org  ',password:'demo'});
  assert.equal(c.state.account.email,'any.person@example.org');assert.equal(c.state.screen,'link-confirm');
  const before=(await c.request('/api/private')).body;
  await c.ok('confirm-link');await c.approve();assert.equal(c.state.account.linked,true);
  await c.ok('unlink-start');await c.ok('unlink');await c.approve();
  assert.equal(c.state.account.linked,false);assert.deepEqual((await c.request('/api/private')).body,before);
});

test('fixed account lifetime survives activity and relogin; only expired accounts are forgotten',async t=>{
  const f=await fixture(t),{c}=f;await c.login();const first=(await c.request('/api/private')).body.accountId,deadline=c.state.account.expiresAt;
  f.advance(20*60000);await c.ok('logout');await c.login();assert.equal(c.state.account.expiresAt,deadline);
  await c.ok('logout');await c.ok('login',{username:'later@example.org',password:'demo'});
  f.advance(10*60000);await c.init();assert.equal(c.state.account.email,'later@example.org');assert.equal(c.state.demoAccounts.length,1);
  await c.ok('logout');await c.login();assert.notEqual((await c.request('/api/private')).body.accountId,first);assert.ok(c.state.account.expiresAt>deadline);
});

test('idle cleanup deletes registered accounts and real bindings; returning identity starts setup again',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'passli-expiry-')),database=join(directory,'demo.sqlite');
  const identity='x'.repeat(43),provider={begin(proof){proof.state=proof.id;return 'https://provider.example/?state='+proof.state;},async complete(){return {identity,association:{subject:identity}};},async status(){return 'active';}};
  const f=await fixture(t,{mode:'real',provider,database,cleanupInterval:10}),{c}=f;
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const complete=async(client,action)=>{const r=await client.ok(action);assert.equal((await client.callback(new URL(r.redirect).searchParams.get('state'))).response.status,303);await client.init();};
  await c.ok('installation',{installed:true});await complete(c,'passli-start');await c.ok('choose-create');await complete(c,'register');
  assert.equal(c.state.account.linked,true);const deadline=c.state.account.expiresAt;
  f.advance(29*60000);await c.ok('logout');await complete(c,'passli-start');assert.equal(c.state.account.expiresAt,deadline);
  f.advance(60000);await delay(40);
  const db=new DatabaseSync(database);t.after(()=>{try{db.close();}catch{}});assert.equal(db.prepare('SELECT count(*) AS n FROM bindings').get().n,0);
  const rows=db.prepare('SELECT state FROM visitors').all();assert.ok(rows.every(row=>!row.state.includes('Jordan Morgan')&&!row.state.includes(identity)));db.close();
  assert.equal((await c.request('/api/private')).response.status,401);await c.init();assert.equal(c.state.account,null);assert.equal(c.state.demoAccounts.length,0);
  const other=f.client();await other.init();await other.ok('installation',{installed:true});await complete(other,'passli-start');assert.equal(other.state.screen,'setup');
});


test('unlink has no password bypass and needs a fresh same-identity LoA4 proof; cancellation and expiry preserve binding',async t=>{
 const f=await fixture(t),{c}=f;await c.login();await c.ok('settings-link');await c.approve();
 assert.equal((await c.action('unlink',{username:'avery@example.test',password:'demo'})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink-start');await c.ok('unlink');assert.equal(c.state.screen,'approval');
 assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:3})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink-start');await c.ok('unlink');assert.equal((await c.action('approve',{identity:'demo-bob',achievedLoA:4})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink-start');await c.ok('unlink');const old=c.state.transaction;await c.ok('cancel');assert.equal(c.state.account.linked,true);
 await c.ok('unlink-start');await c.ok('unlink');assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:4,transaction:old})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink-start');await c.ok('unlink');f.advance(61000);assert.equal((await c.action('approve',{identity:'demo-alice',achievedLoA:4})).response.status,409);assert.equal(c.state.account.linked,true);
 await c.ok('unlink-start');await c.ok('unlink');await c.approve();assert.equal(c.state.account.linked,false);
});
